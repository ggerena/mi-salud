import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/app/config.ts';
import { createLogger } from '../../src/app/logger.ts';
import { createApp } from '../../src/app/server.ts';
import { createAuthService } from '../../src/application/auth.ts';
import { FakeOidcProvider } from '../../src/infrastructure/oidc/fake.ts';
import { openCatalog } from '../../src/infrastructure/sqlite/catalog.ts';
import { SystemClock } from '../../src/shared/clock.ts';
import { SYNTHETIC_MASTER_KEY } from '../fixtures/keys.ts';

const origin = 'http://127.0.0.1:8080';
const redirectUri = `${origin}/oidc/callback`;

function cookie(res: Response): string | undefined {
  const raw = res.headers.get('set-cookie');
  if (raw === null) {
    return undefined;
  }
  const part = raw.split(';')[0];
  return part;
}

describe('HTTP de sesion y CSRF', () => {
  it('login sintético, consentimiento, cookie HttpOnly y rechazo CSRF', async () => {
    const root = mkdtempSync(join(tmpdir(), 'misalud-http-'));
    const config = loadConfig({
      MISALUD_MASTER_KEY: SYNTHETIC_MASTER_KEY,
      MISALUD_DATA_DIR: join(root, 'data'),
      MISALUD_OBJECTS_DIR: join(root, 'objects'),
      MISALUD_PUBLIC_ORIGIN: origin,
      OIDC_REDIRECT_URI: redirectUri,
    });
    const db = openCatalog(join(root, 'catalog.sqlite'));
    const auth = createAuthService({
      db,
      oidc: new FakeOidcProvider(
        {
          iss: 'https://accounts.google.com',
          sub: 'sintetico-http',
          email: 'http@example.invalid',
        },
        redirectUri,
      ),
      redirectUri,
      masterKey: config.masterKey,
      dataDir: config.dataDir,
      objectsDir: config.objectsDir,
      sessionTtlMs: config.sessionTtlMs,
      clock: new SystemClock(),
    });
    const app = createApp({ config, logger: createLogger('error', () => {}), auth });

    const login = await app.request(`${origin}/login`);
    expect(login.status).toBe(302);
    const location = login.headers.get('location');
    expect(location).toContain('/oidc/callback');

    const callback = await app.request(location ?? '');
    expect(callback.status).toBe(302);
    const setCookie = callback.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const sessionCookie = cookie(callback);
    expect(sessionCookie).toBeDefined();

    const csrf = await app.request(`${origin}/consentimiento`, {
      method: 'POST',
      headers: { cookie: sessionCookie ?? '', origin: 'http://evil.example' },
    });
    expect(csrf.status).toBe(403);

    const ok = await app.request(`${origin}/consentimiento`, {
      method: 'POST',
      headers: { cookie: sessionCookie ?? '', origin },
    });
    expect(ok.status).toBe(302);

    const cuenta = await app.request(`${origin}/cuenta`, {
      headers: { cookie: sessionCookie ?? '' },
    });
    expect(cuenta.status).toBe(200);
    const html = await cuenta.text();
    expect(html).toContain('sintetico-http');
    expect(html).not.toContain(SYNTHETIC_MASTER_KEY);
  });
});
