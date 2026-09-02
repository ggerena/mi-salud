import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  type Appointment,
  type AuditEntry,
  assertConfirmable,
  assertManualStatusAllowed,
  type ClinicalDocument,
  ClinicalRuleError,
  type DiagnosticReport,
  isHumanReviewed,
  normalizeValueFields,
  type Observation,
  type ObservationVersion,
  type PatientProfile,
  type Provider,
} from '../domain/clinical.ts';
import {
  createFieldCipher,
  type FieldCipher,
  unwrapDataKey,
} from '../infrastructure/crypto/index.ts';
import { findVaultByAccount } from '../infrastructure/sqlite/catalog.ts';
import {
  findAppointmentById,
  findDocumentById,
  findObservationById,
  findProfile,
  findProviderById,
  findReportById,
  insertAppointment,
  insertAuditEntry,
  insertDocument,
  insertObservation,
  insertObservationVersion,
  insertProfile,
  insertProvider,
  insertReport,
  listAppointments,
  listAuditEntries,
  listDocuments,
  listObservations as listObservationRows,
  listObservationVersions,
  listProviders,
  listReports,
  updateAppointmentStatus,
  updateObservation,
  updateProfile,
} from '../infrastructure/sqlite/clinical.ts';
import { openVault } from '../infrastructure/sqlite/vault.ts';
import type { Clock } from '../shared/clock.ts';
import { AppError } from '../shared/errors.ts';
import { newId } from '../shared/ids.ts';

export interface VaultContext {
  vaultId: string;
  accountId: string;
  db: DatabaseSync;
  cipher: FieldCipher;
}

interface CachedVault {
  path: string;
  db: DatabaseSync;
  cipher: FieldCipher;
}

const vaultCache = new Map<string, CachedVault>();

export function openVaultContext(deps: {
  catalogDb: DatabaseSync;
  accountId: string;
  masterKey: Buffer;
}): VaultContext | null {
  const vault = findVaultByAccount(deps.catalogDb, deps.accountId);
  if (vault === null) {
    return null;
  }
  const cached = vaultCache.get(vault.id);
  if (cached !== undefined && cached.path === vault.sqlitePath && cached.db.isOpen) {
    return { vaultId: vault.id, accountId: deps.accountId, db: cached.db, cipher: cached.cipher };
  }
  const dataKey = unwrapDataKey({
    masterKey: deps.masterKey,
    wrapped: vault.wrapped,
    aad: Buffer.from(`v1|vault|${vault.id}|data-key`, 'utf8'),
  });
  const db = openVault(vault.sqlitePath);
  const cipher = createFieldCipher({ vaultId: vault.id, dataKey });
  dataKey.fill(0);
  vaultCache.set(vault.id, { path: vault.sqlitePath, db, cipher });
  return { vaultId: vault.id, accountId: deps.accountId, db, cipher };
}

export function closeVaultContext(vaultId: string): void {
  const cached = vaultCache.get(vaultId);
  if (cached !== undefined) {
    if (cached.db.isOpen) {
      cached.db.close();
    }
    vaultCache.delete(vaultId);
  }
}

export interface ObservationView extends Observation {
  humanReviewed: boolean;
}

function viewOf(observation: Observation): ObservationView {
  return { ...observation, humanReviewed: isHumanReviewed(observation.status) };
}

const ISO_CLINICAL_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

function isRealCalendarDate(value: string): boolean {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
  );
}

function hasValidTimePart(value: string): boolean {
  const timePart = value.slice(11);
  if (timePart === '') {
    return true;
  }
  const hours = Number(timePart.slice(0, 2));
  const minutes = Number(timePart.slice(3, 5));
  if (hours > 23 || minutes > 59) {
    return false;
  }
  if (timePart.length >= 8) {
    const seconds = Number(timePart.slice(6, 8));
    if (seconds > 59) {
      return false;
    }
  }
  return true;
}

const clinicalDate = z
  .string()
  .regex(ISO_CLINICAL_DATE, 'Fecha ISO 8601 invalida (YYYY-MM-DD o con hora y zona).')
  .refine(isRealCalendarDate, 'La fecha no existe en el calendario (dia o mes imposibles).')
  .refine(hasValidTimePart, 'La hora indicada no existe.');

const scheduledAtSchema = z.iso.datetime({
  offset: true,
  message: 'La fecha de la cita exige ISO 8601 con hora y zona.',
});

const IANA_ZONES = new Set(Intl.supportedValuesOf('timeZone'));
const timezoneSchema = z
  .string()
  .refine((tz) => IANA_ZONES.has(tz), 'Zona horaria IANA desconocida.');

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  birthDate: clinicalDate
    .nullish()
    .refine((value) => value === null || value === undefined || new Date(value) <= new Date(), {
      message: 'La fecha de nacimiento no puede ser futura.',
    }),
  timezone: timezoneSchema.nullish(),
});

const providerSchema = z.object({
  kind: z.enum(['profesional', 'organizacion']),
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(200).nullish(),
});

const appointmentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  scheduledAt: scheduledAtSchema,
  providerId: z.uuid().nullish(),
  location: z.string().trim().min(1).max(200).nullish(),
  notes: z.string().trim().min(1).max(2000).nullish(),
});

const documentSchema = z.object({
  title: z.string().trim().min(1).max(300),
  kind: z.enum(['informe', 'receta', 'otro']),
  issuer: z.string().trim().min(1).max(200).nullish(),
  docDate: clinicalDate.nullish(),
  notes: z.string().trim().min(1).max(2000).nullish(),
});

const reportSchema = z.object({
  documentId: z.uuid().nullish(),
  providerId: z.uuid().nullish(),
  issuerText: z.string().trim().min(1).max(200).nullish(),
  reportedAt: clinicalDate.nullish(),
  conclusion: z.string().trim().min(1).max(4000).nullish(),
});

const observationValueSchema = z.object({
  code: z.string().trim().min(1).max(50).nullish(),
  originalName: z.string().trim().min(1).max(300),
  valueKind: z.enum(['cantidad', 'texto', 'codigo', 'booleano', 'no_informado']),
  valueQuantity: z.number().finite().nullish(),
  valueText: z.string().trim().min(1).max(500).nullish(),
  unitOriginal: z.string().trim().min(1).max(80).nullish(),
  referenceRangeOriginal: z.string().trim().min(1).max(200).nullish(),
  flagOriginal: z.enum(['bajo', 'normal', 'alto', 'critico', 'no_informado']).nullish(),
  effectiveAt: clinicalDate.nullish(),
  reportedAt: clinicalDate.nullish(),
  method: z.string().trim().min(1).max(200).nullish(),
  specimen: z.string().trim().min(1).max(200).nullish(),
  sourceRef: z.string().trim().min(1).max(200).nullish(),
});

const addObservationSchema = observationValueSchema.extend({
  diagnosticReportId: z.uuid(),
  confirmed: z.boolean().default(false),
});

const correctObservationSchema = observationValueSchema.partial();

const auditLimitSchema = z.number().int().min(1).max(500).default(100);

const observationFilterSchema = z.object({ reportId: z.uuid().optional() });

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'entrada'}: ${issue.message}`)
      .join('; ');
    throw new AppError('bad_request', 400, `Entrada invalida: ${detail}`);
  }
  return result.data;
}

function clinical<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ClinicalRuleError) {
      throw new AppError('bad_request', 400, err.message);
    }
    throw err;
  }
}

function notFound(message: string): never {
  throw new AppError('not_found', 404, message);
}

function requireExisting<T>(value: T | null, message: string): T {
  if (value === null) {
    throw new AppError('bad_request', 400, message);
  }
  return value;
}

function inTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // la transaccion ya no estaba activa; el error original manda
    }
    throw err;
  }
}

function writeAudit(
  ctx: VaultContext,
  clock: Clock,
  action: string,
  resource: string,
  resourceId: string | null,
  outcome: 'permitido' | 'denegado',
  detail?: Record<string, unknown>,
): void {
  insertAuditEntry(ctx.db, {
    id: newId(),
    actor: ctx.accountId,
    action,
    resource,
    resourceId,
    outcome,
    occurredAt: clock.now().toISOString(),
    detail: detail === undefined ? null : JSON.stringify(detail),
  });
}

function audit(
  ctx: VaultContext,
  clock: Clock,
  action: string,
  resource: string,
  resourceId: string | null,
  detail?: Record<string, unknown>,
): void {
  writeAudit(ctx, clock, action, resource, resourceId, 'permitido', detail);
}

function auditDeniedThenNotFound(
  ctx: VaultContext,
  clock: Clock,
  action: string,
  resource: string,
  resourceId: string,
): never {
  writeAudit(ctx, clock, action, resource, resourceId, 'denegado');
  notFound('Recurso no encontrado en esta boveda.');
}

function pickDefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as Partial<T>;
}

const CORRECTABLE_FIELDS = [
  'code',
  'originalName',
  'valueKind',
  'valueQuantity',
  'valueText',
  'unitOriginal',
  'referenceRangeOriginal',
  'flagOriginal',
  'effectiveAt',
  'reportedAt',
  'method',
  'specimen',
  'sourceRef',
] as const;

export interface ClinicalService {
  upsertProfile(ctx: VaultContext, input: z.infer<typeof profileSchema>): PatientProfile;
  getProfile(ctx: VaultContext): PatientProfile | null;
  createProvider(ctx: VaultContext, input: z.infer<typeof providerSchema>): Provider;
  listProviders(ctx: VaultContext): Provider[];
  createAppointment(ctx: VaultContext, input: z.infer<typeof appointmentSchema>): Appointment;
  listAppointments(ctx: VaultContext): Appointment[];
  cancelAppointment(ctx: VaultContext, id: string): Appointment;
  registerDocument(ctx: VaultContext, input: z.infer<typeof documentSchema>): ClinicalDocument;
  listDocuments(ctx: VaultContext): ClinicalDocument[];
  createReport(ctx: VaultContext, input: z.infer<typeof reportSchema>): DiagnosticReport;
  listReports(ctx: VaultContext): DiagnosticReport[];
  addObservation(ctx: VaultContext, input: z.input<typeof addObservationSchema>): ObservationView;
  listObservations(
    ctx: VaultContext,
    filter?: { reportId?: string | undefined },
  ): Array<ObservationView>;
  getObservation(ctx: VaultContext, id: string): ObservationView;
  confirmObservation(ctx: VaultContext, id: string): ObservationView;
  correctObservation(
    ctx: VaultContext,
    id: string,
    changes: Partial<z.infer<typeof observationValueSchema>>,
  ): ObservationView;
  listObservationVersions(ctx: VaultContext, observationId: string): ObservationVersion[];
  listAudit(ctx: VaultContext, limit?: number): AuditEntry[];
}

export function createClinicalService(deps: { clock: Clock }): ClinicalService {
  const { clock } = deps;

  return {
    upsertProfile(ctx, rawInput) {
      return clinical(() => {
        const input = parseOrThrow(profileSchema, rawInput);
        const now = clock.now().toISOString();
        const existing = findProfile(ctx.db, ctx.cipher);
        if (existing === null) {
          const profile: PatientProfile = {
            id: newId(),
            displayName: input.displayName,
            birthDate: input.birthDate ?? null,
            timezone: input.timezone ?? null,
            createdAt: now,
            updatedAt: now,
          };
          insertProfile(ctx.db, ctx.cipher, profile);
          audit(ctx, clock, 'perfil.creado', 'patient_profile', profile.id);
          return profile;
        }
        const updated: PatientProfile = {
          ...existing,
          displayName: input.displayName,
          birthDate: input.birthDate ?? null,
          timezone: input.timezone ?? null,
          updatedAt: now,
        };
        updateProfile(ctx.db, ctx.cipher, updated);
        audit(ctx, clock, 'perfil.actualizado', 'patient_profile', updated.id);
        return updated;
      });
    },

    getProfile(ctx) {
      const profile = findProfile(ctx.db, ctx.cipher);
      if (profile !== null) {
        audit(ctx, clock, 'perfil.leido', 'patient_profile', profile.id);
      }
      return profile;
    },

    createProvider(ctx, rawInput) {
      return clinical(() => {
        const input = parseOrThrow(providerSchema, rawInput);
        const provider: Provider = {
          id: newId(),
          kind: input.kind,
          name: input.name,
          role: input.role ?? null,
          createdAt: clock.now().toISOString(),
        };
        insertProvider(ctx.db, ctx.cipher, provider);
        audit(ctx, clock, 'proveedor.creado', 'provider', provider.id);
        return provider;
      });
    },

    listProviders(ctx) {
      const providers = listProviders(ctx.db, ctx.cipher);
      audit(ctx, clock, 'proveedores.listados', 'provider', null, { count: providers.length });
      return providers;
    },

    createAppointment(ctx, rawInput) {
      return clinical(() => {
        const input = parseOrThrow(appointmentSchema, rawInput);
        if (input.providerId !== undefined && input.providerId !== null) {
          requireExisting(
            findProviderById(ctx.db, ctx.cipher, input.providerId),
            'El proveedor referenciado no existe en esta boveda.',
          );
        }
        const now = clock.now().toISOString();
        const appointment: Appointment = {
          id: newId(),
          title: input.title,
          scheduledAt: input.scheduledAt,
          providerId: input.providerId ?? null,
          location: input.location ?? null,
          notes: input.notes ?? null,
          status: 'agendada',
          createdAt: now,
          updatedAt: now,
        };
        insertAppointment(ctx.db, ctx.cipher, appointment);
        audit(ctx, clock, 'cita.creada', 'appointment', appointment.id);
        return appointment;
      });
    },

    listAppointments(ctx) {
      const appointments = listAppointments(ctx.db, ctx.cipher);
      audit(ctx, clock, 'citas.listadas', 'appointment', null, { count: appointments.length });
      return appointments;
    },

    cancelAppointment(ctx, id) {
      return clinical(() => {
        const current = findAppointmentById(ctx.db, ctx.cipher, id);
        if (current === null) {
          notFound('Cita no encontrada en esta boveda.');
        }
        if (current.status === 'cancelada') {
          return current;
        }
        const updated: Appointment = {
          ...current,
          status: 'cancelada',
          updatedAt: clock.now().toISOString(),
        };
        updateAppointmentStatus(ctx.db, {
          id: updated.id,
          status: updated.status,
          updatedAt: updated.updatedAt,
        });
        audit(ctx, clock, 'cita.cancelada', 'appointment', updated.id);
        return updated;
      });
    },

    registerDocument(ctx, rawInput) {
      return clinical(() => {
        const input = parseOrThrow(documentSchema, rawInput);
        const now = clock.now().toISOString();
        const doc: ClinicalDocument = {
          id: newId(),
          title: input.title,
          kind: input.kind,
          issuer: input.issuer ?? null,
          docDate: input.docDate ?? null,
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
        };
        insertDocument(ctx.db, ctx.cipher, doc);
        audit(ctx, clock, 'documento.registrado', 'clinical_document', doc.id);
        return doc;
      });
    },

    listDocuments(ctx) {
      const documents = listDocuments(ctx.db, ctx.cipher);
      audit(ctx, clock, 'documentos.listados', 'clinical_document', null, {
        count: documents.length,
      });
      return documents;
    },

    createReport(ctx, rawInput) {
      return clinical(() => {
        const input = parseOrThrow(reportSchema, rawInput);
        if (input.documentId !== undefined && input.documentId !== null) {
          requireExisting(
            findDocumentById(ctx.db, ctx.cipher, input.documentId),
            'El documento referenciado no existe en esta boveda.',
          );
        }
        if (input.providerId !== undefined && input.providerId !== null) {
          requireExisting(
            findProviderById(ctx.db, ctx.cipher, input.providerId),
            'El proveedor referenciado no existe en esta boveda.',
          );
        }
        const report: DiagnosticReport = {
          id: newId(),
          documentId: input.documentId ?? null,
          providerId: input.providerId ?? null,
          issuerText: input.issuerText ?? null,
          reportedAt: input.reportedAt ?? null,
          conclusion: input.conclusion ?? null,
          createdAt: clock.now().toISOString(),
        };
        insertReport(ctx.db, ctx.cipher, report);
        audit(ctx, clock, 'informe.creado', 'diagnostic_report', report.id);
        return report;
      });
    },

    listReports(ctx) {
      const reports = listReports(ctx.db, ctx.cipher);
      audit(ctx, clock, 'informes.listados', 'diagnostic_report', null, { count: reports.length });
      return reports;
    },

    addObservation(ctx, rawInput) {
      return clinical(() => {
        const input = parseOrThrow(addObservationSchema, rawInput);
        const report = requireExisting(
          findReportById(ctx.db, ctx.cipher, input.diagnosticReportId),
          'El informe referenciado no existe en esta boveda.',
        );
        const status = input.confirmed ? 'confirmado' : 'requiere_confirmacion';
        assertManualStatusAllowed(status);
        const value = normalizeValueFields({
          valueKind: input.valueKind,
          valueQuantity: input.valueQuantity ?? null,
          valueText: input.valueText ?? null,
        });
        const now = clock.now().toISOString();
        const observation: Observation = {
          id: newId(),
          diagnosticReportId: report.id,
          code: input.code ?? null,
          originalName: input.originalName,
          valueKind: input.valueKind,
          valueQuantity: value.valueQuantity,
          valueText: value.valueText,
          unitOriginal: input.unitOriginal ?? null,
          unitNormalized: null,
          referenceRangeOriginal: input.referenceRangeOriginal ?? null,
          flagOriginal: input.flagOriginal ?? null,
          effectiveAt: input.effectiveAt ?? null,
          reportedAt: input.reportedAt ?? null,
          method: input.method ?? null,
          specimen: input.specimen ?? null,
          captureMethod: 'manual',
          status,
          sourceRef: input.sourceRef ?? null,
          version: 1,
          createdBy: ctx.accountId,
          createdAt: now,
          updatedAt: now,
        };
        insertObservation(ctx.db, ctx.cipher, observation);
        audit(ctx, clock, 'observacion.creada', 'observation', observation.id, {
          report_id: report.id,
        });
        return viewOf(observation);
      });
    },

    listObservations(ctx, rawFilter) {
      const filter =
        rawFilter === undefined ? {} : parseOrThrow(observationFilterSchema, rawFilter);
      const observations = listObservationRows(ctx.db, ctx.cipher, filter).map(viewOf);
      audit(ctx, clock, 'observaciones.listadas', 'observation', null, {
        count: observations.length,
      });
      return observations;
    },

    getObservation(ctx, id) {
      const found = findObservationById(ctx.db, ctx.cipher, id);
      if (found === null) {
        auditDeniedThenNotFound(ctx, clock, 'observacion.leida', 'observation', id);
      }
      audit(ctx, clock, 'observacion.leida', 'observation', found.id);
      return viewOf(found);
    },

    confirmObservation(ctx, id) {
      return clinical(() => {
        const current = findObservationById(ctx.db, ctx.cipher, id);
        if (current === null) {
          auditDeniedThenNotFound(ctx, clock, 'observacion.confirmada', 'observation', id);
        }
        assertConfirmable(current.status);
        const updated: Observation = {
          ...current,
          status: 'confirmado',
          updatedAt: clock.now().toISOString(),
        };
        return inTransaction(ctx.db, () => {
          const changed = updateObservation(ctx.db, ctx.cipher, updated, current.version);
          if (!changed) {
            throw new AppError(
              'conflict',
              409,
              'La observacion fue modificada por otra operacion; reintenta.',
            );
          }
          audit(ctx, clock, 'observacion.confirmada', 'observation', updated.id);
          return viewOf(updated);
        });
      });
    },

    correctObservation(ctx, id, rawChanges) {
      return clinical(() => {
        const changes = parseOrThrow(correctObservationSchema, rawChanges);
        const defined = pickDefined(changes);
        const subset: Record<string, unknown> = {};
        for (const field of CORRECTABLE_FIELDS) {
          if (defined[field] !== undefined) {
            subset[field] = defined[field];
          }
        }
        const current = findObservationById(ctx.db, ctx.cipher, id);
        if (current === null) {
          auditDeniedThenNotFound(ctx, clock, 'observacion.corregida', 'observation', id);
        }
        return inTransaction(ctx.db, () => {
          const insideTx = findObservationById(ctx.db, ctx.cipher, id);
          if (insideTx === null || insideTx.version !== current.version) {
            throw new AppError(
              'conflict',
              409,
              'La observacion fue modificada por otra operacion; reintenta.',
            );
          }
          const next: Observation = { ...insideTx };
          Object.assign(next, subset);
          const value = normalizeValueFields({
            valueKind: next.valueKind,
            valueQuantity: next.valueQuantity,
            valueText: next.valueText,
          });
          next.valueQuantity = value.valueQuantity;
          next.valueText = value.valueText;
          const now = clock.now().toISOString();
          next.status = 'corregido';
          next.version = insideTx.version + 1;
          next.updatedAt = now;
          insertObservationVersion(ctx.db, ctx.cipher, {
            id: newId(),
            observationId: insideTx.id,
            version: insideTx.version,
            payload: JSON.stringify(insideTx),
            changedBy: ctx.accountId,
            changedAt: now,
          });
          const changed = updateObservation(ctx.db, ctx.cipher, next, insideTx.version);
          if (!changed) {
            throw new AppError(
              'conflict',
              409,
              'La observacion fue modificada por otra operacion; reintenta.',
            );
          }
          audit(ctx, clock, 'observacion.corregida', 'observation', next.id, {
            previous_version: insideTx.version,
            fields: Object.keys(subset),
          });
          return viewOf(next);
        });
      });
    },

    listObservationVersions(ctx, observationId) {
      const observation = findObservationById(ctx.db, ctx.cipher, observationId);
      if (observation === null) {
        auditDeniedThenNotFound(ctx, clock, 'observacion.versiones', 'observation', observationId);
      }
      const versions = listObservationVersions(ctx.db, ctx.cipher, observationId);
      audit(ctx, clock, 'observacion.versiones', 'observation', observationId, {
        count: versions.length,
      });
      return versions;
    },

    listAudit(ctx, rawLimit) {
      const limit =
        rawLimit === undefined
          ? auditLimitSchema.parse(undefined)
          : parseOrThrow(auditLimitSchema, rawLimit);
      const entries = listAuditEntries(ctx.db, limit);
      audit(ctx, clock, 'auditoria.listada', 'audit_log', null, { count: entries.length });
      return entries;
    },
  };
}
