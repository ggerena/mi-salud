import { describe, expect, it } from 'vitest';
import type { Observation } from '../../src/domain/clinical.ts';
import { ClinicalRuleError } from '../../src/domain/clinical.ts';
import {
  addCalendarMonths,
  applyInterval,
  evaluateFollowUps,
  parseIsoDuration,
  parseYmd,
} from '../../src/domain/followup.ts';

function obs(partial: Partial<Observation> & Pick<Observation, 'id'>): Observation {
  const base: Observation = {
    diagnosticReportId: 'rep-1',
    originalName: '25-OH vitamina D',
    code: '14635-7',
    valueKind: 'cantidad',
    valueQuantity: 18,
    valueText: null,
    unitOriginal: 'ng/mL',
    unitNormalized: null,
    referenceRangeOriginal: '30 - 100 ng/mL',
    flagOriginal: 'bajo',
    effectiveAt: '2026-06-02',
    reportedAt: '2026-06-03',
    method: null,
    specimen: 'suero',
    captureMethod: 'manual',
    status: 'confirmado',
    sourceRef: 'pagina 2',
    version: 1,
    createdBy: 'acct',
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
    id: partial.id,
  };
  return { ...base, ...partial };
}

describe('intervalo calendario', () => {
  it('P3M suma meses, no 90 dias', () => {
    expect(applyInterval(parseYmd('2026-06-02'), 'P3M')).toEqual(parseYmd('2026-09-02'));
    expect(parseIsoDuration('P3M')).toEqual({ years: 0, months: 3, days: 0 });
  });

  it('ajusta el dia cuando el mes destino no lo tiene', () => {
    expect(addCalendarMonths(parseYmd('2026-01-31'), 1)).toEqual(parseYmd('2026-02-28'));
    expect(addCalendarMonths(parseYmd('2024-01-31'), 1)).toEqual(parseYmd('2024-02-29'));
  });

  it('rechaza duraciones con tiempo', () => {
    expect(() => parseIsoDuration('P3MT12H')).toThrow(ClinicalRuleError);
  });
});

describe('evaluateFollowUps', () => {
  const asOf = new Date('2026-09-02T12:00:00-04:00');

  it('vitamina D con indicacion profesional P3M cae en due el 2 de septiembre', () => {
    const observation = obs({ id: 'obs-d' });
    const answer = evaluateFollowUps({
      asOf,
      timeZone: 'America/Santiago',
      plans: [
        {
          id: 'plan-d',
          testCode: '14635-7',
          testName: '25-OH vitamina D',
          basis: 'clinician_instruction',
          basisText: 'Repetir examen en 3 meses',
          intervalIso: 'P3M',
          dueDateExact: null,
          anchorAt: '2026-06-02',
          upcomingDays: 14,
          overdueDays: 0,
          status: 'activo',
          documentId: 'doc-d',
          observationId: observation.id,
          providerId: 'prov-d',
          sourceRef: 'pagina 2',
          ruleId: null,
          createdAt: '2026-06-03T00:00:00.000Z',
          updatedAt: '2026-06-03T00:00:00.000Z',
        },
      ],
      rules: [],
      observations: [observation],
      documentIdByReportId: new Map([['rep-1', 'doc-d']]),
    });
    expect(answer.items).toHaveLength(1);
    expect(answer.items[0]?.status).toBe('due');
    expect(answer.items[0]?.dueDate).toBe('2026-09-02');
    expect(answer.items[0]?.evidence).toBe('con_evidencia');
    expect(answer.items[0]?.basis).toBe('clinician_instruction');
    expect(answer.items[0]?.explanation).toContain('2 de septiembre de 2026');
  });

  it('sin indicacion ni regla vigente responde sin_evidencia aunque el valor este bajo', () => {
    const answer = evaluateFollowUps({
      asOf,
      timeZone: 'America/Santiago',
      plans: [],
      rules: [],
      observations: [obs({ id: 'obs-d' })],
      documentIdByReportId: new Map([['rep-1', 'doc-d']]),
    });
    expect(answer.items[0]?.evidence).toBe('sin_evidencia');
    expect(answer.items[0]?.status).toBe('unknown');
    expect(answer.items[0]?.dueDate).toBeNull();
    expect(answer.limitations.some((line) => line.includes('no autoriza'))).toBe(true);
  });

  it('indicacion revocada no inventa plazo', () => {
    const observation = obs({ id: 'obs-d' });
    const answer = evaluateFollowUps({
      asOf,
      timeZone: 'America/Santiago',
      plans: [
        {
          id: 'plan-d',
          testCode: '14635-7',
          testName: '25-OH vitamina D',
          basis: 'clinician_instruction',
          basisText: 'Repetir examen en 3 meses',
          intervalIso: 'P3M',
          dueDateExact: null,
          anchorAt: '2026-06-02',
          upcomingDays: 14,
          overdueDays: 0,
          status: 'cancelado',
          documentId: 'doc-d',
          observationId: observation.id,
          providerId: null,
          sourceRef: 'pagina 2',
          ruleId: null,
          createdAt: '2026-06-03T00:00:00.000Z',
          updatedAt: '2026-06-03T00:00:00.000Z',
        },
      ],
      rules: [
        {
          id: 'rule-d',
          testCode: '14635-7',
          testName: '25-OH vitamina D',
          intervalIso: 'P12M',
          upcomingDays: 14,
          overdueDays: 0,
          enabled: true,
          version: 1,
          jurisdiction: 'CL',
          validFrom: null,
          validTo: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      observations: [observation],
      documentIdByReportId: new Map([['rep-1', 'doc-d']]),
    });
    expect(answer.items[0]?.status).toBe('cancelled');
    expect(answer.items[0]?.dueDate).toBeNull();
    expect(answer.items[0]?.evidence).toBe('sin_evidencia');
  });
});
