import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { type AuthService, createAuthService } from '../application/auth.ts';
import { GoogleOidcProvider } from '../infrastructure/oidc/google.ts';
import { openCatalog } from '../infrastructure/sqlite/catalog.ts';
import { SystemClock } from '../shared/clock.ts';
import { type Config, loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createApp } from './server.ts';

async function main(): Promise<void> {
  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  const logger = createLogger(config.logLevel);
  const db = openCatalog(join(config.dataDir, 'catalog.sqlite'));
  let auth: AuthService | undefined;
  if (
    config.oidcClientId !== undefined &&
    config.oidcClientSecret !== undefined &&
    config.oidcRedirectUri !== undefined
  ) {
    const discovered = await GoogleOidcProvider.discover({
      issuer: config.oidcIssuer,
      clientId: config.oidcClientId,
      clientSecret: config.oidcClientSecret,
    });
    const oidc = new GoogleOidcProvider(discovered, config.oidcRedirectUri);
    auth = createAuthService({
      db,
      oidc,
      redirectUri: config.oidcRedirectUri,
      masterKey: config.masterKey,
      dataDir: config.dataDir,
      objectsDir: config.objectsDir,
      sessionTtlMs: config.sessionTtlMs,
      clock: new SystemClock(),
    });
    logger.info('oidc_listo', { issuer: config.oidcIssuer });
  } else {
    logger.warn('oidc_ausente', { hint: 'login deshabilitado hasta configurar OIDC_*' });
  }

  const app = createApp({
    config,
    logger,
    ...(auth === undefined ? {} : { auth }),
  });
  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port });
  logger.info('servidor_iniciado', { host: config.host, port: config.port });

  const shutdown = (signal: string): void => {
    logger.info('apagando', { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void main();
