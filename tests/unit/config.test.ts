import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/app/config.ts';
import { SYNTHETIC_MASTER_KEY } from '../fixtures/keys.ts';

const base = { MISALUD_MASTER_KEY: SYNTHETIC_MASTER_KEY };

describe('loadConfig fail-closed', () => {
  it('acepta una clave maestra sintetica valida', () => {
    const cfg = loadConfig({ ...base });
    expect(cfg.masterKey).toHaveLength(32);
    expect(cfg.host).toBe('127.0.0.1');
  });

  it('falla si falta la clave maestra', () => {
    expect(() => loadConfig({})).toThrowError(ConfigError);
    expect(() => loadConfig({ MISALUD_MASTER_KEY: '' })).toThrowError(/Falta MISALUD_MASTER_KEY/);
  });

  it('falla si la clave no tiene 32 bytes', () => {
    expect(() => loadConfig({ MISALUD_MASTER_KEY: 'aabbcc' })).toThrowError(/64 caracteres/);
    expect(() => loadConfig({ MISALUD_MASTER_KEY: `${SYNTHETIC_MASTER_KEY}00` })).toThrowError(
      /64 caracteres/,
    );
  });

  it('falla si la clave no es hexadecimal', () => {
    const bad = 'z'.repeat(64);
    expect(() => loadConfig({ MISALUD_MASTER_KEY: bad })).toThrowError(/64 caracteres/);
  });

  it('rechaza claves con todos los bytes iguales', () => {
    const unsafe = 'f'.repeat(64);
    expect(() => loadConfig({ MISALUD_MASTER_KEY: unsafe })).toThrowError(/insegura/);
    const zeros = '0'.repeat(64);
    expect(() => loadConfig({ MISALUD_MASTER_KEY: zeros })).toThrowError(/insegura/);
  });

  it('rechaza definir ambos origenes de clave', () => {
    expect(() => loadConfig({ ...base, MISALUD_MASTER_KEY_FILE: '/tmp/k' })).toThrowError(
      /no ambos/,
    );
  });

  it('falla con variables invalidas (puerto fuera de rango)', () => {
    expect(() => loadConfig({ ...base, PORT: '70000' })).toThrowError(ConfigError);
  });
});
