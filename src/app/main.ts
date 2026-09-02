import { serve } from '@hono/node-server';
import { type Config, loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createApp } from './server.ts';

function main(): void {
  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  const logger = createLogger(config.logLevel);
  const app = createApp({ config, logger });
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

main();
