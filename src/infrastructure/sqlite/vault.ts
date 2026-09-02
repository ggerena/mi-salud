import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrate.ts';

export const VAULT_MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS patient_profile (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    birth_date TEXT,
    timezone TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('profesional', 'organizacion')),
    name TEXT NOT NULL,
    role TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    scheduled_at TEXT NOT NULL,
    provider_id TEXT,
    location TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'agendada'
      CHECK (status IN ('agendada', 'realizada', 'cancelada')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  );`,
  `CREATE TABLE IF NOT EXISTS clinical_documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('informe', 'receta', 'otro')),
    issuer TEXT,
    doc_date TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS diagnostic_reports (
    id TEXT PRIMARY KEY,
    document_id TEXT,
    provider_id TEXT,
    issuer_text TEXT,
    reported_at TEXT,
    conclusion TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES clinical_documents(id),
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  );`,
  `CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    diagnostic_report_id TEXT NOT NULL,
    code TEXT,
    original_name TEXT NOT NULL,
    value_kind TEXT NOT NULL
      CHECK (value_kind IN ('cantidad', 'texto', 'codigo', 'booleano', 'no_informado')),
    value_quantity REAL,
    value_text TEXT,
    unit_original TEXT,
    unit_normalized TEXT,
    reference_range_original TEXT,
    flag_original TEXT
      CHECK (flag_original IN ('bajo', 'normal', 'alto', 'critico', 'no_informado')),
    effective_at TEXT,
    reported_at TEXT,
    method TEXT,
    specimen TEXT,
    capture_method TEXT NOT NULL CHECK (capture_method IN ('manual', 'importado', 'extraido')),
    status TEXT NOT NULL
      CHECK (status IN ('extraido', 'requiere_confirmacion', 'confirmado', 'corregido')),
    source_ref TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (diagnostic_report_id) REFERENCES diagnostic_reports(id)
  );`,
  `CREATE TABLE IF NOT EXISTS observation_versions (
    id TEXT PRIMARY KEY,
    observation_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    payload TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    changed_at TEXT NOT NULL,
    FOREIGN KEY (observation_id) REFERENCES observations(id)
  );`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    resource_id TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('permitido', 'denegado')),
    occurred_at TEXT NOT NULL,
    detail TEXT
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_observation_versions_observation_version
   ON observation_versions (observation_id, version);`,
  `CREATE TABLE IF NOT EXISTS field_cipher_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );`,
];

export function openVault(sqlitePath: string): DatabaseSync {
  mkdirSync(dirname(sqlitePath), { recursive: true });
  const db = new DatabaseSync(sqlitePath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  runMigrations(db, VAULT_MIGRATIONS);
  return db;
}
