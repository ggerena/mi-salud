/** Datos clinicos sinteticos para pruebas. Ninguno corresponde a una persona real. */

export const SYNTHETIC_PERSON = {
  displayName: 'Persona Sintetica',
  birthDate: '1990-01-01',
  timezone: 'America/Santiago',
} as const;

export const SYNTHETIC_LAB_PROVIDER = {
  kind: 'organizacion',
  name: 'Laboratorio Sintetico SA',
  role: null,
} as const;

export const SYNTHETIC_VITAMIN_D_DOCUMENT = {
  title: 'Informe sintetico 25-OH vitamina D',
  kind: 'informe',
  issuer: 'Laboratorio Sintetico SA',
  docDate: '2026-06-03',
  notes: null,
} as const;

export const SYNTHETIC_VITAMIN_D_REPORT = {
  reportedAt: '2026-06-03',
  conclusion: 'Repetir examen en 3 meses.',
} as const;

export const SYNTHETIC_VITAMIN_D_OBSERVATION = {
  code: '14635-7',
  originalName: '25-OH vitamina D',
  valueKind: 'cantidad',
  valueQuantity: 18,
  valueText: null,
  unitOriginal: 'ng/mL',
  referenceRangeOriginal: '30 - 100 ng/mL',
  flagOriginal: 'bajo',
  effectiveAt: '2026-06-02',
  reportedAt: '2026-06-03',
  method: null,
  specimen: 'suero',
  sourceRef: 'pagina 2',
} as const;
