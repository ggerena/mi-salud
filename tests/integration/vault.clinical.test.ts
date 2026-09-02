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
import { FakeOidcProvider } from '../../src/infrastructure/oidc/fake.ts';
import {
  findVaultByAccount,
  insertAllowlist,
  openCatalog,
} from '../../src/infrastructure/sqlite/catalog.ts';
import { insertObservation as insertObservationRow } from '../../src/infrastructure/sqlite/clinical.ts';
import { openVault } from '../../src/infrastructure/sqlite/vault.ts';
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
  const root = mkdtempSync(join(tmpdir(), 'misalud-clinical-'));
  const db = openCatalog(join(root, 'catalog.sqlite'));
  const clock = new SystemClock();
  const makeAuth = (identity: typeof personaA) =>
    createAuthService({
      db,
      oidc: new FakeOidcProvider(identity, redirectUri),
      redirectUri,
      masterKey,
      dataDir: join(root, 'data'),
      objectsDir: join(root, 'objects'),
      sessionTtlMs: 60_000,
      clock,
    });
  const signUp = async (identity: typeof personaA): Promise<VaultContext> => {
    const auth = makeAuth(identity);
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

async function cargarVitaminaD(
  clinical: ReturnType<typeof createClinicalService>,
  ctx: VaultContext,
) {
  const profile = clinical.upsertProfile(ctx, SYNTHETIC_PERSON);
  const provider = clinical.createProvider(ctx, SYNTHETIC_LAB_PROVIDER);
  const appointment = clinical.createAppointment(ctx, {
    title: 'Control sintetico',
    scheduledAt: '2026-07-15T09:00:00-03:00',
    providerId: provider.id,
    location: 'Consulta Sintetica 402',
  });
  const document = clinical.registerDocument(ctx, SYNTHETIC_VITAMIN_D_DOCUMENT);
  const report = clinical.createReport(ctx, {
    ...SYNTHETIC_VITAMIN_D_REPORT,
    documentId: document.id,
    providerId: provider.id,
  });
  const observation = clinical.addObservation(ctx, {
    ...SYNTHETIC_VITAMIN_D_OBSERVATION,
    diagnosticReportId: report.id,
  });
  return { profile, provider, appointment, document, report, observation };
}

describe('crud clinico en boveda aislada', () => {
  it('alta de perfil, proveedor, cita, documento, informe y observacion de vitamina D', async () => {
    const { clinical, signUp } = harness();
    const ctx = await signUp(personaA);
    const { profile, appointment, document, report, observation } = await cargarVitaminaD(
      clinical,
      ctx,
    );

    expect(profile.displayName).toBe(SYNTHETIC_PERSON.displayName);
    expect(clinical.getProfile(ctx)?.id).toBe(profile.id);
    expect(clinical.listProviders(ctx)).toHaveLength(1);
    expect(clinical.listAppointments(ctx)[0]?.status).toBe('agendada');
    expect(clinical.listDocuments(ctx)).toHaveLength(1);
    expect(clinical.listReports(ctx)).toHaveLength(1);
    expect(observation.humanReviewed).toBe(false);
    expect(observation.status).toBe('requiere_confirmacion');
    expect(observation.captureMethod).toBe('manual');
    expect(observation.version).toBe(1);

    const cancelled = clinical.cancelAppointment(ctx, appointment.id);
    expect(cancelled.status).toBe('cancelada');
    expect(clinical.cancelAppointment(ctx, appointment.id).status).toBe('cancelada');
    expect(report.documentId).toBe(document.id);
  });

  it('la persona B no ve ni alcanza nada de la boveda de la persona A', async () => {
    const { db, clinical, signUp } = harness();
    const ctxA = await signUp(personaA);
    const { observation } = await cargarVitaminaD(clinical, ctxA);

    insertAllowlist(db, personaB.iss, personaB.sub, new SystemClock());
    const ctxB = await signUp(personaB);

    expect(clinical.getProfile(ctxB)).toBeNull();
    expect(clinical.listProviders(ctxB)).toHaveLength(0);
    expect(clinical.listDocuments(ctxB)).toHaveLength(0);
    expect(clinical.listObservations(ctxB)).toHaveLength(0);
    expect(() => clinical.getObservation(ctxB, observation.id)).toThrow(AppError);
    try {
      clinical.getObservation(ctxB, observation.id);
    } catch (err) {
      expect((err as AppError).code).toBe('not_found');
    }
    expect(clinical.getObservation(ctxA, observation.id).id).toBe(observation.id);
  });

  it('una observacion extraida nunca se presenta como revisada y se confirma una sola vez', async () => {
    const { clinical, clock, signUp } = harness();
    const ctx = await signUp(personaA);
    const { report } = await cargarVitaminaD(clinical, ctx);

    insertObservationRow(ctx.db, ctx.cipher, {
      id: newId(),
      diagnosticReportId: report.id,
      code: SYNTHETIC_VITAMIN_D_OBSERVATION.code,
      originalName: SYNTHETIC_VITAMIN_D_OBSERVATION.originalName,
      valueKind: 'cantidad',
      valueQuantity: 18,
      valueText: null,
      unitOriginal: 'ng/mL',
      unitNormalized: null,
      referenceRangeOriginal: SYNTHETIC_VITAMIN_D_OBSERVATION.referenceRangeOriginal,
      flagOriginal: 'bajo',
      effectiveAt: SYNTHETIC_VITAMIN_D_OBSERVATION.effectiveAt,
      reportedAt: SYNTHETIC_VITAMIN_D_OBSERVATION.reportedAt,
      method: null,
      specimen: 'suero',
      captureMethod: 'extraido',
      status: 'extraido',
      sourceRef: 'pagina 2',
      version: 1,
      createdBy: ctx.accountId,
      createdAt: clock.now().toISOString(),
      updatedAt: clock.now().toISOString(),
    });
    const extracted = clinical.listObservations(ctx).find((o) => o.status === 'extraido');
    expect(extracted).toBeDefined();
    expect(extracted?.humanReviewed).toBe(false);

    const confirmed = clinical.confirmObservation(ctx, extracted?.id ?? '');
    expect(confirmed.status).toBe('confirmado');
    expect(confirmed.humanReviewed).toBe(true);

    expect(() => clinical.confirmObservation(ctx, extracted?.id ?? '')).toThrow(AppError);
    try {
      clinical.confirmObservation(ctx, extracted?.id ?? '');
    } catch (err) {
      expect((err as AppError).code).toBe('bad_request');
    }
  });

  it('sin conversion de unidades: se conserva la unidad original y la normalizada queda vacia', async () => {
    const { clinical, signUp } = harness();
    const ctx = await signUp(personaA);
    const { report } = await cargarVitaminaD(clinical, ctx);

    const enNmol = clinical.addObservation(ctx, {
      ...SYNTHETIC_VITAMIN_D_OBSERVATION,
      valueQuantity: 45,
      unitOriginal: 'nmol/L',
      referenceRangeOriginal: '75 - 250 nmol/L',
      diagnosticReportId: report.id,
    });

    const todas = clinical.listObservations(ctx, { reportId: report.id });
    expect(todas).toHaveLength(2);
    for (const obs of todas) {
      expect(obs.unitNormalized).toBeNull();
      expect(obs.unitOriginal).not.toBeNull();
      expect(obs.valueQuantity).not.toBeNull();
      expect(obs.referenceRangeOriginal).not.toBeNull();
    }
    expect(enNmol.unitOriginal).toBe('nmol/L');
    expect(enNmol.valueQuantity).toBe(45);
  });

  it('corregir snapshota la version previa y solo cambia los campos presentes', async () => {
    const { clinical, signUp } = harness();
    const ctx = await signUp(personaA);
    const { observation } = await cargarVitaminaD(clinical, ctx);

    const corrected = clinical.correctObservation(ctx, observation.id, {
      valueQuantity: 19,
      specimen: null,
    });
    expect(corrected.status).toBe('corregido');
    expect(corrected.version).toBe(2);
    expect(corrected.valueQuantity).toBe(19);
    expect(corrected.specimen).toBeNull();
    expect(corrected.unitOriginal).toBe('ng/mL');
    expect(corrected.humanReviewed).toBe(true);

    const history = clinical.listObservationVersions(ctx, observation.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.version).toBe(1);
    expect(JSON.parse(history[0]?.payload ?? '{}').valueQuantity).toBe(18);
    expect(JSON.parse(history[0]?.payload ?? '{}').specimen).toBe('suero');

    const second = clinical.correctObservation(ctx, observation.id, { flagOriginal: 'normal' });
    expect(second.version).toBe(3);
    expect(second.valueQuantity).toBe(19);
    expect(second.flagOriginal).toBe('normal');
    expect(clinical.listObservationVersions(ctx, observation.id)).toHaveLength(2);
  });

  it('rechaza entradas invalidas con 400 y recursos inexistentes con 404', async () => {
    const { clinical, signUp } = harness();
    const ctx = await signUp(personaA);
    const { report } = await cargarVitaminaD(clinical, ctx);

    const expectCode = (code: string, fn: () => unknown) => {
      try {
        fn();
        expect.unreachable('debia lanzar AppError');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe(code);
      }
    };

    expectCode('bad_request', () =>
      clinical.addObservation(ctx, {
        ...SYNTHETIC_VITAMIN_D_OBSERVATION,
        diagnosticReportId: '00000000-0000-4000-8000-000000000000',
      }),
    );
    expectCode('bad_request', () =>
      clinical.addObservation(ctx, {
        ...SYNTHETIC_VITAMIN_D_OBSERVATION,
        valueKind: 'cantidad',
        valueQuantity: null,
        diagnosticReportId: report.id,
      }),
    );
    expectCode('bad_request', () =>
      clinical.upsertProfile(ctx, { ...SYNTHETIC_PERSON, timezone: 'Marte/Zona' }),
    );
    expectCode('bad_request', () =>
      clinical.createAppointment(ctx, {
        title: 'Sin zona',
        scheduledAt: '2026-07-15T09:00:00',
      }),
    );
    expectCode('not_found', () =>
      clinical.getObservation(ctx, '00000000-0000-4000-8000-000000000000'),
    );
    expectCode('not_found', () =>
      clinical.cancelAppointment(ctx, '00000000-0000-4000-8000-000000000000'),
    );
  });

  it('reabrir la boveda no re-aplica migraciones ni pierde datos', async () => {
    const { db, clinical, signUp } = harness();
    const ctx = await signUp(personaA);
    const { observation } = await cargarVitaminaD(clinical, ctx);

    const vault = findVaultByAccount(db, ctx.accountId);
    expect(vault).not.toBeNull();
    const versionBefore = (
      ctx.db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations').get() as {
        v: number;
      }
    ).v;
    ctx.db.close();

    const reopened = openVault(vault?.sqlitePath ?? '');
    const versionAfter = (
      reopened.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations').get() as {
        v: number;
      }
    ).v;
    expect(versionAfter).toBe(versionBefore);
    const ctx2 = openVaultContext({ catalogDb: db, accountId: ctx.accountId, masterKey });
    expect(ctx2).not.toBeNull();
    const obsAgain = clinical.getObservation(ctx2 ?? ctx, observation.id);
    expect(obsAgain.valueQuantity).toBe(18);
    expect(obsAgain.status).toBe('requiere_confirmacion');
  });

  it('la auditoria registra las mutaciones sin contenido clinico', async () => {
    const { clinical, signUp } = harness();
    const ctx = await signUp(personaA);
    const { observation } = await cargarVitaminaD(clinical, ctx);
    clinical.confirmObservation(ctx, observation.id);

    const entries = clinical.listAudit(ctx, 50).filter((e) => e.action !== 'auditoria.listada');
    const actions = entries.map((e) => e.action);
    expect(actions).toContain('perfil.creado');
    expect(actions).toContain('proveedor.creado');
    expect(actions).toContain('cita.creada');
    expect(actions).toContain('documento.registrado');
    expect(actions).toContain('informe.creado');
    expect(actions).toContain('observacion.creada');
    expect(actions).toContain('observacion.confirmada');
    for (const entry of entries) {
      expect(entry.actor).toBe(ctx.accountId);
      expect(entry.outcome).toBe('permitido');
      if (entry.detail !== null) {
        const detail = entry.detail;
        expect(detail).not.toContain('ng/mL');
        expect(detail).not.toContain('vitamina');
        expect(detail).not.toContain('30 - 100');
      }
    }
  });
});
