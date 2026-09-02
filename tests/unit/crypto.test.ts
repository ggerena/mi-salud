import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  generateDataKey,
  unwrapDataKey,
  wrapDataKey,
} from '../../src/infrastructure/crypto/aead.ts';
import { SYNTHETIC_MASTER_KEY } from '../fixtures/keys.ts';

const masterKey = Buffer.from(SYNTHETIC_MASTER_KEY, 'hex');

function aad(vaultId: string): Buffer {
  return Buffer.from(`v1|vault|${vaultId}|data-key`, 'utf8');
}

describe('envoltura AES-256-GCM de claves de boveda', () => {
  it('envuelve y recupera una clave de datos', () => {
    const dataKey = generateDataKey();
    const wrapped = wrapDataKey({ masterKey, dataKey, aad: aad('vault-sintetica-1') });
    const opened = unwrapDataKey({ masterKey, wrapped, aad: aad('vault-sintetica-1') });
    expect(opened.equals(dataKey)).toBe(true);
    expect(wrapped.nonce).toHaveLength(12);
    expect(wrapped.authTag).toHaveLength(16);
  });

  it('falla si se altera el ciphertext, el tag o el AAD', () => {
    const dataKey = generateDataKey();
    const wrapped = wrapDataKey({ masterKey, dataKey, aad: aad('vault-sintetica-1') });
    const tamperedCt = Buffer.from(wrapped.ciphertext);
    tamperedCt[0] = (tamperedCt[0] ?? 0) ^ 0xff;
    expect(() =>
      unwrapDataKey({
        masterKey,
        wrapped: { ...wrapped, ciphertext: tamperedCt },
        aad: aad('vault-sintetica-1'),
      }),
    ).toThrow(/abrir la clave/);
    const tamperedTag = Buffer.from(wrapped.authTag);
    tamperedTag[0] = (tamperedTag[0] ?? 0) ^ 0xff;
    expect(() =>
      unwrapDataKey({
        masterKey,
        wrapped: { ...wrapped, authTag: tamperedTag },
        aad: aad('vault-sintetica-1'),
      }),
    ).toThrow(/abrir la clave/);
    expect(() => unwrapDataKey({ masterKey, wrapped, aad: aad('otra-boveda') })).toThrow(
      /abrir la clave/,
    );
  });

  it('separa bovedas: la clave maestra equivocada no abre', () => {
    const dataKey = generateDataKey();
    const wrapped = wrapDataKey({ masterKey, dataKey, aad: aad('vault-sintetica-1') });
    const otherMaster = createHash('sha256').update('otra-maestra-sintetica').digest();
    expect(() =>
      unwrapDataKey({ masterKey: otherMaster, wrapped, aad: aad('vault-sintetica-1') }),
    ).toThrow(/abrir la clave/);
  });

  it('no reutiliza nonce entre envolturas', () => {
    const dataKey = randomBytes(32);
    const a = wrapDataKey({ masterKey, dataKey, aad: aad('v1') });
    const b = wrapDataKey({ masterKey, dataKey, aad: aad('v1') });
    expect(a.nonce.equals(b.nonce)).toBe(false);
  });
});
