import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAuthService } from '../../src/application/auth.ts';
import {
  createClinicalService,
  openVaultContext,
  type VaultContext,
} from '../../src/application/clinical.ts';
import { DATA_KEY_BYTES } from '../../src/infrastructure/crypto/aead.ts';
import { createFieldCipher } from '../../src/infrastructure/crypto/fields.ts';
import { FakeOidcProvider } from '../../src/infrastructure/oidc/fake.ts';
import { openCatalog } from '../../src/infrastructure/sqlite/catalog.ts';
import { runFieldCipherMigration } from '../../src/infrastructure/sqlite/reencrypt.ts';
import { SystemClock } from '../../src/shared/clock.ts';
import {
  SYNTHETIC_LAB_PROVIDER,
  SYNTHETIC_PERSON,
  SYNTHETIC_VITAMIN_D_OBSERVATION,
  SYNTHETIC_VITAMIN_D_REPORT,
} from '../fixtures/clinical.ts';
import { SYNTHETIC_MASTER_KEY } from '../fixtures/keys.ts';

const masterKey = Buffer.from(SYNTHETIC_MASTER_KEY, 'hex');
const redirectUri = 'http://127.0.0.1:8080/oidc/callback';
const personaA = {
  iss: 'https://accounts.google.com',
  sub: 'sintetico-sub-a',
  email: 'a@example.invalid',
};

function harness() {
  const root = mkdtempSync(join(tmpdir(), 'misalud-migration-'));
  const db = openCatalog(join(root, 'catalog.sqlite'));
  const clock = new SystemClock();
  const makeAuth = () =>
    createAuthService({
      db,
      oidc: new FakeOidcProvider(personaA, redirectUri),
      redirectUri,
      masterKey,
      dataDir: join(root, 'data'),
      objectsDir: join(root, 'objects'),
      sessionTtlMs: 60_000,
      clock,
    });
  const signUp = async (): Promise<VaultContext> => {
    const auth = makeAuth();
    const start = await auth.startLogin();
    const { token } = await auth.completeLogin(start.authorizationUrl);
    const { vault } = auth.acceptConsent(token);
    const ctx = openVaultContext({
      catalogDb: db,
      accountId: vault.accountId,
      masterKey,
    });
    if (ctx === null) {
      throw new Error('la boveda debia existir tras el consentimiento');
    }
    return ctx;
  };
  const clinical = createClinicalService({ clock });
  return { db, root, clock, clinical, signUp };
}

describe('migracion de cifrado de campos', () => {
  it('migracion se ejecuta automaticamente en openVaultContext y registra marcador + auditoria dentro de la transaccion', async () => {
    const { clinical, signUp } = harness();
    const ctx = await signUp();

    // Cargar datos de prueba (vitamina D)
    clinical.upsertProfile(ctx, SYNTHETIC_PERSON);
    const provider = clinical.createProvider(ctx, SYNTHETIC_LAB_PROVIDER);
    clinical.createAppointment(ctx, {
      title: 'Control sintetico',
      scheduledAt: '2026-07-15T09:00:00-03:00',
      providerId: provider.id,
      location: 'Consulta Sintetica 402',
    });
    const report = clinical.createReport(ctx, {
      ...SYNTHETIC_VITAMIN_D_REPORT,
      providerId: provider.id,
    });
    clinical.addObservation(ctx, {
      ...SYNTHETIC_VITAMIN_D_OBSERVATION,
      diagnosticReportId: report.id,
    });

    // Verificar que el marcador de migración se insertó (openVaultContext ejecuta la migración)
    const markerCount = (
      ctx.db.prepare('SELECT COUNT(*) AS n FROM field_cipher_migrations WHERE version = 1').get() as {
        n: number;
      }
    ).n;
    expect(markerCount).toBe(1);

    // Verificar que la auditoría de éxito se registró
    // (La auditoría debe estar dentro de la transacción, no después del COMMIT como el bug anterior)
    const auditSuccess = (
      ctx.db
        .prepare(
          "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'boveda.cifrado-migrada' AND outcome = 'permitido'",
        )
        .get() as { n: number }
    ).n;
    expect(auditSuccess).toBe(1);
  });

  it('segunda llamada a migracion es idempotente (no agrega nueva auditoria)', async () => {
    const { clinical, signUp } = harness();
    const ctx = await signUp();

    // Cargar datos
    clinical.upsertProfile(ctx, SYNTHETIC_PERSON);
    const provider = clinical.createProvider(ctx, SYNTHETIC_LAB_PROVIDER);
    const report = clinical.createReport(ctx, {
      ...SYNTHETIC_VITAMIN_D_REPORT,
      providerId: provider.id,
    });
    clinical.addObservation(ctx, {
      ...SYNTHETIC_VITAMIN_D_OBSERVATION,
      diagnosticReportId: report.id,
    });

    const dataKey = randomBytes(DATA_KEY_BYTES);
    const cipher = createFieldCipher({ vaultId: ctx.vaultId, dataKey });

    // Obtener count de auditoría tras primera migración (ejecutada en signUp/openVaultContext)
    const auditCountAfterFirst = (
      ctx.db
        .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'boveda.cifrado-migrada'")
        .get() as { n: number }
    ).n;
    expect(auditCountAfterFirst).toBe(1);

    // Segunda migración (debe ser no-op porque el marcador ya existe)
    runFieldCipherMigration(ctx.db, { vaultId: ctx.vaultId, accountId: ctx.accountId, cipher });

    // Verificar que no se creó una segunda entrada de auditoría (idempotencia)
    const auditCountAfterSecond = (
      ctx.db
        .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'boveda.cifrado-migrada'")
        .get() as { n: number }
    ).n;

    expect(auditCountAfterSecond).toBe(auditCountAfterFirst);
  });
});
