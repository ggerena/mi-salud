import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAuthService } from '../../src/application/auth.ts';
import { AccessDeniedError, AuthFlowError } from '../../src/domain/identity.ts';
import { unwrapDataKey } from '../../src/infrastructure/crypto/aead.ts';
import { FakeOidcProvider } from '../../src/infrastructure/oidc/fake.ts';
import { insertAllowlist, openCatalog } from '../../src/infrastructure/sqlite/catalog.ts';
import { SystemClock } from '../../src/shared/clock.ts';
import { SYNTHETIC_MASTER_KEY } from '../fixtures/keys.ts';

const masterKey = Buffer.from(SYNTHETIC_MASTER_KEY, 'hex');
const redirectUri = 'http://127.0.0.1:8080/oidc/callback';
const personaA = {
  iss: 'https://accounts.google.com',
  sub: 'sintetico-sub-a',
  email: 'a@example.invalid',
};
const personaB = {
  iss: 'https://accounts.google.com',
  sub: 'sintetico-sub-b',
  email: 'b@example.invalid',
};

function harness(identity = personaA) {
  const root = mkdtempSync(join(tmpdir(), 'misalud-'));
  const db = openCatalog(join(root, 'catalog.sqlite'));
  const oidc = new FakeOidcProvider(identity, redirectUri);
  const auth = createAuthService({
    db,
    oidc,
    redirectUri,
    masterKey,
    dataDir: join(root, 'data'),
    objectsDir: join(root, 'objects'),
    sessionTtlMs: 60_000,
    clock: new SystemClock(),
  });
  return { db, auth, root };
}

describe('alta, sesion y aislamiento de bovedas', () => {
  it('el primer Google valido crea cuenta; el segundo no entra sin allowlist', async () => {
    const a = harness(personaA);
    const start = await a.auth.startLogin();
    const first = await a.auth.completeLogin(start.authorizationUrl);
    expect(first.isNew).toBe(true);
    const b = createAuthService({
      db: a.db,
      oidc: new FakeOidcProvider(personaB, redirectUri),
      redirectUri,
      masterKey,
      dataDir: join(a.root, 'data'),
      objectsDir: join(a.root, 'objects'),
      sessionTtlMs: 60_000,
      clock: new SystemClock(),
    });
    const startB = await b.startLogin();
    await expect(b.completeLogin(startB.authorizationUrl)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
    insertAllowlist(a.db, personaB.iss, personaB.sub, new SystemClock());
    const startB2 = await b.startLogin();
    const second = await b.completeLogin(startB2.authorizationUrl);
    expect(second.account.sub).toBe(personaB.sub);
  });

  it('rechaza state o code alterados', async () => {
    const { auth } = harness();
    const start = await auth.startLogin();
    const badState = new URL(start.authorizationUrl);
    badState.searchParams.set('state', '00'.repeat(32));
    await expect(auth.completeLogin(badState)).rejects.toBeInstanceOf(AuthFlowError);
    const badCode = new URL(start.authorizationUrl);
    badCode.searchParams.set('code', 'otro');
    await expect(auth.completeLogin(badCode)).rejects.toBeInstanceOf(AuthFlowError);
  });

  it('una cuenta no abre la boveda de otra y las claves quedan envueltas', async () => {
    const h = harness(personaA);
    const start = await h.auth.startLogin();
    const { token, account } = await h.auth.completeLogin(start.authorizationUrl);
    const { vault } = h.auth.acceptConsent(token);
    expect(vault.accountId).toBe(account.id);
    const opened = unwrapDataKey({
      masterKey,
      wrapped: vault.wrapped,
      aad: Buffer.from(`v1|vault|${vault.id}|data-key`, 'utf8'),
    });
    expect(opened).toHaveLength(32);
    insertAllowlist(h.db, personaB.iss, personaB.sub, new SystemClock());
    const other = createAuthService({
      db: h.db,
      oidc: new FakeOidcProvider(personaB, redirectUri),
      redirectUri,
      masterKey,
      dataDir: join(h.root, 'data'),
      objectsDir: join(h.root, 'objects'),
      sessionTtlMs: 60_000,
      clock: new SystemClock(),
    });
    const startB = await other.startLogin();
    const loginB = await other.completeLogin(startB.authorizationUrl);
    const pageB = other.accountPage(loginB.token);
    expect(pageB.vaultId).toBeNull();
    expect(h.auth.accountPage(token).vaultId).toBe(vault.id);
  });

  it('cerrar sesion impide reutilizar el token', async () => {
    const { auth } = harness();
    const start = await auth.startLogin();
    const { token } = await auth.completeLogin(start.authorizationUrl);
    auth.logout(token);
    expect(auth.readSession(token)).toBeNull();
    expect(() => auth.accountPage(token)).toThrow(AuthFlowError);
  });
});
