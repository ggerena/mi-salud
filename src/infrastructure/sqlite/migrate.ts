import type { DatabaseSync } from 'node:sqlite';

export function runMigrations(db: DatabaseSync, migrations: string[]): void {
  db.exec(migrations[0] ?? '');
  const row = db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations').get() as
    | { v: number }
    | undefined;
  let current = row?.v ?? 0;
  for (let i = 1; i < migrations.length; i += 1) {
    const version = i;
    if (version <= current) {
      continue;
    }
    const sql = migrations[i];
    if (sql === undefined) {
      continue;
    }
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        version,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
      current = version;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
