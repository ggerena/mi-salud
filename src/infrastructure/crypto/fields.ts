import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError } from '../../shared/errors.ts';

const ALG = 'aes-256-gcm';
const NONCE_BYTES = 12;
const KEY_BYTES = 32;
export const FIELD_CIPHER_VERSION = 'enc2';
export const LEGACY_FIELD_CIPHER_VERSION = 'enc1';

export interface FieldCipher {
  enc(scope: string, id: string, field: string, value: string | null): string | null;
  dec(scope: string, id: string, field: string, value: string | null): string | null;
  encNum(scope: string, id: string, field: string, value: number | null): string | null;
  decNum(scope: string, id: string, field: string, value: string | null): number | null;
  destroy(): void;
}

function aadFor(vaultId: string, scope: string, id: string, field: string): Buffer {
  return Buffer.from(`v1|vault|${vaultId}|${scope}|${id}|${field}`, 'utf8');
}

export function createFieldCipher(input: { vaultId: string; dataKey: Buffer }): FieldCipher {
  const { vaultId } = input;
  if (input.dataKey.length !== KEY_BYTES) {
    throw new AppError(
      'internal_error',
      500,
      'La clave de campos de la boveda debe tener 32 bytes.',
    );
  }
  // Copia privada: el llamador borra su buffer tras crear el cifrador, por lo
  // que el cifrador debe ser dueno de sus propios bytes para no perder la clave.
  const key = Buffer.from(input.dataKey);
  let destroyed = false;

  function assertAlive(): void {
    if (destroyed) {
      throw new AppError('internal_error', 500, 'El cifrador de campos ya fue destruido.');
    }
  }

  function enc(scope: string, id: string, field: string, value: string | null): string | null {
    assertAlive();
    if (value === null) {
      return null;
    }
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALG, key, nonce);
    cipher.setAAD(aadFor(vaultId, scope, id, field));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${FIELD_CIPHER_VERSION}:${nonce.toString('base64')}:${ciphertext.toString('base64')}:${cipher.getAuthTag().toString('base64')}`;
  }

  function dec(scope: string, id: string, field: string, value: string | null): string | null {
    assertAlive();
    if (value === null) {
      return null;
    }
    const parts = value.split(':');
    if (parts.length !== 4 || parts[0] !== FIELD_CIPHER_VERSION) {
      throw new AppError(
        'vault_integrity',
        500,
        `Campo clinico con formato no reconocido (${scope}/${id}/${field}); la boveda requiere revision.`,
      );
    }
    const nonceB64: string = parts[1] ?? '';
    const ctB64: string = parts[2] ?? '';
    const tagB64: string = parts[3] ?? '';
    const decipher = createDecipheriv(ALG, key, Buffer.from(nonceB64, 'base64'));
    decipher.setAAD(aadFor(vaultId, scope, id, field));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    try {
      return Buffer.concat([
        decipher.update(Buffer.from(ctB64, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new AppError(
        'vault_integrity',
        500,
        `No se pudo descifrar un campo clinico (${scope}/${id}/${field}); la boveda requiere revision.`,
      );
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
        throw new AppError(
          'vault_integrity',
          500,
          `Campo numerico ilegible (${scope}/${id}/${field}); la boveda requiere revision.`,
        );
      }
      return parsed;
    },
    destroy() {
      if (destroyed) {
        return;
      }
      key.fill(0);
      destroyed = true;
    },
  };
}

// Solo para la migracion de datos legados: descifra sobres enc1 (epoca del
// bug de la clave cero) con la clave historica que se indique. El cifrador
// en caliente ya no acepta enc1, asi que esta funcion no sirve para lecturas.
export function decryptLegacyField(input: {
  vaultId: string;
  dataKey: Buffer;
  scope: string;
  id: string;
  field: string;
  value: string;
}): string {
  const parts = input.value.split(':');
  if (parts.length !== 4 || parts[0] !== LEGACY_FIELD_CIPHER_VERSION) {
    throw new AppError(
      'vault_integrity',
      500,
      `Campo legado con formato no reconocido (${input.scope}/${input.id}/${input.field}).`,
    );
  }
  const decipher = createDecipheriv(ALG, input.dataKey, Buffer.from(parts[1] ?? '', 'base64'));
  decipher.setAAD(aadFor(input.vaultId, input.scope, input.id, input.field));
  decipher.setAuthTag(Buffer.from(parts[3] ?? '', 'base64'));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(parts[2] ?? '', 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new AppError(
      'vault_integrity',
      500,
      `No se pudo descifrar el campo legado (${input.scope}/${input.id}/${input.field}).`,
    );
  }
}
