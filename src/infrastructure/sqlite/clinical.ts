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
import type { FieldCipher } from '../crypto/fields.ts';

const PROFILE_SCOPE = 'patient_profile';
const PROVIDER_SCOPE = 'providers';
const APPOINTMENT_SCOPE = 'appointments';
const DOCUMENT_SCOPE = 'clinical_documents';
const REPORT_SCOPE = 'diagnostic_reports';
const OBSERVATION_SCOPE = 'observations';
const VERSION_SCOPE = 'observation_versions';

export function findProfile(db: DatabaseSync, cipher: FieldCipher): PatientProfile | null {
  const row = db
    .prepare(
      'SELECT id, display_name, birth_date, timezone, created_at, updated_at FROM patient_profile LIMIT 1',
    )
    .get() as
    | {
        id: string;
        display_name: string | null;
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
    displayName: cipher.dec(PROFILE_SCOPE, row.id, 'display_name', row.display_name) ?? '',
    birthDate: cipher.dec(PROFILE_SCOPE, row.id, 'birth_date', row.birth_date),
    timezone: cipher.dec(PROFILE_SCOPE, row.id, 'timezone', row.timezone),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertProfile(
  db: DatabaseSync,
  cipher: FieldCipher,
  profile: PatientProfile,
): void {
  db.prepare(
    'INSERT INTO patient_profile (id, display_name, birth_date, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    profile.id,
    cipher.enc(PROFILE_SCOPE, profile.id, 'display_name', profile.displayName),
    cipher.enc(PROFILE_SCOPE, profile.id, 'birth_date', profile.birthDate),
    cipher.enc(PROFILE_SCOPE, profile.id, 'timezone', profile.timezone),
    profile.createdAt,
    profile.updatedAt,
  );
}

export function updateProfile(
  db: DatabaseSync,
  cipher: FieldCipher,
  profile: PatientProfile,
): void {
  db.prepare(
    'UPDATE patient_profile SET display_name = ?, birth_date = ?, timezone = ?, updated_at = ? WHERE id = ?',
  ).run(
    cipher.enc(PROFILE_SCOPE, profile.id, 'display_name', profile.displayName),
    cipher.enc(PROFILE_SCOPE, profile.id, 'birth_date', profile.birthDate),
    cipher.enc(PROFILE_SCOPE, profile.id, 'timezone', profile.timezone),
    profile.updatedAt,
    profile.id,
  );
}

export function insertProvider(db: DatabaseSync, cipher: FieldCipher, provider: Provider): void {
  db.prepare('INSERT INTO providers (id, kind, name, role, created_at) VALUES (?, ?, ?, ?, ?)').run(
    provider.id,
    provider.kind,
    cipher.enc(PROVIDER_SCOPE, provider.id, 'name', provider.name),
    cipher.enc(PROVIDER_SCOPE, provider.id, 'role', provider.role),
    provider.createdAt,
  );
}

export function listProviders(db: DatabaseSync, cipher: FieldCipher): Provider[] {
  const rows = db
    .prepare('SELECT id, kind, name, role, created_at FROM providers ORDER BY created_at, id')
    .all() as Array<{
    id: string;
    kind: string;
    name: string | null;
    role: string | null;
    created_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as Provider['kind'],
    name: cipher.dec(PROVIDER_SCOPE, row.id, 'name', row.name) ?? '',
    role: cipher.dec(PROVIDER_SCOPE, row.id, 'role', row.role),
    createdAt: row.created_at,
  }));
}

export function findProviderById(
  db: DatabaseSync,
  cipher: FieldCipher,
  id: string,
): Provider | null {
  const row = db
    .prepare('SELECT id, kind, name, role, created_at FROM providers WHERE id = ?')
    .get(id) as
    | { id: string; kind: string; name: string | null; role: string | null; created_at: string }
    | undefined;
  if (row === undefined) {
    return null;
  }
  return {
    id: row.id,
    kind: row.kind as Provider['kind'],
    name: cipher.dec(PROVIDER_SCOPE, row.id, 'name', row.name) ?? '',
    role: cipher.dec(PROVIDER_SCOPE, row.id, 'role', row.role),
    createdAt: row.created_at,
  };
}

export function insertAppointment(
  db: DatabaseSync,
  cipher: FieldCipher,
  appointment: Appointment,
): void {
  db.prepare(
    `INSERT INTO appointments (id, title, scheduled_at, provider_id, location, notes, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    appointment.id,
    cipher.enc(APPOINTMENT_SCOPE, appointment.id, 'title', appointment.title),
    appointment.scheduledAt,
    appointment.providerId,
    cipher.enc(APPOINTMENT_SCOPE, appointment.id, 'location', appointment.location),
    cipher.enc(APPOINTMENT_SCOPE, appointment.id, 'notes', appointment.notes),
    appointment.status,
    appointment.createdAt,
    appointment.updatedAt,
  );
}

export function listAppointments(db: DatabaseSync, cipher: FieldCipher): Appointment[] {
  const rows = db
    .prepare(
      'SELECT id, title, scheduled_at, provider_id, location, notes, status, created_at, updated_at FROM appointments ORDER BY scheduled_at, id',
    )
    .all() as Array<{
    id: string;
    title: string | null;
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
    title: cipher.dec(APPOINTMENT_SCOPE, row.id, 'title', row.title) ?? '',
    scheduledAt: row.scheduled_at,
    providerId: row.provider_id,
    location: cipher.dec(APPOINTMENT_SCOPE, row.id, 'location', row.location),
    notes: cipher.dec(APPOINTMENT_SCOPE, row.id, 'notes', row.notes),
    status: row.status as Appointment['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function findAppointmentById(
  db: DatabaseSync,
  cipher: FieldCipher,
  id: string,
): Appointment | null {
  const row = db
    .prepare(
      'SELECT id, title, scheduled_at, provider_id, location, notes, status, created_at, updated_at FROM appointments WHERE id = ?',
    )
    .get(id) as
    | {
        id: string;
        title: string | null;
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
    title: cipher.dec(APPOINTMENT_SCOPE, row.id, 'title', row.title) ?? '',
    scheduledAt: row.scheduled_at,
    providerId: row.provider_id,
    location: cipher.dec(APPOINTMENT_SCOPE, row.id, 'location', row.location),
    notes: cipher.dec(APPOINTMENT_SCOPE, row.id, 'notes', row.notes),
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

export function insertDocument(db: DatabaseSync, cipher: FieldCipher, doc: ClinicalDocument): void {
  db.prepare(
    `INSERT INTO clinical_documents (id, title, kind, issuer, doc_date, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    doc.id,
    cipher.enc(DOCUMENT_SCOPE, doc.id, 'title', doc.title),
    doc.kind,
    cipher.enc(DOCUMENT_SCOPE, doc.id, 'issuer', doc.issuer),
    cipher.enc(DOCUMENT_SCOPE, doc.id, 'doc_date', doc.docDate),
    cipher.enc(DOCUMENT_SCOPE, doc.id, 'notes', doc.notes),
    doc.createdAt,
    doc.updatedAt,
  );
}

export function listDocuments(db: DatabaseSync, cipher: FieldCipher): ClinicalDocument[] {
  const rows = db
    .prepare(
      'SELECT id, title, kind, issuer, doc_date, notes, created_at, updated_at FROM clinical_documents ORDER BY created_at, id',
    )
    .all() as Array<{
    id: string;
    title: string | null;
    kind: string;
    issuer: string | null;
    doc_date: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    title: cipher.dec(DOCUMENT_SCOPE, row.id, 'title', row.title) ?? '',
    kind: row.kind as ClinicalDocument['kind'],
    issuer: cipher.dec(DOCUMENT_SCOPE, row.id, 'issuer', row.issuer),
    docDate: cipher.dec(DOCUMENT_SCOPE, row.id, 'doc_date', row.doc_date),
    notes: cipher.dec(DOCUMENT_SCOPE, row.id, 'notes', row.notes),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function findDocumentById(
  db: DatabaseSync,
  cipher: FieldCipher,
  id: string,
): ClinicalDocument | null {
  const row = db
    .prepare(
      'SELECT id, title, kind, issuer, doc_date, notes, created_at, updated_at FROM clinical_documents WHERE id = ?',
    )
    .get(id) as
    | {
        id: string;
        title: string | null;
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
    title: cipher.dec(DOCUMENT_SCOPE, row.id, 'title', row.title) ?? '',
    kind: row.kind as ClinicalDocument['kind'],
    issuer: cipher.dec(DOCUMENT_SCOPE, row.id, 'issuer', row.issuer),
    docDate: cipher.dec(DOCUMENT_SCOPE, row.id, 'doc_date', row.doc_date),
    notes: cipher.dec(DOCUMENT_SCOPE, row.id, 'notes', row.notes),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertReport(
  db: DatabaseSync,
  cipher: FieldCipher,
  report: DiagnosticReport,
): void {
  db.prepare(
    `INSERT INTO diagnostic_reports (id, document_id, provider_id, issuer_text, reported_at, conclusion, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    report.id,
    report.documentId,
    report.providerId,
    cipher.enc(REPORT_SCOPE, report.id, 'issuer_text', report.issuerText),
    cipher.enc(REPORT_SCOPE, report.id, 'reported_at', report.reportedAt),
    cipher.enc(REPORT_SCOPE, report.id, 'conclusion', report.conclusion),
    report.createdAt,
  );
}

export function listReports(db: DatabaseSync, cipher: FieldCipher): DiagnosticReport[] {
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
    issuerText: cipher.dec(REPORT_SCOPE, row.id, 'issuer_text', row.issuer_text),
    reportedAt: cipher.dec(REPORT_SCOPE, row.id, 'reported_at', row.reported_at),
    conclusion: cipher.dec(REPORT_SCOPE, row.id, 'conclusion', row.conclusion),
    createdAt: row.created_at,
  }));
}

export function findReportById(
  db: DatabaseSync,
  cipher: FieldCipher,
  id: string,
): DiagnosticReport | null {
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
    issuerText: cipher.dec(REPORT_SCOPE, row.id, 'issuer_text', row.issuer_text),
    reportedAt: cipher.dec(REPORT_SCOPE, row.id, 'reported_at', row.reported_at),
    conclusion: cipher.dec(REPORT_SCOPE, row.id, 'conclusion', row.conclusion),
    createdAt: row.created_at,
  };
}

interface ObservationRow {
  id: string;
  diagnostic_report_id: string;
  code: string | null;
  original_name: string | null;
  value_kind: string;
  value_quantity: string | null;
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

function rowToObservation(row: ObservationRow, cipher: FieldCipher): Observation {
  const id = row.id;
  return {
    id,
    diagnosticReportId: row.diagnostic_report_id,
    code: cipher.dec(OBSERVATION_SCOPE, id, 'code', row.code),
    originalName: cipher.dec(OBSERVATION_SCOPE, id, 'original_name', row.original_name) ?? '',
    valueKind: row.value_kind as Observation['valueKind'],
    valueQuantity: cipher.decNum(OBSERVATION_SCOPE, id, 'value_quantity', row.value_quantity),
    valueText: cipher.dec(OBSERVATION_SCOPE, id, 'value_text', row.value_text),
    unitOriginal: cipher.dec(OBSERVATION_SCOPE, id, 'unit_original', row.unit_original),
    unitNormalized: cipher.dec(OBSERVATION_SCOPE, id, 'unit_normalized', row.unit_normalized),
    referenceRangeOriginal: cipher.dec(
      OBSERVATION_SCOPE,
      id,
      'reference_range_original',
      row.reference_range_original,
    ),
    flagOriginal: row.flag_original as Observation['flagOriginal'],
    effectiveAt: cipher.dec(OBSERVATION_SCOPE, id, 'effective_at', row.effective_at),
    reportedAt: cipher.dec(OBSERVATION_SCOPE, id, 'reported_at', row.reported_at),
    method: cipher.dec(OBSERVATION_SCOPE, id, 'method', row.method),
    specimen: cipher.dec(OBSERVATION_SCOPE, id, 'specimen', row.specimen),
    captureMethod: row.capture_method as Observation['captureMethod'],
    status: row.status as Observation['status'],
    sourceRef: cipher.dec(OBSERVATION_SCOPE, id, 'source_ref', row.source_ref),
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertObservation(
  db: DatabaseSync,
  cipher: FieldCipher,
  observation: Observation,
): void {
  const id = observation.id;
  db.prepare(
    `INSERT INTO observations (
      id, diagnostic_report_id, code, original_name, value_kind, value_quantity, value_text,
      unit_original, unit_normalized, reference_range_original, flag_original, effective_at,
      reported_at, method, specimen, capture_method, status, source_ref, version, created_by,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    observation.diagnosticReportId,
    cipher.enc(OBSERVATION_SCOPE, id, 'code', observation.code),
    cipher.enc(OBSERVATION_SCOPE, id, 'original_name', observation.originalName),
    observation.valueKind,
    cipher.encNum(OBSERVATION_SCOPE, id, 'value_quantity', observation.valueQuantity),
    cipher.enc(OBSERVATION_SCOPE, id, 'value_text', observation.valueText),
    cipher.enc(OBSERVATION_SCOPE, id, 'unit_original', observation.unitOriginal),
    cipher.enc(OBSERVATION_SCOPE, id, 'unit_normalized', observation.unitNormalized),
    cipher.enc(
      OBSERVATION_SCOPE,
      id,
      'reference_range_original',
      observation.referenceRangeOriginal,
    ),
    observation.flagOriginal,
    cipher.enc(OBSERVATION_SCOPE, id, 'effective_at', observation.effectiveAt),
    cipher.enc(OBSERVATION_SCOPE, id, 'reported_at', observation.reportedAt),
    cipher.enc(OBSERVATION_SCOPE, id, 'method', observation.method),
    cipher.enc(OBSERVATION_SCOPE, id, 'specimen', observation.specimen),
    observation.captureMethod,
    observation.status,
    cipher.enc(OBSERVATION_SCOPE, id, 'source_ref', observation.sourceRef),
    observation.version,
    observation.createdBy,
    observation.createdAt,
    observation.updatedAt,
  );
}

export function updateObservation(
  db: DatabaseSync,
  cipher: FieldCipher,
  observation: Observation,
  expectedVersion: number,
): boolean {
  const id = observation.id;
  const result = db
    .prepare(
      `UPDATE observations SET
        code = ?, original_name = ?, value_kind = ?, value_quantity = ?, value_text = ?,
        unit_original = ?, unit_normalized = ?, reference_range_original = ?, flag_original = ?,
        effective_at = ?, reported_at = ?, method = ?, specimen = ?, capture_method = ?,
        status = ?, source_ref = ?, version = ?, updated_at = ?
       WHERE id = ? AND version = ?`,
    )
    .run(
      cipher.enc(OBSERVATION_SCOPE, id, 'code', observation.code),
      cipher.enc(OBSERVATION_SCOPE, id, 'original_name', observation.originalName),
      observation.valueKind,
      cipher.encNum(OBSERVATION_SCOPE, id, 'value_quantity', observation.valueQuantity),
      cipher.enc(OBSERVATION_SCOPE, id, 'value_text', observation.valueText),
      cipher.enc(OBSERVATION_SCOPE, id, 'unit_original', observation.unitOriginal),
      cipher.enc(OBSERVATION_SCOPE, id, 'unit_normalized', observation.unitNormalized),
      cipher.enc(
        OBSERVATION_SCOPE,
        id,
        'reference_range_original',
        observation.referenceRangeOriginal,
      ),
      observation.flagOriginal,
      cipher.enc(OBSERVATION_SCOPE, id, 'effective_at', observation.effectiveAt),
      cipher.enc(OBSERVATION_SCOPE, id, 'reported_at', observation.reportedAt),
      cipher.enc(OBSERVATION_SCOPE, id, 'method', observation.method),
      cipher.enc(OBSERVATION_SCOPE, id, 'specimen', observation.specimen),
      observation.captureMethod,
      observation.status,
      cipher.enc(OBSERVATION_SCOPE, id, 'source_ref', observation.sourceRef),
      observation.version,
      observation.updatedAt,
      id,
      expectedVersion,
    );
  return Number(result.changes) === 1;
}

export function findObservationById(
  db: DatabaseSync,
  cipher: FieldCipher,
  id: string,
): Observation | null {
  const row = db.prepare(`SELECT ${OBSERVATION_COLUMNS} FROM observations WHERE id = ?`).get(id) as
    | ObservationRow
    | undefined;
  if (row === undefined) {
    return null;
  }
  return rowToObservation(row, cipher);
}

export function listObservations(
  db: DatabaseSync,
  cipher: FieldCipher,
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
  return rows.map((row) => rowToObservation(row, cipher));
}

export function insertObservationVersion(
  db: DatabaseSync,
  cipher: FieldCipher,
  version: ObservationVersion,
): void {
  db.prepare(
    'INSERT INTO observation_versions (id, observation_id, version, payload, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    version.id,
    version.observationId,
    version.version,
    cipher.enc(VERSION_SCOPE, version.id, 'payload', version.payload),
    version.changedBy,
    version.changedAt,
  );
}

export function listObservationVersions(
  db: DatabaseSync,
  cipher: FieldCipher,
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
    payload: string | null;
    changed_by: string;
    changed_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    observationId: row.observation_id,
    version: row.version,
    payload: cipher.dec(VERSION_SCOPE, row.id, 'payload', row.payload) ?? '',
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
