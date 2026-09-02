import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError } from '../../shared/errors.ts';

const ALG = 'aes-256-gcm';
export const MASTER_KEY_BYTES = 32;
export const DATA_KEY_BYTES = 32;
const NONCE_BYTES = 12;
export const KEY_WRAP_VERSION = 1;

export interface WrappedKey {
  version: number;
  keyId: string;
  nonce: Buffer;
  ciphertext: Buffer;
  authTag: Buffer;
}

function requireKey(key: Buffer, size: number, label: string): void {
  if (key.length !== size) {
    throw new AppError('config_invalid', 400, `${label} debe tener ${size} bytes.`);
  }
}

export function generateDataKey(): Buffer {
  return randomBytes(DATA_KEY_BYTES);
}

export function wrapDataKey(input: {
  masterKey: Buffer;
  dataKey: Buffer;
  aad: Buffer;
  keyId?: string;
}): WrappedKey {
  requireKey(input.masterKey, MASTER_KEY_BYTES, 'masterKey');
  requireKey(input.dataKey, DATA_KEY_BYTES, 'dataKey');
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALG, input.masterKey, nonce);
  cipher.setAAD(input.aad);
  const ciphertext = Buffer.concat([cipher.update(input.dataKey), cipher.final()]);
  return {
    version: KEY_WRAP_VERSION,
    keyId: input.keyId ?? 'mk-1',
    nonce,
    ciphertext,
    authTag: cipher.getAuthTag(),
  };
}

export function unwrapDataKey(input: {
  masterKey: Buffer;
  wrapped: WrappedKey;
  aad: Buffer;
}): Buffer {
  requireKey(input.masterKey, MASTER_KEY_BYTES, 'masterKey');
  if (input.wrapped.version !== KEY_WRAP_VERSION) {
    throw new AppError('config_invalid', 400, 'Version de clave no soportada.');
  }
  const decipher = createDecipheriv(ALG, input.masterKey, input.wrapped.nonce);
  decipher.setAAD(input.aad);
  decipher.setAuthTag(input.wrapped.authTag);
  try {
    return Buffer.concat([decipher.update(input.wrapped.ciphertext), decipher.final()]);
  } catch {
    throw new AppError('internal_error', 500, 'No se pudo abrir la clave de boveda.');
  }
}
