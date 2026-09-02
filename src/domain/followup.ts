import { ClinicalRuleError, isHumanReviewed, type Observation } from './clinical.ts';

export const FOLLOW_UP_PLAN_STATUSES = [
  'borrador',
  'confirmado',
  'activo',
  'cumplido',
  'cancelado',
  'reemplazado',
] as const;
export type FollowUpPlanStatus = (typeof FOLLOW_UP_PLAN_STATUSES)[number];

export const FOLLOW_UP_BASES = ['clinician_instruction', 'titular_plan', 'versioned_rule'] as const;
export type FollowUpBasis = (typeof FOLLOW_UP_BASES)[number];

export const FOLLOW_UP_DUE_STATUSES = [
  'not_due',
  'upcoming',
  'due',
  'overdue',
  'unknown',
  'cancelled',
  'superseded',
  'completed_pending_review',
] as const;
export type FollowUpDueStatus = (typeof FOLLOW_UP_DUE_STATUSES)[number];

export const SAFETY_NOTICE =
  'Recordatorio basado en registros; no es diagnostico ni una nueva indicacion medica.';

export interface CalendarYmd {
  year: number;
  month: number;
  day: number;
}

export interface FollowUpPlan {
  id: string;
  testCode: string | null;
  testName: string;
  basis: Exclude<FollowUpBasis, 'versioned_rule'>;
  basisText: string;
  intervalIso: string | null;
  dueDateExact: string | null;
  anchorAt: string;
  upcomingDays: number;
  overdueDays: number;
  status: FollowUpPlanStatus;
  documentId: string | null;
  observationId: string | null;
  providerId: string | null;
  sourceRef: string | null;
  ruleId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUpRule {
  id: string;
  testCode: string | null;
  testName: string;
  intervalIso: string;
  upcomingDays: number;
  overdueDays: number;
  enabled: boolean;
  version: number;
  jurisdiction: string | null;
  validFrom: string | null;
  validTo: string | null;
  createdAt: string;
}

export interface FollowUpLastObservation {
  id: string;
  value: number | string | null;
  unit: string | null;
  flag: string | null;
  effectiveAt: string | null;
  reportedAt: string | null;
  humanReviewed: boolean;
  status: Observation['status'];
  sourceRef: string | null;
  documentId: string | null;
}

export interface FollowUpItem {
  test: string;
  testCode: string | null;
  status: FollowUpDueStatus;
  evidence: 'con_evidencia' | 'sin_evidencia';
  dueDate: string | null;
  basis: FollowUpBasis | 'none';
  basisText: string | null;
  planId: string | null;
  ruleId: string | null;
  lastObservation: FollowUpLastObservation | null;
  source: { documentId: string | null; page: string | null };
  confidence: string;
  explanation: string;
}

export interface FollowUpAnswer {
  question: string;
  asOf: string;
  items: FollowUpItem[];
  limitations: string[];
  safetyNotice: string;
}

const ACTIVE_PLAN_STATUSES: ReadonlySet<FollowUpPlanStatus> = new Set(['confirmado', 'activo']);

export function parseYmd(value: string): CalendarYmd {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match === null) {
    throw new ClinicalRuleError(`Fecha clinica no parseable: ${value}`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function formatYmd(ymd: CalendarYmd): string {
  const mm = String(ymd.month).padStart(2, '0');
  const dd = String(ymd.day).padStart(2, '0');
  return `${ymd.year}-${mm}-${dd}`;
}

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

export function formatSpanishDate(value: string): string {
  const ymd = parseYmd(value);
  const month = MONTHS_ES[ymd.month - 1];
  return `${ymd.day} de ${month} de ${ymd.year}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addCalendarMonths(ymd: CalendarYmd, months: number): CalendarYmd {
  const index = ymd.year * 12 + (ymd.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const day = Math.min(ymd.day, lastDayOfMonth(year, month));
  return { year, month, day };
}

export function addCalendarYears(ymd: CalendarYmd, years: number): CalendarYmd {
  return addCalendarMonths(ymd, years * 12);
}

export function addCalendarDays(ymd: CalendarYmd, days: number): CalendarYmd {
  const utc = Date.UTC(ymd.year, ymd.month - 1, ymd.day + days);
  const d = new Date(utc);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function compareYmd(a: CalendarYmd, b: CalendarYmd): number {
  if (a.year !== b.year) {
    return a.year - b.year;
  }
  if (a.month !== b.month) {
    return a.month - b.month;
  }
  return a.day - b.day;
}

export function diffDays(from: CalendarYmd, to: CalendarYmd): number {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / 86_400_000);
}

export function calendarDateInZone(instant: Date, timeZone: string | null): CalendarYmd {
  const tz = timeZone === null || timeZone === '' ? 'UTC' : timeZone;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  return { year, month, day };
}

export function parseIsoDuration(iso: string): { years: number; months: number; days: number } {
  const match = iso.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/);
  if (match === null || iso === 'P') {
    throw new ClinicalRuleError(
      `Intervalo no soportado (${iso}); use PnY, PnM, PnD o combinaciones calendario.`,
    );
  }
  const years = match[1] === undefined ? 0 : Number(match[1]);
  const months = match[2] === undefined ? 0 : Number(match[2]);
  const days = match[3] === undefined ? 0 : Number(match[3]);
  if (years === 0 && months === 0 && days === 0) {
    throw new ClinicalRuleError(`Intervalo vacio: ${iso}`);
  }
  return { years, months, days };
}

export function applyInterval(anchor: CalendarYmd, intervalIso: string): CalendarYmd {
  const { years, months, days } = parseIsoDuration(intervalIso);
  let next = addCalendarYears(anchor, years);
  next = addCalendarMonths(next, months);
  return addCalendarDays(next, days);
}

function dueStatusFor(input: {
  asOf: CalendarYmd;
  due: CalendarYmd;
  upcomingDays: number;
  overdueDays: number;
}): FollowUpDueStatus {
  const daysUntil = diffDays(input.asOf, input.due);
  if (daysUntil > input.upcomingDays) {
    return 'not_due';
  }
  if (daysUntil > 0) {
    return 'upcoming';
  }
  if (daysUntil >= -input.overdueDays) {
    return 'due';
  }
  return 'overdue';
}

function observationValue(obs: Observation): number | string | null {
  if (obs.valueKind === 'cantidad' || obs.valueKind === 'booleano') {
    return obs.valueQuantity;
  }
  if (obs.valueKind === 'texto' || obs.valueKind === 'codigo') {
    return obs.valueText;
  }
  return null;
}

function lastObservationView(obs: Observation, documentId: string | null): FollowUpLastObservation {
  return {
    id: obs.id,
    value: observationValue(obs),
    unit: obs.unitOriginal,
    flag: obs.flagOriginal,
    effectiveAt: obs.effectiveAt,
    reportedAt: obs.reportedAt,
    humanReviewed: isHumanReviewed(obs.status),
    status: obs.status,
    sourceRef: obs.sourceRef,
    documentId,
  };
}

function pickLatestObservation(observations: Observation[]): Observation | null {
  if (observations.length === 0) {
    return null;
  }
  const sorted = [...observations].sort((a, b) => {
    const aKey = a.effectiveAt ?? a.reportedAt ?? a.createdAt;
    const bKey = b.effectiveAt ?? b.reportedAt ?? b.createdAt;
    return aKey < bKey ? 1 : aKey > bKey ? -1 : 0;
  });
  return sorted[0] ?? null;
}

function testKey(code: string | null, name: string): string {
  if (code !== null && code !== '') {
    return `code:${code}`;
  }
  return `name:${name.trim().toLowerCase()}`;
}

function ruleApplies(rule: FollowUpRule, asOfYmd: CalendarYmd): boolean {
  if (!rule.enabled) {
    return false;
  }
  if (rule.validFrom !== null && compareYmd(asOfYmd, parseYmd(rule.validFrom)) < 0) {
    return false;
  }
  if (rule.validTo !== null && compareYmd(asOfYmd, parseYmd(rule.validTo)) > 0) {
    return false;
  }
  return true;
}

function authorityRank(basis: FollowUpPlan['basis']): number {
  return basis === 'clinician_instruction' ? 0 : 1;
}

function prettyDate(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  try {
    return formatSpanishDate(value);
  } catch {
    return value;
  }
}

function explanationFor(item: FollowUpItem): string {
  const last = item.lastObservation;
  const lastTaken = prettyDate(last?.effectiveAt ?? last?.reportedAt);
  const duePretty = prettyDate(item.dueDate);
  const valuePart =
    last === null
      ? ''
      : last.value === null
        ? ''
        : ` El ultimo valor registrado fue ${String(last.value)}${last.unit === null ? '' : ` ${last.unit}`}${last.flag === null ? '' : `, marcado ${last.flag} por ese laboratorio`}.`;
  const sourcePart =
    last?.sourceRef === null || last?.sourceRef === undefined ? '' : ` Fuente: ${last.sourceRef}.`;

  if (item.status === 'cancelled' || item.status === 'superseded') {
    return `La indicacion de repeticion esta ${item.status === 'cancelled' ? 'revocada' : 'reemplazada'}. No calculo un nuevo plazo a partir del resultado.${lastTaken === null ? '' : ` Tu ultimo resultado fue el ${lastTaken}.`} Esto no es una indicacion medica nueva.`;
  }
  if (item.evidence === 'sin_evidencia') {
    return `No encontre una fecha de repeticion indicada.${lastTaken === null ? '' : ` Tu ultimo resultado fue el ${lastTaken}.`} Puedo mostrarte el informe para que lo consultes con tu profesional.`;
  }
  if (item.dueDate === null || duePretty === null) {
    return `Hay un plan de seguimiento, pero falta una fecha calculable.${sourcePart}`;
  }
  const verb =
    item.status === 'due' || item.status === 'overdue'
      ? 'Si, corresponde revisar el control'
      : item.status === 'upcoming'
        ? 'El control se acerca'
        : 'Aun no corresponde el control';
  return `${verb}. Tu ultimo ${item.test} fue tomado el ${lastTaken ?? 'fecha no informada'} y la indicacion fue ${item.basisText ?? 'repetir segun plan'}; la fecha calculada es el ${duePretty}.${valuePart}${sourcePart} Esto es un recordatorio basado en tus registros, no una indicacion medica nueva.`;
}

export function evaluateFollowUps(input: {
  asOf: Date;
  timeZone: string | null;
  plans: FollowUpPlan[];
  rules: FollowUpRule[];
  observations: Observation[];
  documentIdByReportId: Map<string, string | null>;
}): FollowUpAnswer {
  const asOfYmd = calendarDateInZone(input.asOf, input.timeZone);
  const asOfIso = input.asOf.toISOString();
  const limitations: string[] = [];
  const items: FollowUpItem[] = [];
  const consumedObs = new Set<string>();

  const obsById = new Map(input.observations.map((o) => [o.id, o]));
  const obsByKey = new Map<string, Observation[]>();
  for (const obs of input.observations) {
    const key = testKey(obs.code, obs.originalName);
    const list = obsByKey.get(key) ?? [];
    list.push(obs);
    obsByKey.set(key, list);
  }

  const rankedPlans = [...input.plans].sort((a, b) => {
    const rank = authorityRank(a.basis) - authorityRank(b.basis);
    if (rank !== 0) {
      return rank;
    }
    return a.updatedAt < b.updatedAt ? 1 : -1;
  });

  const usedKeys = new Set<string>();

  for (const plan of rankedPlans) {
    const key = testKey(plan.testCode, plan.testName);
    if (usedKeys.has(key)) {
      continue;
    }
    usedKeys.add(key);
    const linked = plan.observationId !== null ? (obsById.get(plan.observationId) ?? null) : null;
    const group = obsByKey.get(key) ?? [];
    const latest = linked ?? pickLatestObservation(group);
    if (latest !== null) {
      consumedObs.add(latest.id);
    }
    const documentId =
      latest === null
        ? plan.documentId
        : (input.documentIdByReportId.get(latest.diagnosticReportId) ?? plan.documentId);
    const last = latest === null ? null : lastObservationView(latest, documentId);

    if (plan.status === 'cancelado' || plan.status === 'reemplazado') {
      const item: FollowUpItem = {
        test: plan.testName,
        testCode: plan.testCode,
        status: plan.status === 'cancelado' ? 'cancelled' : 'superseded',
        evidence: 'sin_evidencia',
        dueDate: null,
        basis: plan.basis,
        basisText: plan.basisText,
        planId: plan.id,
        ruleId: plan.ruleId,
        lastObservation: last,
        source: { documentId, page: last?.sourceRef ?? plan.sourceRef },
        confidence: last === null ? 'sin_dato' : last.status,
        explanation: '',
      };
      item.explanation = explanationFor(item);
      items.push(item);
      continue;
    }

    if (plan.status === 'borrador' || plan.status === 'cumplido') {
      continue;
    }

    if (!ACTIVE_PLAN_STATUSES.has(plan.status)) {
      continue;
    }

    let dueDate: string | null = null;
    try {
      dueDate =
        plan.dueDateExact !== null
          ? formatYmd(parseYmd(plan.dueDateExact))
          : plan.intervalIso === null
            ? null
            : formatYmd(applyInterval(parseYmd(plan.anchorAt), plan.intervalIso));
    } catch {
      dueDate = null;
      limitations.push(`No se pudo aplicar el intervalo del plan ${plan.id}.`);
    }

    const status: FollowUpDueStatus =
      dueDate === null
        ? 'unknown'
        : dueStatusFor({
            asOf: asOfYmd,
            due: parseYmd(dueDate),
            upcomingDays: plan.upcomingDays,
            overdueDays: plan.overdueDays,
          });

    if (last !== null && !last.humanReviewed) {
      limitations.push(
        `El resultado de ${plan.testName} no esta confirmado; no se presenta como dato revisado.`,
      );
    }

    const item: FollowUpItem = {
      test: plan.testName,
      testCode: plan.testCode,
      status,
      evidence: dueDate === null ? 'sin_evidencia' : 'con_evidencia',
      dueDate,
      basis: plan.basis,
      basisText: plan.basisText,
      planId: plan.id,
      ruleId: plan.ruleId,
      lastObservation: last,
      source: { documentId, page: last?.sourceRef ?? plan.sourceRef },
      confidence: last === null ? 'sin_dato' : last.status,
      explanation: '',
    };
    item.explanation = explanationFor(item);
    items.push(item);
  }

  for (const [key, group] of obsByKey) {
    if (usedKeys.has(key)) {
      continue;
    }
    const latest = pickLatestObservation(group);
    if (latest === null) {
      continue;
    }
    consumedObs.add(latest.id);
    const documentId = input.documentIdByReportId.get(latest.diagnosticReportId) ?? null;
    const last = lastObservationView(latest, documentId);
    const matchingRule = input.rules
      .filter((rule) => testKey(rule.testCode, rule.testName) === key && ruleApplies(rule, asOfYmd))
      .sort((a, b) => b.version - a.version)[0];

    if (matchingRule === undefined) {
      if (latest.flagOriginal === 'bajo' || latest.flagOriginal === 'alto') {
        limitations.push(
          `Un valor ${latest.flagOriginal} de ${latest.originalName} no autoriza por si solo un plazo de repeticion.`,
        );
      }
      const item: FollowUpItem = {
        test: latest.originalName,
        testCode: latest.code,
        status: 'unknown',
        evidence: 'sin_evidencia',
        dueDate: null,
        basis: 'none',
        basisText: null,
        planId: null,
        ruleId: null,
        lastObservation: last,
        source: { documentId, page: last.sourceRef },
        confidence: last.status,
        explanation: '',
      };
      item.explanation = explanationFor(item);
      items.push(item);
      continue;
    }

    usedKeys.add(key);
    const anchor = parseYmd(latest.effectiveAt ?? latest.reportedAt ?? latest.createdAt);
    const dueDate = formatYmd(applyInterval(anchor, matchingRule.intervalIso));
    const status = dueStatusFor({
      asOf: asOfYmd,
      due: parseYmd(dueDate),
      upcomingDays: matchingRule.upcomingDays,
      overdueDays: matchingRule.overdueDays,
    });
    const item: FollowUpItem = {
      test: matchingRule.testName,
      testCode: matchingRule.testCode ?? latest.code,
      status,
      evidence: 'con_evidencia',
      dueDate,
      basis: 'versioned_rule',
      basisText: `Regla version ${matchingRule.version} (${matchingRule.intervalIso})`,
      planId: null,
      ruleId: matchingRule.id,
      lastObservation: last,
      source: { documentId, page: last.sourceRef },
      confidence: last.status,
      explanation: '',
    };
    item.explanation = explanationFor(item);
    items.push(item);
  }

  void consumedObs;

  return {
    question: 'Me toca hacerme examenes?',
    asOf: asOfIso,
    items,
    limitations,
    safetyNotice: SAFETY_NOTICE,
  };
}
