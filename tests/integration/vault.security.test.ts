import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createAuthService } from '../../src/application/auth.ts';
import {
  closeVaultContext,
  createClinicalService,
  openVaultContext,
  type VaultContext,
} from '../../src/application/clinical.ts';
import { FakeOidcProvider } from '../../src/infrastructure/oidc/fake.ts';
import {
  findVaultByAccount,
  insertAllowlist,
  openCatalog,
} from '../../src/infrastructure/sqlite/catalog.ts';
import {
  insertObservationVersion,
  updateObservation,
} from '../../src/infrastructure/sqlite/clinical.ts';
import { SystemClock } from '../../src/shared/clock.ts';
import { AppError } from '../../src/shared/errors.ts';
import { newId } from '../../src/shared/ids.ts';
import {
  SYNTHETIC_LAB_PROVIDER,
  SYNTHETIC_PERSON,
  SYNTHETIC_VITAMIN_D_DOCUMENT,
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
const personaB = {
  iss: 'https://accounts.google.com',
  sub: 'sintetico-sub-b',
  email: 'b@example.invalid',
};

function harness() {
  const root = mkdtempSync(join(tmpdir(), 'misalud-security-'));
  const db = openCatalog(join(root, 'catalog.sqlite'));
  const clock = new SystemClock();
  const clinical = createClinicalService({ clock });
  const signUp = async (identity: typeof personaA): Promise<VaultContext> => {
    const auth = createAuthService({
      db,
      oidc: new FakeOidcProvider(identity, redirectUri),
      redirectUri,
      masterKey,
      dataDir: join(root, 'data'),
      objectsDir: join(root, 'objects'),
      sessionTtlMs: 60_000,
      clock,
    });
    const start = await auth.startLogin();
    const { token } = await auth.completeLogin(start.authorizationUrl);
    const { vault } = auth.acceptConsent(token);
    const ctx = openVaultContext({ catalogDb: db, accountId: vault.accountId, masterKey });
    if (ctx === null) {
      throw new Error('la boveda debia existir tras el consentimiento');
    }
    return ctx;
  };
  const cargarVitaminaD = (ctx: VaultContext) => {
    clinical.createProvider(ctx, SYNTHETIC_LAB_PROVIDER);
    const document = clinical.registerDocument(ctx, SYNTHETIC_VITAMIN_D_DOCUMENT);
    const report = clinical.createReport(ctx, {
      ...SYNTHETIC_VITAMIN_D_REPORT,
      documentId: document.id,
    });
    return clinical.addObservation(ctx, {
      ...SYNTHETIC_VITAMIN_D_OBSERVATION,
      diagnosticReportId: report.id,
    });
  };
  return { root, db, clock, clinical, signUp, cargarVitaminaD };
}

describe('cifrado en reposo de la boveda', () => {
  it('el archivo SQLite no contiene datos clinicos en texto plano', async () => {
    const { db, clinical, signUp, cargarVitaminaD } = harness();
    const ctx = await signUp(personaA);
    const observation = await cargarVitaminaD(ctx);
    clinical.correctObservation(ctx, observation.id, { valueQuantity: 21 });
    closeVaultContext(ctx.vaultId);

    const vault = findVaultByAccount(db, ctx.accountId);
    expect(vault).not.toBeNull();
    const secrets = [
      SYNTHETIC_PERSON.displayName,
      SYNTHETIC_PERSON.birthDate,
      SYNTHETIC_LAB_PROVIDER.name,
      SYNTHETIC_VITAMIN_D_OBSERVATION.originalName,
      SYNTHETIC_VITAMIN_D_OBSERVATION.unitOriginal,
      SYNTHETIC_VITAMIN_D_OBSERVATION.referenceRangeOriginal,
      SYNTHETIC_VITAMIN_D_DOCUMENT.title,
      SYNTHETIC_VITAMIN_D_REPORT.conclusion,
      'ng/mL',
    ];
    for (const file of [vault?.sqlitePath ?? '', `${vault?.sqlitePath ?? ''}-wal`]) {
      let content: Buffer;
      try {
        content = readFileSync(file);
      } catch {
        continue;
      }
      for (const secret of secrets) {
        expect(content.includes(Buffer.from(secret, 'utf8')), `${file} contiene "${secret}"`).toBe(
          false,
        );
      }
    }

    const ctx2 = openVaultContext({ catalogDb: db, accountId: ctx.accountId, masterKey });
    expect(ctx2).not.toBeNull();
    const reread = clinical.getObservation(ctx2 ?? ctx, observation.id);
    expect(reread.valueQuantity).toBe(21);
    expect(reread.originalName).toBe(SYNTHETIC_VITAMIN_D_OBSERVATION.originalName);
  });
});

describe('atomicidad y bloqueo optimista de correcciones', () => {
  it('el indice unico rechaza dos snapshots con la misma version', async () => {
    const { clock, clinical, signUp, cargarVitaminaD } = harness();
    const ctx = await signUp(personaA);
    const observation = await cargarVitaminaD(ctx);
    clinical.correctObservation(ctx, observation.id, { valueQuantity: 25 });

    const duplicado = () =>
      insertObservationVersion(ctx.db, ctx.cipher, {
        id: newId(),
        observationId: observation.id,
        version: 1,
        payload: 'duplicado',
        changedBy: ctx.accountId,
        changedAt: clock.now().toISOString(),
      });
    expect(duplicado).toThrow();
    expect(clinical.listObservationVersions(ctx, observation.id)).toHaveLength(1);
  });

  it('un update con version esperada obsoleta no cambia ninguna fila', async () => {
    const { clock, clinical, signUp, cargarVitaminaD } = harness();
    const ctx = await signUp(personaA);
    const observation = await cargarVitaminaD(ctx);
    const corregida = clinical.correctObservation(ctx, observation.id, { valueQuantity: 25 });
    expect(corregida.version).toBe(2);

    const stale = {
      ...observation,
      valueQuantity: 99,
      version: 2,
      updatedAt: clock.now().toISOString(),
    };
    expect(updateObservation(ctx.db, ctx.cipher, stale, 1)).toBe(false);
    expect(clinical.getObservation(ctx, observation.id).valueQuantity).toBe(25);
  });

  it('dos conexiones no pueden escribir a la vez sobre la misma boveda', async () => {
    const { db, clinical, signUp, cargarVitaminaD } = harness();
    const ctx = await signUp(personaA);
    await cargarVitaminaD(ctx);
    const vault = findVaultByAccount(db, ctx.accountId);
    const otra = new DatabaseSync(vault?.sqlitePath ?? '');
    otra.exec('PRAGMA busy_timeout = 100;');

    ctx.db.exec('BEGIN IMMEDIATE');
    expect(() => otra.exec('BEGIN IMMEDIATE')).toThrow();
    ctx.db.exec('ROLLBACK');
    otra.close();

    expect(clinical.listObservations(ctx)).toHaveLength(1);
  });
});

describe('normalizacion de valores al corregir', () => {
  it('cambiar valueKind limpia los valores incompatibles', async () => {
    const { clinical, signUp, cargarVitaminaD } = harness();
    const ctx = await signUp(personaA);
    const observation = await cargarVitaminaD(ctx);

    const comoTexto = clinical.correctObservation(ctx, observation.id, {
      valueKind: 'texto',
      valueText: 'no detectable',
    });
    expect(comoTexto.valueKind).toBe('texto');
    expect(comoTexto.valueText).toBe('no detectable');
    expect(comoTexto.valueQuantity).toBeNull();

    const comoBooleano = clinical.correctObservation(ctx, observation.id, {
      valueKind: 'booleano',
      valueQuantity: 1,
    });
    expect(comoBooleano.valueKind).toBe('booleano');
    expect(comoBooleano.valueQuantity).toBe(1);
    expect(comoBooleano.valueText).toBeNull();

    const comoNoInformado = clinical.correctObservation(ctx, observation.id, {
      valueKind: 'no_informado',
    });
    expect(comoNoInformado.valueQuantity).toBeNull();
    expect(comoNoInformado.valueText).toBeNull();
  });
});

describe('validacion de fechas de calendario reales', () => {
  it('rechaza fechas imposibles y fechas de nacimiento futuras', async () => {
    const { clinical, signUp, cargarVitaminaD } = harness();
    const ctx = await signUp(personaA);

    const expectBadRequest = (fn: () => unknown) => {
      try {
        fn();
        expect.unreachable('debia rechazar la entrada');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('bad_request');
      }
    };

    expectBadRequest(() =>
      clinical.upsertProfile(ctx, { ...SYNTHETIC_PERSON, birthDate: '2999-01-01' }),
    );
    expectBadRequest(() =>
      clinical.upsertProfile(ctx, { ...SYNTHETIC_PERSON, birthDate: '1990-02-31' }),
    );
    expectBadRequest(() =>
      clinical.registerDocument(ctx, { ...SYNTHETIC_VITAMIN_D_DOCUMENT, docDate: '9999-99-99' }),
    );

    const observation = await cargarVitaminaD(ctx);
    const reportId = observation.diagnosticReportId;
    expectBadRequest(() =>
      clinical.addObservation(ctx, {
        ...SYNTHETIC_VITAMIN_D_OBSERVATION,
        diagnosticReportId: reportId,
        effectiveAt: '2026-02-31',
      }),
    );
    expectBadRequest(() =>
      clinical.addObservation(ctx, {
        ...SYNTHETIC_VITAMIN_D_OBSERVATION,
        diagnosticReportId: reportId,
        reportedAt: '2026-13-45',
      }),
    );

    const profile = clinical.upsertProfile(ctx, { ...SYNTHETIC_PERSON, birthDate: '1990-02-28' });
    expect(profile.birthDate).toBe('1990-02-28');
  });
});

describe('reutilizacion de conexiones de boveda', () => {
  it('llamadas repetidas reutilizan la misma conexion y un cierre se recupera', async () => {
    const { db, signUp } = harness();
    const primero = await signUp(personaA);
    for (let i = 0; i < 200; i += 1) {
      const ctx = openVaultContext({ catalogDb: db, accountId: primero.accountId, masterKey });
      expect(ctx?.db).toBe(primero.db);
    }

    primero.db.close();
    const reabierto = openVaultContext({ catalogDb: db, accountId: primero.accountId, masterKey });
    expect(reabierto === null).toBe(false);
    const mismoHandle = reabierto !== null && reabierto.db === primero.db;
    expect(mismoHandle).toBe(false);
    expect(reabierto?.db.isOpen).toBe(true);
    closeVaultContext(reabierto?.vaultId ?? '');
  });
});

describe('auditoria de lecturas y denegaciones', () => {
  it('registra lecturas permitidas y denegaciones IDOR sin filtrar datos clinicos', async () => {
    const { db, clinical, signUp, cargarVitaminaD } = harness();
    const ctxA = await signUp(personaA);
    const observation = await cargarVitaminaD(ctxA);
    clinical.getObservation(ctxA, observation.id);

    insertAllowlist(db, personaB.iss, personaB.sub, new SystemClock());
    const ctxB = await signUp(personaB);
    expect(() => clinical.getObservation(ctxB, observation.id)).toThrow(AppError);
    expect(() => clinical.confirmObservation(ctxB, observation.id)).toThrow(AppError);

    const auditoriaA = clinical
      .listAudit(ctxA, 100)
      .filter((e) => e.action !== 'auditoria.listada');
    expect(
      auditoriaA.some((e) => e.action === 'observacion.leida' && e.outcome === 'permitido'),
    ).toBe(true);

    const auditoriaB = clinical
      .listAudit(ctxB, 100)
      .filter((e) => e.action !== 'auditoria.listada');
    expect(auditoriaB.filter((e) => e.outcome === 'denegado').length).toBeGreaterThanOrEqual(2);

    for (const entry of [...auditoriaA, ...auditoriaB]) {
      expect(entry.detail ?? '').not.toContain('ng/mL');
      expect(entry.detail ?? '').not.toContain('vitamina');
      expect(entry.detail ?? '').not.toContain(
        SYNTHETIC_VITAMIN_D_OBSERVATION.referenceRangeOriginal,
      );
      if (entry.detail !== null) {
        const parsed = JSON.parse(entry.detail) as Record<string, unknown>;
        for (const value of Object.values(parsed)) {
          expect(
            typeof value === 'string' && /[a-zA-Z]{4,}/.test(value) && value.includes(' '),
          ).toBe(false);
        }
      }
    }
  });
});
