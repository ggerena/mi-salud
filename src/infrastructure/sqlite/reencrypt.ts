import type { DatabaseSync } from 'node:sqlite';
import { AppError } from '../../shared/errors.ts';
import { newId } from '../../shared/ids.ts';
import { DATA_KEY_BYTES } from '../crypto/aead.ts';
import {
  decryptLegacyField,
  FIELD_CIPHER_VERSION,
  type FieldCipher,
  LEGACY_FIELD_CIPHER_VERSION,
} from '../crypto/fields.ts';
import { insertAuditEntry } from './clinical.ts';

const FIELD_CIPHER_MIGRATION_VERSION = 1;

// Clave cero historica: entre c6ca317 y la correccion del cifrador, todos los
// sobres enc1 se cifraron con un buffer de 32 bytes en cero porque el contexto
// de boveda borraba la dataKey real justo despues de crear el cifrador. Solo
// esta migracion puede usarla para rescatar esos datos; las lecturas ya no la
// aceptan, asi que no existe un respaldo permanente a clave cero.
const ZERO_KEY = Buffer.alloc(DATA_KEY_BYTES, 0);

interface EncryptedColumn {
  name: string;
  numeric: boolean;
}

interface EncryptedTable {
  table: string;
  scope: string;
  columns: EncryptedColumn[];
}

// Inventario congelado de columnas cifradas por tabla. El scope de cada fila
// coincide con el nombre de la tabla (ver constantes en sqlite/clinical.ts).
const ENCRYPTED_TABLES: EncryptedTable[] = [
  {
    table: 'patient_profile',
    scope: 'patient_profile',
    columns: [
      { name: 'display_name', numeric: false },
      { name: 'birth_date', numeric: false },
      { name: 'timezone', numeric: false },
    ],
  },
  {
    table: 'providers',
    scope: 'providers',
    columns: [
      { name: 'name', numeric: false },
      { name: 'role', numeric: false },
    ],
  },
  {
    table: 'appointments',
    scope: 'appointments',
    columns: [
      { name: 'title', numeric: false },
      { name: 'location', numeric: false },
      { name: 'notes', numeric: false },
    ],
  },
  {
    table: 'clinical_documents',
    scope: 'clinical_documents',
    columns: [
      { name: 'title', numeric: false },
      { name: 'issuer', numeric: false },
      { name: 'doc_date', numeric: false },
      { name: 'notes', numeric: false },
    ],
  },
  {
    table: 'diagnostic_reports',
    scope: 'diagnostic_reports',
    columns: [
      { name: 'issuer_text', numeric: false },
      { name: 'reported_at', numeric: false },
      { name: 'conclusion', numeric: false },
    ],
  },
  {
    table: 'observations',
    scope: 'observations',
    columns: [
      { name: 'code', numeric: false },
      { name: 'original_name', numeric: false },
      { name: 'value_quantity', numeric: true },
      { name: 'value_text', numeric: false },
      { name: 'unit_original', numeric: false },
      { name: 'unit_normalized', numeric: false },
      { name: 'reference_range_original', numeric: false },
      { name: 'effective_at', numeric: false },
      { name: 'reported_at', numeric: false },
      { name: 'method', numeric: false },
      { name: 'specimen', numeric: false },
      { name: 'source_ref', numeric: false },
    ],
  },
  {
    table: 'observation_versions',
    scope: 'observation_versions',
    columns: [{ name: 'payload', numeric: false }],
  },
  {
    table: 'follow_up_rules',
    scope: 'follow_up_rules',
    columns: [
      { name: 'test_code', numeric: false },
      { name: 'test_name', numeric: false },
      { name: 'interval_iso', numeric: false },
      { name: 'jurisdiction', numeric: false },
      { name: 'valid_from', numeric: false },
      { name: 'valid_to', numeric: false },
    ],
  },
  {
    table: 'follow_up_plans',
    scope: 'follow_up_plans',
    columns: [
      { name: 'test_code', numeric: false },
      { name: 'test_name', numeric: false },
      { name: 'basis_text', numeric: false },
      { name: 'interval_iso', numeric: false },
      { name: 'due_date_exact', numeric: false },
      { name: 'anchor_at', numeric: false },
      { name: 'source_ref', numeric: false },
    ],
  },
];

function markerCount(db: DatabaseSync): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM field_cipher_migrations WHERE version = ?')
    .get(FIELD_CIPHER_MIGRATION_VERSION) as { n: number };
  return row.n;
}

function migrationAudit(
  db: DatabaseSync,
  entry: {
    accountId: string;
    vaultId: string;
    action: string;
    outcome: 'permitido' | 'denegado';
    detail: Record<string, unknown> | null;
  },
): void {
  insertAuditEntry(db, {
    id: newId(),
    actor: entry.accountId,
    action: entry.action,
    resource: 'vault',
    resourceId: entry.vaultId,
    outcome: entry.outcome,
    occurredAt: new Date().toISOString(),
    detail: entry.detail === null ? null : JSON.stringify(entry.detail),
  });
}

/**
 * Migracion one-time y transaccional del cifrado de campos:
 * - plaintext (bovedas previas a c6ca317) → enc2 con la clave real;
 * - enc1 (cifrados con la clave cero del bug) → descifrado legado y re-cifrado en enc2.
 * Una fila corrupta revierte toda la migracion, deja registro de auditoria y
 * deja la boveda inoperable hasta revision manual: nunca hay perdida silenciosa.
 */
export function runFieldCipherMigration(
  db: DatabaseSync,
  input: { vaultId: string; accountId: string; cipher: FieldCipher },
): void {
  if (markerCount(db) > 0) {
    return;
  }

  let where: { table: string; column: string; rowId: string } | null = null;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (markerCount(db) > 0) {
      db.exec('COMMIT');
      return;
    }

    let reencrypted = 0;
    let encrypted = 0;
    for (const group of ENCRYPTED_TABLES) {
      for (const column of group.columns) {
        const rows = db
          .prepare(`SELECT id, ${column.name} AS raw FROM ${group.table}`)
          .all() as Array<{ id: string; raw: string | number | null }>;
        const update = db.prepare(`UPDATE ${group.table} SET ${column.name} = ? WHERE id = ?`);
        for (const row of rows) {
          if (row.raw === null) {
            continue;
          }
          where = { table: group.table, column: column.name, rowId: row.id };
          if (typeof row.raw === 'string' && row.raw.startsWith(`${FIELD_CIPHER_VERSION}:`)) {
            continue;
          }
          let plain: string;
          if (
            typeof row.raw === 'string' &&
            row.raw.startsWith(`${LEGACY_FIELD_CIPHER_VERSION}:`)
          ) {
            plain = decryptLegacyField({
              vaultId: input.vaultId,
              dataKey: ZERO_KEY,
              scope: group.scope,
              id: row.id,
              field: column.name,
              value: row.raw,
            });
            reencrypted += 1;
          } else {
            plain = typeof row.raw === 'number' ? String(row.raw) : row.raw;
            if (column.numeric && !Number.isFinite(Number(plain))) {
              throw new AppError(
                'vault_integrity',
                500,
                `Dato numerico ilegible en ${group.table}.${column.name} (fila ${row.id}).`,
              );
            }
            encrypted += 1;
          }
          const stored = column.numeric
            ? input.cipher.encNum(group.scope, row.id, column.name, Number(plain))
            : input.cipher.enc(group.scope, row.id, column.name, plain);
          update.run(stored, row.id);
        }
      }
    }

    db.prepare('INSERT INTO field_cipher_migrations (version, applied_at) VALUES (?, ?)').run(
      FIELD_CIPHER_MIGRATION_VERSION,
      new Date().toISOString(),
    );
    migrationAudit(db, {
      accountId: input.accountId,
      vaultId: input.vaultId,
      action: 'boveda.cifrado-migrada',
      outcome: 'permitido',
      detail: { recifrados: reencrypted, cifrados: encrypted },
    });
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // la transaccion ya no estaba activa; el error original manda
    }
    const isIntegrity = err instanceof AppError && err.code === 'vault_integrity';
    try {
      migrationAudit(db, {
        accountId: input.accountId,
        vaultId: input.vaultId,
        action: isIntegrity ? 'boveda.cifrado-corrupto' : 'boveda.cifrado-fallo',
        outcome: 'denegado',
        detail:
          where === null ? null : { tabla: where.table, columna: where.column, fila: where.rowId },
      });
    } catch {
      // sin bitacora el error original sigue mandando
    }
    throw err;
  }
}
