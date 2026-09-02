import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { AppError } from '../shared/errors.ts';
import type { Config } from './config.ts';
import type { Logger } from './logger.ts';

export interface AppDeps {
  config: Config;
  logger: Logger;
}

export function createApp(deps: AppDeps): Hono {
  const { config, logger } = deps;
  const app = new Hono();

  app.use(secureHeaders({ xFrameOptions: 'DENY' }));
  app.use(
    bodyLimit({
      maxSize: config.maxBodyBytes,
      onError: () =>
        new Response(
          JSON.stringify({
            error: { code: 'payload_too_large', message: 'Cuerpo de la solicitud demasiado grande.' },
          }),
          {
            status: 413,
            headers: { 'content-type': 'application/json; charset=UTF-8' },
          },
        ),
    }),
  );

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    logger.error('error_no_controlado', {
      error_name: err.name,
      error_message: err.message,
      path: c.req.path,
      method: c.req.method,
    });
    return c.json({ error: { code: 'internal_error', message: 'Error interno.' } }, 500);
  });

  app.notFound((c) =>
    c.json({ error: { code: 'not_found', message: 'Recurso no encontrado.' } }, 404),
  );

  app.get('/', (c) =>
    c.html(
      '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
        '<title>MiSalud</title></head><body><h1>MiSalud</h1>' +
        '<p>Boveda personal de salud. Estado del sistema: <a href="/health">health</a>.</p>' +
        '</body></html>',
    ),
  );

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.get('/ready', (c) => c.json({ status: 'ready' }));

  return app;
}
