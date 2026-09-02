export const OBSERVATION_STATUSES = [
  'extraido',
  'requiere_confirmacion',
  'confirmado',
  'corregido',
] as const;
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number];

export const CAPTURE_METHODS = ['manual', 'importado', 'extraido'] as const;
export type CaptureMethod = (typeof CAPTURE_METHODS)[number];

export const FLAG_ORIGINALS = ['bajo', 'normal', 'alto', 'critico', 'no_informado'] as const;
export type FlagOriginal = (typeof FLAG_ORIGINALS)[number];

export const VALUE_KINDS = ['cantidad', 'texto', 'codigo', 'booleano', 'no_informado'] as const;
export type ValueKind = (typeof VALUE_KINDS)[number];

export const PROVIDER_KINDS = ['profesional', 'organizacion'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const APPOINTMENT_STATUSES = ['agendada', 'realizada', 'cancelada'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const DOCUMENT_KINDS = ['informe', 'receta', 'otro'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const AUDIT_OUTCOMES = ['permitido', 'denegado'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export class ClinicalRuleError extends Error {
  readonly code = 'clinical_rule_violation';
  constructor(message: string) {
    super(message);
    this.name = 'ClinicalRuleError';
  }
}

export interface PatientProfile {
  id: string;
  displayName: string;
  birthDate: string | null;
  timezone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Provider {
  id: string;
  kind: ProviderKind;
  name: string;
  role: string | null;
  createdAt: string;
}

export interface Appointment {
  id: string;
  title: string;
  scheduledAt: string;
  providerId: string | null;
  location: string | null;
  notes: string | null;
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalDocument {
  id: string;
  title: string;
  kind: DocumentKind;
  issuer: string | null;
  docDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiagnosticReport {
  id: string;
  documentId: string | null;
  providerId: string | null;
  issuerText: string | null;
  reportedAt: string | null;
  conclusion: string | null;
  createdAt: string;
}

export interface Observation {
  id: string;
  diagnosticReportId: string;
  code: string | null;
  originalName: string;
  valueKind: ValueKind;
  valueQuantity: number | null;
  valueText: string | null;
  unitOriginal: string | null;
  unitNormalized: string | null;
  referenceRangeOriginal: string | null;
  flagOriginal: FlagOriginal | null;
  effectiveAt: string | null;
  reportedAt: string | null;
  method: string | null;
  specimen: string | null;
  captureMethod: CaptureMethod;
  status: ObservationStatus;
  sourceRef: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ObservationVersion {
  id: string;
  observationId: string;
  version: number;
  payload: string;
  changedBy: string;
  changedAt: string;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  resource: string;
  resourceId: string | null;
  outcome: AuditOutcome;
  occurredAt: string;
  detail: string | null;
}

export function isHumanReviewed(status: ObservationStatus): boolean {
  return status === 'confirmado' || status === 'corregido';
}

export function assertConfirmable(status: ObservationStatus): void {
  if (status !== 'extraido' && status !== 'requiere_confirmacion') {
    throw new ClinicalRuleError(
      `Una observacion en estado ${status} no se puede confirmar de nuevo.`,
    );
  }
}

export function assertManualStatusAllowed(status: ObservationStatus): void {
  if (status === 'extraido') {
    throw new ClinicalRuleError(
      'La entrada manual no crea observaciones en estado extraido; ese estado es solo de la capa de extraccion.',
    );
  }
}

export function assertValueMatchesKind(input: {
  valueKind: ValueKind;
  valueQuantity: number | null;
  valueText: string | null;
}): void {
  const { valueKind, valueQuantity, valueText } = input;
  if (valueKind === 'cantidad') {
    if (valueQuantity === null) {
      throw new ClinicalRuleError('Una observacion de cantidad exige valor numerico.');
    }
    return;
  }
  if (valueKind === 'texto' || valueKind === 'codigo') {
    if (valueText === null) {
      throw new ClinicalRuleError(`Una observacion ${valueKind} exige texto.`);
    }
    return;
  }
  if (valueKind === 'booleano') {
    if (valueQuantity !== 0 && valueQuantity !== 1) {
      throw new ClinicalRuleError('Un valor booleano se registra como 0 o 1.');
    }
    return;
  }
  if (valueQuantity !== null || valueText !== null) {
    throw new ClinicalRuleError('Un valor no informado no lleva cantidad ni texto.');
  }
}

export function normalizeValueFields(input: {
  valueKind: ValueKind;
  valueQuantity: number | null;
  valueText: string | null;
}): { valueQuantity: number | null; valueText: string | null } {
  const { valueKind } = input;
  if (valueKind === 'cantidad') {
    const valueQuantity = input.valueQuantity;
    assertValueMatchesKind({ valueKind, valueQuantity, valueText: null });
    return { valueQuantity, valueText: null };
  }
  if (valueKind === 'texto' || valueKind === 'codigo') {
    const valueText = input.valueText;
    assertValueMatchesKind({ valueKind, valueQuantity: null, valueText });
    return { valueQuantity: null, valueText };
  }
  if (valueKind === 'booleano') {
    const valueQuantity = input.valueQuantity;
    assertValueMatchesKind({ valueKind, valueQuantity, valueText: null });
    return { valueQuantity, valueText: null };
  }
  return { valueQuantity: null, valueText: null };
}
