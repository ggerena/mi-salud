import { describe, expect, it } from 'vitest';
import {
  assertConfirmable,
  assertManualStatusAllowed,
  assertValueMatchesKind,
  ClinicalRuleError,
  isHumanReviewed,
} from '../../src/domain/clinical.ts';

describe('estados de observacion', () => {
  it('solo confirmado y corregido cuentan como revisados por un humano', () => {
    expect(isHumanReviewed('extraido')).toBe(false);
    expect(isHumanReviewed('requiere_confirmacion')).toBe(false);
    expect(isHumanReviewed('confirmado')).toBe(true);
    expect(isHumanReviewed('corregido')).toBe(true);
  });

  it('se puede confirmar solo desde extraido o requiere_confirmacion', () => {
    expect(() => assertConfirmable('extraido')).not.toThrow();
    expect(() => assertConfirmable('requiere_confirmacion')).not.toThrow();
    expect(() => assertConfirmable('confirmado')).toThrow(ClinicalRuleError);
    expect(() => assertConfirmable('corregido')).toThrow(ClinicalRuleError);
  });

  it('la entrada manual nunca produce estado extraido', () => {
    expect(() => assertManualStatusAllowed('extraido')).toThrow(ClinicalRuleError);
    expect(() => assertManualStatusAllowed('requiere_confirmacion')).not.toThrow();
    expect(() => assertManualStatusAllowed('confirmado')).not.toThrow();
  });
});

describe('consistencia entre tipo de valor y valor', () => {
  it('una cantidad exige valor numerico', () => {
    expect(() =>
      assertValueMatchesKind({ valueKind: 'cantidad', valueQuantity: 18, valueText: null }),
    ).not.toThrow();
    expect(() =>
      assertValueMatchesKind({ valueKind: 'cantidad', valueQuantity: null, valueText: '18' }),
    ).toThrow(ClinicalRuleError);
  });

  it('texto y codigo exigen texto', () => {
    expect(() =>
      assertValueMatchesKind({ valueKind: 'texto', valueQuantity: null, valueText: 'negativo' }),
    ).not.toThrow();
    expect(() =>
      assertValueMatchesKind({ valueKind: 'codigo', valueQuantity: null, valueText: 'A0101' }),
    ).not.toThrow();
    expect(() =>
      assertValueMatchesKind({ valueKind: 'texto', valueQuantity: 1, valueText: null }),
    ).toThrow(ClinicalRuleError);
  });

  it('un booleano se registra como 0 o 1', () => {
    expect(() =>
      assertValueMatchesKind({ valueKind: 'booleano', valueQuantity: 1, valueText: null }),
    ).not.toThrow();
    expect(() =>
      assertValueMatchesKind({ valueKind: 'booleano', valueQuantity: 0, valueText: null }),
    ).not.toThrow();
    expect(() =>
      assertValueMatchesKind({ valueKind: 'booleano', valueQuantity: 2, valueText: null }),
    ).toThrow(ClinicalRuleError);
  });

  it('un valor no informado no lleva cantidad ni texto', () => {
    expect(() =>
      assertValueMatchesKind({ valueKind: 'no_informado', valueQuantity: null, valueText: null }),
    ).not.toThrow();
    expect(() =>
      assertValueMatchesKind({ valueKind: 'no_informado', valueQuantity: 18, valueText: null }),
    ).toThrow(ClinicalRuleError);
  });
});
