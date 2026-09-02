import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  generateDataKey,
  unwrapDataKey,
  wrapDataKey,
} from '../../src/infrastructure/crypto/aead.ts';
import {
  createFieldCipher,
  decryptLegacyField,
  FIELD_CIPHER_VERSION,
  LEGACY_FIELD_CIPHER_VERSION,
} from '../../src/infrastructure/crypto/fields.ts';
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

const vaultA = 'vault-sintetica-a';
const vaultB = 'vault-sintetica-b';
const keyA = Buffer.alloc(32, 7);
const keyB = Buffer.alloc(32, 9);
const zeroKey = Buffer.alloc(32, 0);

function legacyEnc1(
  vaultId: string,
  scope: string,
  id: string,
  field: string,
  value: string,
  key: Buffer,
): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(`v1|vault|${vaultId}|${scope}|${id}|${field}`, 'utf8'));
  const ct = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${LEGACY_FIELD_CIPHER_VERSION}:${nonce.toString('base64')}:${ct.toString('base64')}:${cipher.getAuthTag().toString('base64')}`;
}

describe('cifrador de campos clinicos', () => {
  it('posee una copia propia de la clave: borrar el buffer original no lo rompe', () => {
    const key = Buffer.alloc(32, 7);
    const cipher = createFieldCipher({ vaultId: vaultA, dataKey: key });
    key.fill(0);
    const stored = cipher.enc('observations', 'fila-1', 'original_name', 'Vitamina D');
    expect(stored?.startsWith(`${FIELD_CIPHER_VERSION}:`)).toBe(true);
    expect(cipher.dec('observations', 'fila-1', 'original_name', stored)).toBe('Vitamina D');
  });

  it('la clave cero no descifra datos cifrados con la clave real', () => {
    const real = createFieldCipher({ vaultId: vaultA, dataKey: keyA });
    const zero = createFieldCipher({ vaultId: vaultA, dataKey: zeroKey });
    const stored = real.enc('observations', 'fila-1', 'original_name', 'Vitamina D');
    expect(() => zero.dec('observations', 'fila-1', 'original_name', stored ?? '')).toThrow(
      /No se pudo descifrar/,
    );
  });

  it('una clave equivocada no descifra', () => {
    const real = createFieldCipher({ vaultId: vaultA, dataKey: keyA });
    const wrong = createFieldCipher({ vaultId: vaultA, dataKey: keyB });
    const stored = real.enc('observations', 'fila-1', 'original_name', 'Vitamina D');
    expect(() => wrong.dec('observations', 'fila-1', 'original_name', stored ?? '')).toThrow(
      /No se pudo descifrar/,
    );
  });

  it('la clave de otra boveda no descifra aunque la clave coincida', () => {
    const realA = createFieldCipher({ vaultId: vaultA, dataKey: keyA });
    const otraBoveda = createFieldCipher({ vaultId: vaultB, dataKey: keyB });
    const mismaClaveOtraBoveda = createFieldCipher({ vaultId: vaultB, dataKey: keyA });
    const stored = realA.enc('observations', 'fila-1', 'original_name', 'Vitamina D');
    expect(() => otraBoveda.dec('observations', 'fila-1', 'original_name', stored ?? '')).toThrow(
      /No se pudo descifrar/,
    );
    expect(() =>
      mismaClaveOtraBoveda.dec('observations', 'fila-1', 'original_name', stored ?? ''),
    ).toThrow(/No se pudo descifrar/);
  });

  it('el AAD amarra alcance, fila y campo', () => {
    const cipher = createFieldCipher({ vaultId: vaultA, dataKey: keyA });
    const stored = cipher.enc('observations', 'fila-1', 'original_name', 'Vitamina D') ?? '';
    expect(() => cipher.dec('providers', 'fila-1', 'original_name', stored)).toThrow(
      /No se pudo descifrar/,
    );
    expect(() => cipher.dec('observations', 'fila-2', 'original_name', stored)).toThrow(
      /No se pudo descifrar/,
    );
    expect(() => cipher.dec('observations', 'fila-1', 'code', stored)).toThrow(
      /No se pudo descifrar/,
    );
  });

  it('texto cifrado o tag manipulados no descifran', () => {
    const cipher = createFieldCipher({ vaultId: vaultA, dataKey: keyA });
    const stored = cipher.enc('observations', 'fila-1', 'original_name', 'Vitamina D') ?? '';
    const parts = stored.split(':');
    const ct = Buffer.from(parts[2] ?? '', 'base64');
    ct[0] = (ct[0] ?? 0) ^ 0xff;
    const ctManipulado = `${parts[0]}:${parts[1]}:${ct.toString('base64')}:${parts[3]}`;
    expect(() => cipher.dec('observations', 'fila-1', 'original_name', ctManipulado)).toThrow(
      /No se pudo descifrar/,
    );
    const tag = Buffer.from(parts[3] ?? '', 'base64');
    tag[0] = (tag[0] ?? 0) ^ 0xff;
    const tagManipulado = `${parts[0]}:${parts[1]}:${parts[2]}:${tag.toString('base64')}`;
    expect(() => cipher.dec('observations', 'fila-1', 'original_name', tagManipulado)).toThrow(
      /No se pudo descifrar/,
    );
  });

  it('destroy borra la clave y cierra el cifrador de forma definitiva', () => {
    const cipher = createFieldCipher({ vaultId: vaultA, dataKey: keyA });
    const stored = cipher.enc('observations', 'fila-1', 'original_name', 'Vitamina D');
    cipher.destroy();
    expect(() => cipher.dec('observations', 'fila-1', 'original_name', stored ?? '')).toThrow(
      /destruido/,
    );
    expect(() => cipher.enc('observations', 'fila-2', 'original_name', 'x')).toThrow(/destruido/);
    expect(() => cipher.destroy()).not.toThrow();
  });

  it('decryptLegacyField rescata los enc1 de la epoca de la clave cero', () => {
    const legacy = legacyEnc1(
      vaultA,
      'observations',
      'fila-1',
      'original_name',
      'Vitamina D',
      zeroKey,
    );
    const rescatado = decryptLegacyField({
      vaultId: vaultA,
      dataKey: zeroKey,
      scope: 'observations',
      id: 'fila-1',
      field: 'original_name',
      value: legacy,
    });
    expect(rescatado).toBe('Vitamina D');
    expect(() =>
      decryptLegacyField({
        vaultId: vaultA,
        dataKey: keyA,
        scope: 'observations',
        id: 'fila-1',
        field: 'original_name',
        value: legacy,
      }),
    ).toThrow(/campo legado/);
  });

  it('los valores numericos viajan cifrados y vuelven finitos', () => {
    const cipher = createFieldCipher({ vaultId: vaultA, dataKey: keyA });
    const stored = cipher.encNum('observations', 'fila-1', 'value_quantity', 18.5);
    expect(cipher.decNum('observations', 'fila-1', 'value_quantity', stored)).toBe(18.5);
    expect(cipher.encNum('observations', 'fila-1', 'value_quantity', null)).toBeNull();
  });
});
