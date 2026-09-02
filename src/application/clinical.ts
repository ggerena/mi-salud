import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  type Appointment,
  type AuditEntry,
  assertConfirmable,
  assertManualStatusAllowed,
  assertValueMatchesKind,
  type ClinicalDocument,
  ClinicalRuleError,
  type DiagnosticReport,
  isHumanReviewed,
  type Observation,
  type ObservationVersion,
  type PatientProfile,
  type Provider,
} from '../domain/clinical.ts';
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
}

export function openVaultContext(deps: {
  catalogDb: DatabaseSync;
  accountId: string;
}): VaultContext | null {
  const vault = findVaultByAccount(deps.catalogDb, deps.accountId);
  if (vault === null) {
    return null;
  }
  const db = openVault(vault.sqlitePath);
  return { vaultId: vault.id, accountId: deps.accountId, db };
}

export interface ObservationView extends Observation {
  humanReviewed: boolean;
}

function viewOf(observation: Observation): ObservationView {
  return { ...observation, humanReviewed: isHumanReviewed(observation.status) };
}

const ISO_CLINICAL_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const clinicalDate = z
  .string()
  .regex(ISO_CLINICAL_DATE, 'Fecha ISO 8601 invalida (YYYY-MM-DD o con hora y zona).');
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
  birthDate: clinicalDate.nullish(),
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

function audit(
  ctx: VaultContext,
  clock: Clock,
  action: string,
  resource: string,
  resourceId: string | null,
  detail?: Record<string, unknown>,
): void {
  insertAuditEntry(ctx.db, {
    id: newId(),
    actor: ctx.accountId,
    action,
    resource,
    resourceId,
    outcome: 'permitido',
    occurredAt: clock.now().toISOString(),
    detail: detail === undefined ? null : JSON.stringify(detail),
  });
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
        const existing = findProfile(ctx.db);
        if (existing === null) {
          const profile: PatientProfile = {
            id: newId(),
            displayName: input.displayName,
            birthDate: input.birthDate ?? null,
            timezone: input.timezone ?? null,
            createdAt: now,
            updatedAt: now,
          };
          insertProfile(ctx.db, profile);
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
        updateProfile(ctx.db, updated);
        audit(ctx, clock, 'perfil.actualizado', 'patient_profile', updated.id);
        return updated;
      });
    },

    getProfile(ctx) {
      return findProfile(ctx.db);
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
        insertProvider(ctx.db, provider);
        audit(ctx, clock, 'proveedor.creado', 'provider', provider.id);
        return provider;
      });
    },

    listProviders(ctx) {
      return listProviders(ctx.db);
    },

    createAppointment(ctx, rawInput) {
      return clinical(() => {
        const input = parseOrThrow(appointmentSchema, rawInput);
        if (input.providerId !== undefined && input.providerId !== null) {
          requireExisting(
            findProviderById(ctx.db, input.providerId),
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
        insertAppointment(ctx.db, appointment);
        audit(ctx, clock, 'cita.creada', 'appointment', appointment.id);
        return appointment;
      });
    },

    listAppointments(ctx) {
      return listAppointments(ctx.db);
    },

    cancelAppointment(ctx, id) {
      return clinical(() => {
        const current = findAppointmentById(ctx.db, id);
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
        insertDocument(ctx.db, doc);
        audit(ctx, clock, 'documento.registrado', 'clinical_document', doc.id);
        return doc;
      });
    },

    listDocuments(ctx) {
      return listDocuments(ctx.db);
    },

    createReport(ctx, rawInput) {
      return clinical(() => {
        const input = parseOrThrow(reportSchema, rawInput);
        if (input.documentId !== undefined && input.documentId !== null) {
          requireExisting(
            findDocumentById(ctx.db, input.documentId),
            'El documento referenciado no existe en esta boveda.',
          );
        }
        if (input.providerId !== undefined && input.providerId !== null) {
          requireExisting(
            findProviderById(ctx.db, input.providerId),
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
        insertReport(ctx.db, report);
        audit(ctx, clock, 'informe.creado', 'diagnostic_report', report.id);
        return report;
      });
    },

    listReports(ctx) {
      return listReports(ctx.db);
    },

    addObservation(ctx, rawInput) {
      return clinical(() => {
        const input = parseOrThrow(addObservationSchema, rawInput);
        const report = requireExisting(
          findReportById(ctx.db, input.diagnosticReportId),
          'El informe referenciado no existe en esta boveda.',
        );
        const status = input.confirmed ? 'confirmado' : 'requiere_confirmacion';
        assertManualStatusAllowed(status);
        assertValueMatchesKind({
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
          valueQuantity: input.valueQuantity ?? null,
          valueText: input.valueText ?? null,
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
        insertObservation(ctx.db, observation);
        audit(ctx, clock, 'observacion.creada', 'observation', observation.id, {
          report_id: report.id,
        });
        return viewOf(observation);
      });
    },

    listObservations(ctx, rawFilter) {
      const filter =
        rawFilter === undefined ? {} : parseOrThrow(observationFilterSchema, rawFilter);
      return listObservationRows(ctx.db, filter).map(viewOf);
    },

    getObservation(ctx, id) {
      const found = findObservationById(ctx.db, id);
      if (found === null) {
        notFound('Observacion no encontrada en esta boveda.');
      }
      return viewOf(found);
    },

    confirmObservation(ctx, id) {
      return clinical(() => {
        const current = findObservationById(ctx.db, id);
        if (current === null) {
          notFound('Observacion no encontrada en esta boveda.');
        }
        assertConfirmable(current.status);
        const updated: Observation = {
          ...current,
          status: 'confirmado',
          updatedAt: clock.now().toISOString(),
        };
        updateObservation(ctx.db, updated);
        audit(ctx, clock, 'observacion.confirmada', 'observation', updated.id);
        return viewOf(updated);
      });
    },

    correctObservation(ctx, id, rawChanges) {
      return clinical(() => {
        const current = findObservationById(ctx.db, id);
        if (current === null) {
          notFound('Observacion no encontrada en esta boveda.');
        }
        const changes = parseOrThrow(correctObservationSchema, rawChanges);
        const defined = pickDefined(changes);
        const subset: Record<string, unknown> = {};
        for (const field of CORRECTABLE_FIELDS) {
          if (defined[field] !== undefined) {
            subset[field] = defined[field];
          }
        }
        const next: Observation = { ...current };
        Object.assign(next, subset);
        assertValueMatchesKind({
          valueKind: next.valueKind,
          valueQuantity: next.valueQuantity,
          valueText: next.valueText,
        });
        const now = clock.now().toISOString();
        next.status = 'corregido';
        next.version = current.version + 1;
        next.updatedAt = now;
        insertObservationVersion(ctx.db, {
          id: newId(),
          observationId: current.id,
          version: current.version,
          payload: JSON.stringify(current),
          changedBy: ctx.accountId,
          changedAt: now,
        });
        updateObservation(ctx.db, next);
        audit(ctx, clock, 'observacion.corregida', 'observation', next.id, {
          previous_version: current.version,
          fields: Object.keys(subset),
        });
        return viewOf(next);
      });
    },

    listObservationVersions(ctx, observationId) {
      const observation = findObservationById(ctx.db, observationId);
      if (observation === null) {
        notFound('Observacion no encontrada en esta boveda.');
      }
      return listObservationVersions(ctx.db, observationId);
    },

    listAudit(ctx, rawLimit) {
      const limit =
        rawLimit === undefined
          ? auditLimitSchema.parse(undefined)
          : parseOrThrow(auditLimitSchema, rawLimit);
      return listAuditEntries(ctx.db, limit);
    },
  };
}
