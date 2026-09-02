import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/app/config.ts';
import { createLogger } from '../../src/app/logger.ts';
import { createApp } from '../../src/app/server.ts';
import { SYNTHETIC_MASTER_KEY } from '../fixtures/keys.ts';

function makeApp() {
  const config = loadConfig({ MISALUD_MASTER_KEY: SYNTHETIC_MASTER_KEY });
  const logger = createLogger('error', () => {});
  return createApp({ config, logger });
}

describe('barreras HTTP de Fase 0', () => {
  it('GET / responde HTML propio sin assets externos', async () => {
    const res = await makeApp().request('/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('MiSalud');
    expect(html).not.toMatch(/https?:\/\//);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('GET /health no expone datos sensibles', async () => {
    const res = await makeApp().request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });

  it('GET /ready responde listo', async () => {
    const res = await makeApp().request('/ready');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ready' });
  });

  it('404 uniforme para rutas inexistentes', async () => {
    const res = await makeApp().request('/no/existe');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'not_found', message: 'Recurso no encontrado.' },
    });
  });

  it('rechaza cuerpos sobre el limite configurado', async () => {
    const config = loadConfig({ MISALUD_MASTER_KEY: SYNTHETIC_MASTER_KEY });
    const small = createApp({
      ...{ config: { ...config, maxBodyBytes: 8 }, logger: createLogger('error', () => {}) },
    });
    const res = await small.request('/health', {
      method: 'POST',
      body: 'x'.repeat(64),
      headers: { 'content-type': 'text/plain' },
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: { code: 'payload_too_large', message: 'Cuerpo de la solicitud demasiado grande.' },
    });
  });
});
