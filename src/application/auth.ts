import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  AccessDeniedError,
  AuthFlowError,
  CONSENT_VERSION,
  type ExternalIdentity,
} from '../domain/identity.ts';
import type { OidcProvider } from '../infrastructure/oidc/port.ts';
import {
  type CatalogAccount,
  type CatalogVault,
  countAccounts,
  createAccount,
  createSession,
  createVault,
  findAccountByIssSub,
  findValidSession,
  findVaultByAccount,
  isAllowlisted,
  latestConsentVersion,
  recordConsent,
  revokeSession,
  saveOidcFlow,
  takeOidcFlow,
} from '../infrastructure/sqlite/catalog.ts';
import type { Clock } from '../shared/clock.ts';

const OIDC_FLOW_TTL_MS = 10 * 60 * 1000;

export interface AuthService {
  startLogin(): Promise<{ authorizationUrl: URL }>;
  completeLogin(
    currentUrl: URL,
  ): Promise<{ token: string; account: CatalogAccount; isNew: boolean }>;
  readSession(token: string | undefined): { account: CatalogAccount; sessionId: string } | null;
  logout(token: string | undefined): void;
  acceptConsent(token: string | undefined): { account: CatalogAccount; vault: CatalogVault };
  accountPage(token: string | undefined): {
    account: CatalogAccount;
    consentVersion: string | null;
    vaultId: string | null;
    sessionId: string;
  };
}

export function createAuthService(deps: {
  db: DatabaseSync;
  oidc: OidcProvider;
  redirectUri: string;
  masterKey: Buffer;
  dataDir: string;
  objectsDir: string;
  sessionTtlMs: number;
  clock: Clock;
}): AuthService {
  const { db, oidc, redirectUri, masterKey, dataDir, objectsDir, sessionTtlMs, clock } = deps;

  function requireSession(token: string | undefined) {
    if (token === undefined || token === '') {
      throw new AuthFlowError('Se requiere sesion.');
    }
    const found = findValidSession(db, token, clock);
    if (found === null) {
      throw new AuthFlowError('Sesion invalida o vencida.');
    }
    return found;
  }

  return {
    async startLogin() {
      const state = randomBytes(32).toString('hex');
      const nonce = randomBytes(32).toString('hex');
      const codeVerifier = randomBytes(32).toString('base64url');
      saveOidcFlow(db, {
        state,
        nonce,
        codeVerifier,
        expiresAt: new Date(clock.now().getTime() + OIDC_FLOW_TTL_MS),
      });
      const authorizationUrl = await Promise.resolve(
        oidc.authorizationUrl({ state, nonce, codeVerifier, redirectUri }),
      );
      return { authorizationUrl };
    },

    async completeLogin(currentUrl: URL) {
      const state = currentUrl.searchParams.get('state');
      if (state === null || state === '') {
        throw new AuthFlowError('Falta state en el callback.');
      }
      const flow = takeOidcFlow(db, state, clock);
      if (flow === null) {
        throw new AuthFlowError('state OIDC desconocido o vencido.');
      }
      const identity: ExternalIdentity = await oidc.exchangeAuthorizationCode({
        currentUrl,
        expectedState: state,
        expectedNonce: flow.nonce,
        codeVerifier: flow.codeVerifier,
      });
      let account = findAccountByIssSub(db, identity.iss, identity.sub);
      let isNew = false;
      if (account === null) {
        const bootstrap = countAccounts(db) === 0;
        if (!bootstrap && !isAllowlisted(db, identity.iss, identity.sub)) {
          throw new AccessDeniedError();
        }
        account = createAccount(db, {
          iss: identity.iss,
          sub: identity.sub,
          emailDisplay: identity.email,
          clock,
        });
        isNew = true;
      }
      const { token } = createSession(db, { accountId: account.id, ttlMs: sessionTtlMs, clock });
      return { token, account, isNew };
    },

    readSession(token) {
      if (token === undefined || token === '') {
        return null;
      }
      const found = findValidSession(db, token, clock);
      if (found === null) {
        return null;
      }
      return { account: found.account, sessionId: found.session.id };
    },

    logout(token) {
      if (token === undefined || token === '') {
        return;
      }
      const found = findValidSession(db, token, clock);
      if (found !== null) {
        revokeSession(db, found.session.id, clock);
      }
    },

    acceptConsent(token) {
      const { account } = requireSession(token);
      recordConsent(db, account.id, CONSENT_VERSION, clock);
      const existing = findVaultByAccount(db, account.id);
      if (existing !== null) {
        return { account, vault: existing };
      }
      const vault = createVault(db, {
        accountId: account.id,
        dataDir,
        objectsDir,
        masterKey,
        clock,
      });
      return { account, vault };
    },

    accountPage(token) {
      const { account, session } = requireSession(token);
      const vault = findVaultByAccount(db, account.id);
      return {
        account,
        consentVersion: latestConsentVersion(db, account.id),
        vaultId: vault?.id ?? null,
        sessionId: session.id,
      };
    },
  };
}
