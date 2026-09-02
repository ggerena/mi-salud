import type { DatabaseSync } from 'node:sqlite';
import type {
  Appointment,
  AuditEntry,
  ClinicalDocument,
  DiagnosticReport,
  Observation,
  ObservationVersion,
  PatientProfile,
  Provider,
} from '../../domain/clinical.ts';

export function findProfile(db: DatabaseSync): PatientProfile | null {
  const row = db
    .prepare(
      'SELECT id, display_name, birth_date, timezone, created_at, updated_at FROM patient_profile LIMIT 1',
    )
    .get() as
    | {
        id: string;
        display_name: string;
        birth_date: string | null;
        timezone: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (row === undefined) {
    return null;
  }
  return {
    id: row.id,
    displayName: row.display_name,
    birthDate: row.birth_date,
    timezone: row.timezone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertProfile(db: DatabaseSync, profile: PatientProfile): void {
  db.prepare(
    'INSERT INTO patient_profile (id, display_name, birth_date, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    profile.id,
    profile.displayName,
    profile.birthDate,
    profile.timezone,
    profile.createdAt,
    profile.updatedAt,
  );
}

export function updateProfile(db: DatabaseSync, profile: PatientProfile): void {
  db.prepare(
    'UPDATE patient_profile SET display_name = ?, birth_date = ?, timezone = ?, updated_at = ? WHERE id = ?',
  ).run(profile.displayName, profile.birthDate, profile.timezone, profile.updatedAt, profile.id);
}

export function insertProvider(db: DatabaseSync, provider: Provider): void {
  db.prepare('INSERT INTO providers (id, kind, name, role, created_at) VALUES (?, ?, ?, ?, ?)').run(
    provider.id,
    provider.kind,
    provider.name,
    provider.role,
    provider.createdAt,
  );
}

export function listProviders(db: DatabaseSync): Provider[] {
  const rows = db
    .prepare('SELECT id, kind, name, role, created_at FROM providers ORDER BY created_at, id')
    .all() as Array<{
    id: string;
    kind: string;
    name: string;
    role: string | null;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as Provider['kind'],
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
  }));
}

export function findProviderById(db: DatabaseSync, id: string): Provider | null {
  const row = db
    .prepare('SELECT id, kind, name, role, created_at FROM providers WHERE id = ?')
    .get(id) as
    | { id: string; kind: string; name: string; role: string | null; created_at: string }
    | undefined;
  if (row === undefined) {
    return null;
  }
  return {
    id: row.id,
    kind: row.kind as Provider['kind'],
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function insertAppointment(db: DatabaseSync, appointment: Appointment): void {
  db.prepare(
    `INSERT INTO appointments (id, title, scheduled_at, provider_id, location, notes, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    appointment.id,
    appointment.title,
    appointment.scheduledAt,
    appointment.providerId,
    appointment.location,
    appointment.notes,
    appointment.status,
    appointment.createdAt,
    appointment.updatedAt,
  );
}

export function listAppointments(db: DatabaseSync): Appointment[] {
  const rows = db
    .prepare(
      'SELECT id, title, scheduled_at, provider_id, location, notes, status, created_at, updated_at FROM appointments ORDER BY scheduled_at, id',
    )
    .all() as Array<{
    id: string;
    title: string;
    scheduled_at: string;
    provider_id: string | null;
    location: string | null;
    notes: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    scheduledAt: row.scheduled_at,
    providerId: row.provider_id,
    location: row.location,
    notes: row.notes,
    status: row.status as Appointment['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function findAppointmentById(db: DatabaseSync, id: string): Appointment | null {
  const row = db
    .prepare(
      'SELECT id, title, scheduled_at, provider_id, location, notes, status, created_at, updated_at FROM appointments WHERE id = ?',
    )
    .get(id) as
    | {
        id: string;
        title: string;
        scheduled_at: string;
        provider_id: string | null;
        location: string | null;
        notes: string | null;
        status: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (row === undefined) {
    return null;
  }
  return {
    id: row.id,
    title: row.title,
    scheduledAt: row.scheduled_at,
    providerId: row.provider_id,
    location: row.location,
    notes: row.notes,
    status: row.status as Appointment['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function updateAppointmentStatus(
  db: DatabaseSync,
  input: { id: string; status: Appointment['status']; updatedAt: string },
): void {
  db.prepare('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?').run(
    input.status,
    input.updatedAt,
    input.id,
  );
}

export function insertDocument(db: DatabaseSync, doc: ClinicalDocument): void {
  db.prepare(
    `INSERT INTO clinical_documents (id, title, kind, issuer, doc_date, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    doc.id,
    doc.title,
    doc.kind,
    doc.issuer,
    doc.docDate,
    doc.notes,
    doc.createdAt,
    doc.updatedAt,
  );
}

export function listDocuments(db: DatabaseSync): ClinicalDocument[] {
  const rows = db
    .prepare(
      'SELECT id, title, kind, issuer, doc_date, notes, created_at, updated_at FROM clinical_documents ORDER BY created_at, id',
    )
    .all() as Array<{
    id: string;
    title: string;
    kind: string;
    issuer: string | null;
    doc_date: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind as ClinicalDocument['kind'],
    issuer: row.issuer,
    docDate: row.doc_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function findDocumentById(db: DatabaseSync, id: string): ClinicalDocument | null {
  const row = db
    .prepare(
      'SELECT id, title, kind, issuer, doc_date, notes, created_at, updated_at FROM clinical_documents WHERE id = ?',
    )
    .get(id) as
    | {
        id: string;
        title: string;
        kind: string;
        issuer: string | null;
        doc_date: string | null;
        notes: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (row === undefined) {
    return null;
  }
  return {
    id: row.id,
    title: row.title,
    kind: row.kind as ClinicalDocument['kind'],
    issuer: row.issuer,
    docDate: row.doc_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertReport(db: DatabaseSync, report: DiagnosticReport): void {
  db.prepare(
    `INSERT INTO diagnostic_reports (id, document_id, provider_id, issuer_text, reported_at, conclusion, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    report.id,
    report.documentId,
    report.providerId,
    report.issuerText,
    report.reportedAt,
    report.conclusion,
    report.createdAt,
  );
}

export function listReports(db: DatabaseSync): DiagnosticReport[] {
  const rows = db
    .prepare(
      'SELECT id, document_id, provider_id, issuer_text, reported_at, conclusion, created_at FROM diagnostic_reports ORDER BY created_at, id',
    )
    .all() as Array<{
    id: string;
    document_id: string | null;
    provider_id: string | null;
    issuer_text: string | null;
    reported_at: string | null;
    conclusion: string | null;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    providerId: row.provider_id,
    issuerText: row.issuer_text,
    reportedAt: row.reported_at,
    conclusion: row.conclusion,
    createdAt: row.created_at,
  }));
}

export function findReportById(db: DatabaseSync, id: string): DiagnosticReport | null {
  const row = db
    .prepare(
      'SELECT id, document_id, provider_id, issuer_text, reported_at, conclusion, created_at FROM diagnostic_reports WHERE id = ?',
    )
    .get(id) as
    | {
        id: string;
        document_id: string | null;
        provider_id: string | null;
        issuer_text: string | null;
        reported_at: string | null;
        conclusion: string | null;
        created_at: string;
      }
    | undefined;
  if (row === undefined) {
    return null;
  }
  return {
    id: row.id,
    documentId: row.document_id,
    providerId: row.provider_id,
    issuerText: row.issuer_text,
    reportedAt: row.reported_at,
    conclusion: row.conclusion,
    createdAt: row.created_at,
  };
}

interface ObservationRow {
  id: string;
  diagnostic_report_id: string;
  code: string | null;
  original_name: string;
  value_kind: string;
  value_quantity: number | null;
  value_text: string | null;
  unit_original: string | null;
  unit_normalized: string | null;
  reference_range_original: string | null;
  flag_original: string | null;
  effective_at: string | null;
  reported_at: string | null;
  method: string | null;
  specimen: string | null;
  capture_method: string;
  status: string;
  source_ref: string | null;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const OBSERVATION_COLUMNS =
  'id, diagnostic_report_id, code, original_name, value_kind, value_quantity, value_text, unit_original, unit_normalized, reference_range_original, flag_original, effective_at, reported_at, method, specimen, capture_method, status, source_ref, version, created_by, created_at, updated_at';

function rowToObservation(row: ObservationRow): Observation {
  return {
    id: row.id,
    diagnosticReportId: row.diagnostic_report_id,
    code: row.code,
    originalName: row.original_name,
    valueKind: row.value_kind as Observation['valueKind'],
    valueQuantity: row.value_quantity,
    valueText: row.value_text,
    unitOriginal: row.unit_original,
    unitNormalized: row.unit_normalized,
    referenceRangeOriginal: row.reference_range_original,
    flagOriginal: row.flag_original as Observation['flagOriginal'],
    effectiveAt: row.effective_at,
    reportedAt: row.reported_at,
    method: row.method,
    specimen: row.specimen,
    captureMethod: row.capture_method as Observation['captureMethod'],
    status: row.status as Observation['status'],
    sourceRef: row.source_ref,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertObservation(db: DatabaseSync, observation: Observation): void {
  db.prepare(
    `INSERT INTO observations (
      id, diagnostic_report_id, code, original_name, value_kind, value_quantity, value_text,
      unit_original, unit_normalized, reference_range_original, flag_original, effective_at,
      reported_at, method, specimen, capture_method, status, source_ref, version, created_by,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    observation.id,
    observation.diagnosticReportId,
    observation.code,
    observation.originalName,
    observation.valueKind,
    observation.valueQuantity,
    observation.valueText,
    observation.unitOriginal,
    observation.unitNormalized,
    observation.referenceRangeOriginal,
    observation.flagOriginal,
    observation.effectiveAt,
    observation.reportedAt,
    observation.method,
    observation.specimen,
    observation.captureMethod,
    observation.status,
    observation.sourceRef,
    observation.version,
    observation.createdBy,
    observation.createdAt,
    observation.updatedAt,
  );
}

export function updateObservation(db: DatabaseSync, observation: Observation): void {
  db.prepare(
    `UPDATE observations SET
      code = ?, original_name = ?, value_kind = ?, value_quantity = ?, value_text = ?,
      unit_original = ?, unit_normalized = ?, reference_range_original = ?, flag_original = ?,
      effective_at = ?, reported_at = ?, method = ?, specimen = ?, capture_method = ?,
      status = ?, source_ref = ?, version = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    observation.code,
    observation.originalName,
    observation.valueKind,
    observation.valueQuantity,
    observation.valueText,
    observation.unitOriginal,
    observation.unitNormalized,
    observation.referenceRangeOriginal,
    observation.flagOriginal,
    observation.effectiveAt,
    observation.reportedAt,
    observation.method,
    observation.specimen,
    observation.captureMethod,
    observation.status,
    observation.sourceRef,
    observation.version,
    observation.updatedAt,
    observation.id,
  );
}

export function findObservationById(db: DatabaseSync, id: string): Observation | null {
  const row = db.prepare(`SELECT ${OBSERVATION_COLUMNS} FROM observations WHERE id = ?`).get(id) as
    | ObservationRow
    | undefined;
  if (row === undefined) {
    return null;
  }
  return rowToObservation(row);
}

export function listObservations(
  db: DatabaseSync,
  filter: { reportId?: string | undefined } = {},
): Observation[] {
  const rows =
    filter.reportId === undefined
      ? (db
          .prepare(`SELECT ${OBSERVATION_COLUMNS} FROM observations ORDER BY created_at, id`)
          .all() as unknown as ObservationRow[])
      : (db
          .prepare(
            `SELECT ${OBSERVATION_COLUMNS} FROM observations WHERE diagnostic_report_id = ? ORDER BY created_at, id`,
          )
          .all(filter.reportId) as unknown as ObservationRow[]);
  return rows.map(rowToObservation);
}

export function insertObservationVersion(db: DatabaseSync, version: ObservationVersion): void {
  db.prepare(
    'INSERT INTO observation_versions (id, observation_id, version, payload, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    version.id,
    version.observationId,
    version.version,
    version.payload,
    version.changedBy,
    version.changedAt,
  );
}

export function listObservationVersions(
  db: DatabaseSync,
  observationId: string,
): ObservationVersion[] {
  const rows = db
    .prepare(
      'SELECT id, observation_id, version, payload, changed_by, changed_at FROM observation_versions WHERE observation_id = ? ORDER BY version',
    )
    .all(observationId) as Array<{
    id: string;
    observation_id: string;
    version: number;
    payload: string;
    changed_by: string;
    changed_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    observationId: row.observation_id,
    version: row.version,
    payload: row.payload,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
  }));
}

export function insertAuditEntry(db: DatabaseSync, entry: AuditEntry): void {
  db.prepare(
    'INSERT INTO audit_log (id, actor, action, resource, resource_id, outcome, occurred_at, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    entry.id,
    entry.actor,
    entry.action,
    entry.resource,
    entry.resourceId,
    entry.outcome,
    entry.occurredAt,
    entry.detail,
  );
}

export function listAuditEntries(db: DatabaseSync, limit: number): AuditEntry[] {
  const rows = db
    .prepare(
      'SELECT id, actor, action, resource, resource_id, outcome, occurred_at, detail FROM audit_log ORDER BY occurred_at DESC, id LIMIT ?',
    )
    .all(limit) as Array<{
    id: string;
    actor: string;
    action: string;
    resource: string;
    resource_id: string | null;
    outcome: string;
    occurred_at: string;
    detail: string | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    actor: row.actor,
    action: row.action,
    resource: row.resource,
    resourceId: row.resource_id,
    outcome: row.outcome as AuditEntry['outcome'],
    occurredAt: row.occurred_at,
    detail: row.detail,
  }));
}
