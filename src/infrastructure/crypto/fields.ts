import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError } from '../../shared/errors.ts';

const ALG = 'aes-256-gcm';
const NONCE_BYTES = 12;
const FIELD_CIPHER_VERSION = 'enc1';

export interface FieldCipher {
  enc(scope: string, id: string, field: string, value: string | null): string | null;
  dec(scope: string, id: string, field: string, value: string | null): string | null;
  encNum(scope: string, id: string, field: string, value: number | null): string | null;
  decNum(scope: string, id: string, field: string, value: string | null): number | null;
}

function aadFor(vaultId: string, scope: string, id: string, field: string): Buffer {
  return Buffer.from(`v1|vault|${vaultId}|${scope}|${id}|${field}`, 'utf8');
}

export function createFieldCipher(input: { vaultId: string; dataKey: Buffer }): FieldCipher {
  const { vaultId, dataKey } = input;

  function enc(scope: string, id: string, field: string, value: string | null): string | null {
    if (value === null) {
      return null;
    }
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALG, dataKey, nonce);
    cipher.setAAD(aadFor(vaultId, scope, id, field));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${FIELD_CIPHER_VERSION}:${nonce.toString('base64')}:${ciphertext.toString('base64')}:${cipher.getAuthTag().toString('base64')}`;
  }

  function dec(scope: string, id: string, field: string, value: string | null): string | null {
    if (value === null) {
      return null;
    }
    const parts = value.split(':');
    if (parts.length !== 4 || parts[0] !== FIELD_CIPHER_VERSION) {
      throw new AppError('internal_error', 500, 'Formato de campo cifrado no reconocido.');
    }
    const nonceB64: string = parts[1] ?? '';
    const ctB64: string = parts[2] ?? '';
    const tagB64: string = parts[3] ?? '';
    const decipher = createDecipheriv(ALG, dataKey, Buffer.from(nonceB64, 'base64'));
    decipher.setAAD(aadFor(vaultId, scope, id, field));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    try {
      return Buffer.concat([
        decipher.update(Buffer.from(ctB64, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new AppError('internal_error', 500, 'No se pudo descifrar un campo clinico.');
    }
  }

  return {
    enc,
    dec,
    encNum(scope, id, field, value) {
      return enc(scope, id, field, value === null ? null : String(value));
    },
    decNum(scope, id, field, value) {
      const text = dec(scope, id, field, value);
      if (text === null) {
        return null;
      }
      const parsed = Number(text);
      if (!Number.isFinite(parsed)) {
        throw new AppError('internal_error', 500, 'Campo numerico cifrado ilegible.');
      }
      return parsed;
    },
  };
}
