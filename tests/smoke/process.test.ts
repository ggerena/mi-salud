import { type ChildProcess, spawn } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { SYNTHETIC_MASTER_KEY } from '../fixtures/keys.ts';

let child: ChildProcess | null = null;
const port = 18321;

afterAll(() => {
  child?.kill('SIGTERM');
});

describe('smoke: proceso corto con configuracion real', () => {
  it('el servidor arranca con clave sintetica y responde /health en localhost', async () => {
    child = spawn(process.execPath, ['dist/app/main.js'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: String(port),
        MISALUD_MASTER_KEY: SYNTHETIC_MASTER_KEY,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const deadline = Date.now() + 10_000;
    let ok = false;
    let lastError: unknown = null;
    while (Date.now() < deadline && !ok) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.ok) {
          expect(await res.json()).toEqual({ status: 'ok' });
          ok = true;
        }
      } catch (err) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    expect(ok, `el proceso no respondio a tiempo: ${lastError}`).toBe(true);

    const res404 = await fetch(`http://127.0.0.1:${port}/inexistente`);
    expect(res404.status).toBe(404);
  }, 20_000);

  it('el proceso falla de forma cerrada sin clave maestra', async () => {
    const proc = spawn(process.execPath, ['dist/app/main.js'], {
      env: { ...process.env, NODE_ENV: 'test', PORT: String(port + 1), MISALUD_MASTER_KEY: '' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const code = await new Promise<number | null>((resolve) => {
      proc.on('exit', (code) => resolve(code));
    });
    expect(code).not.toBe(0);
    proc.kill('SIGTERM');
  }, 20_000);
});
