import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Clock } from '../../shared/clock.ts';
import { newId } from '../../shared/ids.ts';
import { generateDataKey, type WrappedKey, wrapDataKey } from '../crypto/aead.ts';
import { runMigrations } from './migrate.ts';

export interface CatalogAccount {
  id: string;
  iss: string;
  sub: string;
  emailDisplay: string | null;
  createdAt: string;
}

export interface CatalogSession {
  id: string;
  accountId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface CatalogVault {
  id: string;
  accountId: string;
  sqlitePath: string;
  objectsPath: string;
  wrapped: WrappedKey;
  createdAt: string;
}

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    iss TEXT NOT NULL,
    sub TEXT NOT NULL,
    email_display TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (iss, sub)
  );`,
  `CREATE TABLE IF NOT EXISTS allowlist (
    iss TEXT NOT NULL,
    sub TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (iss, sub)
  );`,
  `CREATE TABLE IF NOT EXISTS consents (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    version TEXT NOT NULL,
    accepted_at TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  );`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  );`,
  `CREATE TABLE IF NOT EXISTS vaults (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL UNIQUE,
    sqlite_path TEXT NOT NULL,
    objects_path TEXT NOT NULL,
    key_version INTEGER NOT NULL,
    key_id TEXT NOT NULL,
    nonce BLOB NOT NULL,
    ciphertext BLOB NOT NULL,
    auth_tag BLOB NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  );`,
  `CREATE TABLE IF NOT EXISTS oidc_flows (
    state TEXT PRIMARY KEY,
    nonce TEXT NOT NULL,
    code_verifier TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );`,
];

export function openCatalog(dbPath: string): DatabaseSync {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  runMigrations(db, MIGRATIONS);
  return db;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function countAccounts(db: DatabaseSync): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number };
  return row.n;
}

export function findAccountByIssSub(
  db: DatabaseSync,
  iss: string,
  sub: string,
): CatalogAccount | null {
  const row = db
    .prepare(
      'SELECT id, iss, sub, email_display, created_at FROM accounts WHERE iss = ? AND sub = ?',
    )
    .get(iss, sub) as
    | { id: string; iss: string; sub: string; email_display: string | null; created_at: string }
    | undefined;
  if (row === undefined) {
    return null;
  }
  return {
    id: row.id,
    iss: row.iss,
    sub: row.sub,
    emailDisplay: row.email_display,
    createdAt: row.created_at,
  };
}

export function isAllowlisted(db: DatabaseSync, iss: string, sub: string): boolean {
  const row = db.prepare('SELECT 1 AS ok FROM allowlist WHERE iss = ? AND sub = ?').get(iss, sub) as
    | { ok: number }
    | undefined;
  return row !== undefined;
}

export function insertAllowlist(db: DatabaseSync, iss: string, sub: string, clock: Clock): void {
  db.prepare('INSERT OR IGNORE INTO allowlist (iss, sub, created_at) VALUES (?, ?, ?)').run(
    iss,
    sub,
    clock.now().toISOString(),
  );
}

export function createAccount(
  db: DatabaseSync,
  input: { iss: string; sub: string; emailDisplay: string | null; clock: Clock },
): CatalogAccount {
  const id = newId();
  const createdAt = input.clock.now().toISOString();
  db.prepare(
    'INSERT INTO accounts (id, iss, sub, email_display, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, input.iss, input.sub, input.emailDisplay, createdAt);
  return { id, iss: input.iss, sub: input.sub, emailDisplay: input.emailDisplay, createdAt };
}

export function recordConsent(
  db: DatabaseSync,
  accountId: string,
  version: string,
  clock: Clock,
): void {
  db.prepare('INSERT INTO consents (id, account_id, version, accepted_at) VALUES (?, ?, ?, ?)').run(
    newId(),
    accountId,
    version,
    clock.now().toISOString(),
  );
}

export function latestConsentVersion(db: DatabaseSync, accountId: string): string | null {
  const row = db
    .prepare('SELECT version FROM consents WHERE account_id = ? ORDER BY accepted_at DESC LIMIT 1')
    .get(accountId) as { version: string } | undefined;
  return row?.version ?? null;
}

export function createSession(
  db: DatabaseSync,
  input: { accountId: string; ttlMs: number; clock: Clock },
): { session: CatalogSession; token: string } {
  const token = randomBytes(32).toString('hex');
  const id = newId();
  const createdAt = input.clock.now();
  const expiresAt = new Date(createdAt.getTime() + input.ttlMs);
  const tokenHash = hashSessionToken(token);
  db.prepare(
    'INSERT INTO sessions (id, account_id, token_hash, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)',
  ).run(id, input.accountId, tokenHash, createdAt.toISOString(), expiresAt.toISOString());
  return {
    token,
    session: {
      id,
      accountId: input.accountId,
      tokenHash,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      revokedAt: null,
    },
  };
}

export function findValidSession(
  db: DatabaseSync,
  token: string,
  clock: Clock,
): { session: CatalogSession; account: CatalogAccount } | null {
  const tokenHash = hashSessionToken(token);
  const row = db
    .prepare(
      `SELECT s.id, s.account_id, s.token_hash, s.created_at, s.expires_at, s.revoked_at,
              a.iss, a.sub, a.email_display, a.created_at AS account_created_at
       FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = ?`,
    )
    .get(tokenHash) as
    | {
        id: string;
        account_id: string;
        token_hash: string;
        created_at: string;
        expires_at: string;
        revoked_at: string | null;
        iss: string;
        sub: string;
        email_display: string | null;
        account_created_at: string;
      }
    | undefined;
  if (row === undefined) {
    return null;
  }
  if (row.revoked_at !== null) {
    return null;
  }
  if (new Date(row.expires_at).getTime() <= clock.now().getTime()) {
    return null;
  }
  return {
    session: {
      id: row.id,
      accountId: row.account_id,
      tokenHash: row.token_hash,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    },
    account: {
      id: row.account_id,
      iss: row.iss,
      sub: row.sub,
      emailDisplay: row.email_display,
      createdAt: row.account_created_at,
    },
  };
}

export function revokeSession(db: DatabaseSync, sessionId: string, clock: Clock): void {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(
    clock.now().toISOString(),
    sessionId,
  );
}

export function revokeAllSessions(db: DatabaseSync, accountId: string, clock: Clock): void {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL').run(
    clock.now().toISOString(),
    accountId,
  );
}

export function findVaultByAccount(db: DatabaseSync, accountId: string): CatalogVault | null {
  const row = db
    .prepare(
      `SELECT id, account_id, sqlite_path, objects_path, key_version, key_id, nonce, ciphertext, auth_tag, created_at
       FROM vaults WHERE account_id = ?`,
    )
    .get(accountId) as
    | {
        id: string;
        account_id: string;
        sqlite_path: string;
        objects_path: string;
        key_version: number;
        key_id: string;
        nonce: Buffer | Uint8Array;
        ciphertext: Buffer | Uint8Array;
        auth_tag: Buffer | Uint8Array;
        created_at: string;
      }
    | undefined;
  if (row === undefined) {
    return null;
  }
  return {
    id: row.id,
    accountId: row.account_id,
    sqlitePath: row.sqlite_path,
    objectsPath: row.objects_path,
    createdAt: row.created_at,
    wrapped: {
      version: row.key_version,
      keyId: row.key_id,
      nonce: Buffer.from(row.nonce),
      ciphertext: Buffer.from(row.ciphertext),
      authTag: Buffer.from(row.auth_tag),
    },
  };
}

export function createVault(
  db: DatabaseSync,
  input: {
    accountId: string;
    dataDir: string;
    objectsDir: string;
    masterKey: Buffer;
    clock: Clock;
  },
): CatalogVault {
  const id = newId();
  const sqlitePath = join(input.dataDir, 'vaults', id, 'vault.sqlite');
  const objectsPath = join(input.objectsDir, id);
  mkdirSync(dirname(sqlitePath), { recursive: true });
  mkdirSync(objectsPath, { recursive: true });
  const dataKey = generateDataKey();
  const wrapped = wrapDataKey({
    masterKey: input.masterKey,
    dataKey,
    aad: Buffer.from(`v1|vault|${id}|data-key`, 'utf8'),
  });
  const createdAt = input.clock.now().toISOString();
  db.prepare(
    `INSERT INTO vaults (id, account_id, sqlite_path, objects_path, key_version, key_id, nonce, ciphertext, auth_tag, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.accountId,
    sqlitePath,
    objectsPath,
    wrapped.version,
    wrapped.keyId,
    wrapped.nonce,
    wrapped.ciphertext,
    wrapped.authTag,
    createdAt,
  );
  dataKey.fill(0);
  return { id, accountId: input.accountId, sqlitePath, objectsPath, wrapped, createdAt };
}

export function saveOidcFlow(
  db: DatabaseSync,
  input: { state: string; nonce: string; codeVerifier: string; expiresAt: Date },
): void {
  db.prepare(
    'INSERT INTO oidc_flows (state, nonce, code_verifier, expires_at) VALUES (?, ?, ?, ?)',
  ).run(input.state, input.nonce, input.codeVerifier, input.expiresAt.toISOString());
}

export function takeOidcFlow(
  db: DatabaseSync,
  state: string,
  clock: Clock,
): { nonce: string; codeVerifier: string } | null {
  const row = db
    .prepare('SELECT nonce, code_verifier, expires_at FROM oidc_flows WHERE state = ?')
    .get(state) as { nonce: string; code_verifier: string; expires_at: string } | undefined;
  if (row === undefined) {
    return null;
  }
  db.prepare('DELETE FROM oidc_flows WHERE state = ?').run(state);
  if (new Date(row.expires_at).getTime() <= clock.now().getTime()) {
    return null;
  }
  return { nonce: row.nonce, codeVerifier: row.code_verifier };
}
