import { createCipheriv, randomBytes } from 'node:crypto';
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
import { unwrapDataKey } from '../../src/infrastructure/crypto/aead.ts';
import {
  createFieldCipher,
  FIELD_CIPHER_VERSION,
  LEGACY_FIELD_CIPHER_VERSION,
} from '../../src/infrastructure/crypto/fields.ts';
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

function enc1ConClave(
  vaultId: string,
  id: string,
  campo: string,
  valor: string,
  clave: Buffer,
): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', clave, nonce);
  cipher.setAAD(Buffer.from(`v1|vault|${vaultId}|observations|${id}|${campo}`, 'utf8'));
  const ct = Buffer.concat([cipher.update(valor, 'utf8'), cipher.final()]);
  return `${LEGACY_FIELD_CIPHER_VERSION}:${nonce.toString('base64')}:${ct.toString('base64')}:${cipher.getAuthTag().toString('base64')}`;
}

describe('separacion real de claves por boveda', () => {
  it('solo la clave real de cada boveda descifra sus campos', async () => {
    const { db, signUp, cargarVitaminaD } = harness();
    const ctxA = await signUp(personaA);
    await cargarVitaminaD(ctxA);
    insertAllowlist(db, personaB.iss, personaB.sub, new SystemClock());
    const ctxB = await signUp(personaB);
    await cargarVitaminaD(ctxB);
    closeVaultContext(ctxA.vaultId);
    closeVaultContext(ctxB.vaultId);

    const vaultA = findVaultByAccount(db, ctxA.accountId);
    const vaultB = findVaultByAccount(db, ctxB.accountId);
    if (vaultA === null || vaultB === null) {
      throw new Error('las bovedas debian existir');
    }

    const rawA = new DatabaseSync(vaultA.sqlitePath);
    const filaA = rawA.prepare('SELECT id, original_name FROM observations LIMIT 1').get() as {
      id: string;
      original_name: string | null;
    };
    rawA.close();
    expect(filaA.original_name?.startsWith(`${FIELD_CIPHER_VERSION}:`)).toBe(true);
    expect(filaA.original_name).not.toContain(SYNTHETIC_VITAMIN_D_OBSERVATION.originalName);

    const claveRealA = unwrapDataKey({
      masterKey,
      wrapped: vaultA.wrapped,
      aad: Buffer.from(`v1|vault|${vaultA.id}|data-key`, 'utf8'),
    });
    const claveRealB = unwrapDataKey({
      masterKey,
      wrapped: vaultB.wrapped,
      aad: Buffer.from(`v1|vault|${vaultB.id}|data-key`, 'utf8'),
    });

    const cifradorA = createFieldCipher({ vaultId: vaultA.id, dataKey: claveRealA });
    expect(cifradorA.dec('observations', filaA.id, 'original_name', filaA.original_name)).toBe(
      SYNTHETIC_VITAMIN_D_OBSERVATION.originalName,
    );

    const claveCero = createFieldCipher({ vaultId: vaultA.id, dataKey: Buffer.alloc(32, 0) });
    expect(() =>
      claveCero.dec('observations', filaA.id, 'original_name', filaA.original_name ?? ''),
    ).toThrow(/No se pudo descifrar/);

    const claveAzar = createFieldCipher({ vaultId: vaultA.id, dataKey: randomBytes(32) });
    expect(() =>
      claveAzar.dec('observations', filaA.id, 'original_name', filaA.original_name ?? ''),
    ).toThrow(/No se pudo descifrar/);

    const cifradorB = createFieldCipher({ vaultId: vaultB.id, dataKey: claveRealB });
    expect(() =>
      cifradorB.dec('observations', filaA.id, 'original_name', filaA.original_name ?? ''),
    ).toThrow(/No se pudo descifrar/);
  });
});

describe('migracion de datos previos al cifrado enc2', () => {
  it('convierte texto plano historico a enc2 y no se repite al reabrir', async () => {
    const { db, clinical, signUp, cargarVitaminaD } = harness();
    const ctx = await signUp(personaA);
    const observation = await cargarVitaminaD(ctx);

    ctx.db.exec('DELETE FROM field_cipher_migrations');
    ctx.db
      .prepare('UPDATE observations SET original_name = ?, value_quantity = ? WHERE id = ?')
      .run('Examen legado en texto plano', 42, observation.id);
    closeVaultContext(ctx.vaultId);

    const ctx2 = openVaultContext({ catalogDb: db, accountId: ctx.accountId, masterKey });
    expect(ctx2).not.toBeNull();
    const leida = clinical.getObservation(ctx2 ?? ctx, observation.id);
    expect(leida.originalName).toBe('Examen legado en texto plano');
    expect(leida.valueQuantity).toBe(42);

    const contar = (conn: VaultContext | null, sql: string): number => {
      if (conn === null) {
        throw new Error('la boveda debia estar abierta');
      }
      return (conn.db.prepare(sql).get() as { n: number }).n;
    };
    const fila = ctx2?.db
      .prepare('SELECT original_name, value_quantity FROM observations WHERE id = ?')
      .get(observation.id) as { original_name: string | null; value_quantity: string | null };
    expect(fila.original_name?.startsWith(`${FIELD_CIPHER_VERSION}:`)).toBe(true);
    expect(fila.original_name).not.toContain('Examen legado');
    expect(fila.value_quantity?.startsWith(`${FIELD_CIPHER_VERSION}:`)).toBe(true);
    expect(contar(ctx2, 'SELECT COUNT(*) AS n FROM field_cipher_migrations')).toBe(1);
    expect(
      contar(ctx2, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'boveda.cifrado-migrada'"),
    ).toBe(2);

    closeVaultContext(ctx2?.vaultId ?? '');
    const ctx3 = openVaultContext({ catalogDb: db, accountId: ctx.accountId, masterKey });
    expect(ctx3).not.toBeNull();
    expect(clinical.getObservation(ctx3 ?? ctx, observation.id).originalName).toBe(
      'Examen legado en texto plano',
    );
    expect(contar(ctx3, 'SELECT COUNT(*) AS n FROM field_cipher_migrations')).toBe(1);
    expect(
      contar(ctx3, "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'boveda.cifrado-migrada'"),
    ).toBe(2);
    closeVaultContext(ctx3?.vaultId ?? '');
  });

  it('rescata los enc1 cifrados con la clave cero del bug', async () => {
    const { db, clinical, signUp, cargarVitaminaD } = harness();
    const ctx = await signUp(personaA);
    const observation = await cargarVitaminaD(ctx);

    const legado = enc1ConClave(
      ctx.vaultId,
      observation.id,
      'original_name',
      'Hemoglobina glicada',
      Buffer.alloc(32, 0),
    );
    ctx.db.exec('DELETE FROM field_cipher_migrations');
    ctx.db
      .prepare('UPDATE observations SET original_name = ? WHERE id = ?')
      .run(legado, observation.id);
    closeVaultContext(ctx.vaultId);

    const ctx2 = openVaultContext({ catalogDb: db, accountId: ctx.accountId, masterKey });
    expect(ctx2).not.toBeNull();
    expect(clinical.getObservation(ctx2 ?? ctx, observation.id).originalName).toBe(
      'Hemoglobina glicada',
    );

    const fila = ctx2?.db
      .prepare('SELECT original_name FROM observations WHERE id = ?')
      .get(observation.id) as { original_name: string | null };
    expect(fila.original_name?.startsWith(`${FIELD_CIPHER_VERSION}:`)).toBe(true);
    expect(fila.original_name).not.toBe(legado);
    closeVaultContext(ctx2?.vaultId ?? '');
  });

  it('una fila corrupta aborta la migracion completa, revierte y deja auditoria', async () => {
    const { db, clinical, signUp, cargarVitaminaD } = harness();
    const ctx = await signUp(personaA);
    const observation = await cargarVitaminaD(ctx);
    const segunda = clinical.addObservation(ctx, {
      ...SYNTHETIC_VITAMIN_D_OBSERVATION,
      originalName: 'Segundo examen',
      diagnosticReportId: observation.diagnosticReportId,
    });

    const corrupto = enc1ConClave(
      ctx.vaultId,
      segunda.id,
      'original_name',
      'dato cifrado con clave desconocida',
      randomBytes(32),
    );
    ctx.db.exec('DELETE FROM field_cipher_migrations');
    ctx.db
      .prepare('UPDATE observations SET original_name = ? WHERE id = ?')
      .run('Examen legado en texto plano', observation.id);
    ctx.db
      .prepare('UPDATE observations SET original_name = ? WHERE id = ?')
      .run(corrupto, segunda.id);
    closeVaultContext(ctx.vaultId);

    let codigo: string | null = null;
    try {
      openVaultContext({ catalogDb: db, accountId: ctx.accountId, masterKey });
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      codigo = (err as AppError).code;
    }
    expect(codigo).toBe('vault_integrity');

    const vault = findVaultByAccount(db, ctx.accountId);
    const raw = new DatabaseSync(vault?.sqlitePath ?? '');
    const primera = raw
      .prepare('SELECT original_name FROM observations WHERE id = ?')
      .get(observation.id) as { original_name: string | null };
    const marcador = raw.prepare('SELECT COUNT(*) AS n FROM field_cipher_migrations').get() as {
      n: number;
    };
    const corruptas = raw
      .prepare("SELECT detail FROM audit_log WHERE action = 'boveda.cifrado-corrupto'")
      .all() as Array<{ detail: string | null }>;
    raw.close();

    expect(primera.original_name).toBe('Examen legado en texto plano');
    expect(marcador.n).toBe(0);
    expect(corruptas).toHaveLength(1);
    const detalle = JSON.parse(corruptas[0]?.detail ?? '{}') as {
      tabla: string;
      columna: string;
      fila: string;
    };
    expect(detalle.tabla).toBe('observations');
    expect(detalle.columna).toBe('original_name');
    expect(detalle.fila).toBe(segunda.id);
  });

  it('despues de migrar no existe respaldo permanente a la clave cero', async () => {
    const { db, clinical, signUp, cargarVitaminaD } = harness();
    const ctx = await signUp(personaA);
    const observation = await cargarVitaminaD(ctx);

    const legado = enc1ConClave(
      ctx.vaultId,
      observation.id,
      'original_name',
      SYNTHETIC_VITAMIN_D_OBSERVATION.originalName,
      Buffer.alloc(32, 0),
    );
    ctx.db
      .prepare('UPDATE observations SET original_name = ? WHERE id = ?')
      .run(legado, observation.id);
    closeVaultContext(ctx.vaultId);

    const ctx2 = openVaultContext({ catalogDb: db, accountId: ctx.accountId, masterKey });
    expect(ctx2).not.toBeNull();
    let codigo: string | null = null;
    try {
      clinical.getObservation(ctx2 ?? ctx, observation.id);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      codigo = (err as AppError).code;
    }
    expect(codigo).toBe('vault_integrity');
    expect(() => clinical.listObservations(ctx2 ?? ctx)).toThrow(AppError);
    closeVaultContext(ctx2?.vaultId ?? '');
  });
});

describe('validacion de zonas horarias ISO', () => {
  it('rechaza offsets imposibles como +30:99 y acepta zonas reales', async () => {
    const { clinical, signUp, cargarVitaminaD } = harness();
    const ctx = await signUp(personaA);
    const observation = await cargarVitaminaD(ctx);
    const reportId = observation.diagnosticReportId;

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
      clinical.addObservation(ctx, {
        ...SYNTHETIC_VITAMIN_D_OBSERVATION,
        diagnosticReportId: reportId,
        effectiveAt: '2026-07-08T10:00:00+30:99',
      }),
    );
    expectBadRequest(() =>
      clinical.addObservation(ctx, {
        ...SYNTHETIC_VITAMIN_D_OBSERVATION,
        diagnosticReportId: reportId,
        reportedAt: '2026-07-08T10:00:00+14:60',
      }),
    );
    expectBadRequest(() =>
      clinical.upsertProfile(ctx, {
        ...SYNTHETIC_PERSON,
        birthDate: '1990-02-28T00:00:00+00:60',
      }),
    );
    expectBadRequest(() =>
      clinical.createAppointment(ctx, {
        title: 'Zona rota',
        scheduledAt: '2026-07-15T09:00:00+30:99',
      }),
    );

    const valida = clinical.addObservation(ctx, {
      ...SYNTHETIC_VITAMIN_D_OBSERVATION,
      diagnosticReportId: reportId,
      effectiveAt: '2026-07-08T10:00:00-03:00',
    });
    expect(valida.effectiveAt).toBe('2026-07-08T10:00:00-03:00');
  });
});
