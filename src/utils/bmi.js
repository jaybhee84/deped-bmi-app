import { BMI_TABLE_BOYS, BMI_TABLE_GIRLS } from './bmiTable';
import { HAZ_TABLE_BOYS, HAZ_TABLE_GIRLS } from './hazTable';

// ══════════════════════════════════════════════════════════════════════════
// DepEd Official Nutritional Status Computation
// Source: IECES_BMI_BLANK.xlsx (WHO Growth Reference)
//
// Two indicators:
//  1. BMI-for-Age  (BAZ) → Severely Wasted / Wasted / Normal / Overweight / Obese
//  2. Height-for-Age (HAZ) → Severely Stunted / Stunted / Normal / Tall
//
// Both require: age in months + sex ('M' or 'F')
// ══════════════════════════════════════════════════════════════════════════

// ── Status display metadata ───────────────────────────────────────────────

export const BAZ_META = {
  'Severely Wasted': { color: '#A32D2D', bg: '#FCEBEB' },
  'Wasted':          { color: '#BA7517', bg: '#FAEEDA' },
  'Normal':          { color: '#3B6D11', bg: '#EAF3DE' },
  'Overweight':      { color: '#BA7517', bg: '#FAEEDA' },
  'Obese':           { color: '#A32D2D', bg: '#FCEBEB' },
};

export const HAZ_META = {
  'Severely Stunted': { color: '#7C2D12', bg: '#FEE2E2' },
  'Stunted':          { color: '#BA7517', bg: '#FAEEDA' },
  'Normal':           { color: '#3B6D11', bg: '#EAF3DE' },
  'Tall':             { color: '#1E40AF', bg: '#DBEAFE' },
};

// For Settings reference display
export const BMI_CLASSIFICATIONS = Object.entries(BAZ_META).map(([label, meta]) => ({
  label, ...meta,
}));

export const HAZ_CLASSIFICATIONS = Object.entries(HAZ_META).map(([label, meta]) => ({
  label, ...meta,
}));

// ── Basic calculations ────────────────────────────────────────────────────

export function normalizeHeightCm(height) {
  const value = parseFloat(height);
  if (!Number.isFinite(value) || value <= 0) return null;
  // Learner height is stored in centimetres. Support older/imported records
  // that were entered in metres (for example, 1.28 instead of 128).
  return value <= 3 ? value * 100 : value;
}

// Canonical height unit used by forms, records, and CSV files.
// Values above 3 are treated as legacy centimetre values.
export function normalizeHeightMeters(height) {
  const value = parseFloat(height);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value > 3 ? value / 100 : value;
}

export function formatHeightMeters(height) {
  const value = normalizeHeightMeters(height);
  if (value == null) return "—";
  // Show centimetre precision while retaining millimetres when supplied.
  return value.toFixed(3).replace(/(\.\d{2})0$/, "$1");
}

export function calcBMI(weight, height) {
  const h = normalizeHeightMeters(height);
  const w = parseFloat(weight);
  if (!h || !Number.isFinite(w) || w <= 0) return null;
  return w / (h * h);
}

function validDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function ageInMonths(birthdate, referenceDate = new Date()) {
  if (!birthdate) return null;
  const birth = validDate(birthdate);
  const measured = validDate(referenceDate);
  if (!birth || !measured) return null;
  let months = (measured.getFullYear() - birth.getFullYear()) * 12
             + (measured.getMonth()    - birth.getMonth());
  if (measured.getDate() < birth.getDate()) months--;
  return months >= 0 ? months : null;
}

export function ageInYears(birthdate, referenceDate = new Date()) {
  if (!birthdate) return '';
  const birth = validDate(birthdate);
  const measured = validDate(referenceDate);
  if (!birth || !measured) return '';
  let age = measured.getFullYear() - birth.getFullYear();
  const m = measured.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && measured.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : '';
}

// The DepEd tables use one-decimal bands with 0.1 gaps between them (Wasted
// ends at 12.9, Normal starts at 13.0). Round to one decimal first so a value
// such as 12.95 cannot fall between two bands.
const roundTenth = (value) => Math.round((value + Number.EPSILON) * 10) / 10;

// ── BMI-for-Age (BAZ) ─────────────────────────────────────────────────────
// Returns: { label, color, bg } | null

export function getBMIStatus(
  bmi,
  sex,
  birthdate,
  measurementDate,
  fallbackMonths,
) {
  if (bmi == null) return null;

  const legacyFallbackMonths =
    typeof measurementDate === 'number' ? measurementDate : fallbackMonths;
  const measuredOn =
    typeof measurementDate === 'number' ? null : measurementDate;
  const months = birthdate
    ? measuredOn
      ? ageInMonths(birthdate, measuredOn)
      : null
    : legacyFallbackMonths;
  if (months == null) return null;

  const table       = String(sex || '').trim().toUpperCase().startsWith('F') ? BMI_TABLE_GIRLS : BMI_TABLE_BOYS;
  const clampMonths = Math.max(72, Math.min(228, months));
  const row         = table[clampMonths];

  if (row) {
    const b = roundTenth(bmi);
    if (b <= row.sw_max) return { label: 'Severely Wasted', ...BAZ_META['Severely Wasted'] };
    if (b <= row.w_to)   return { label: 'Wasted',          ...BAZ_META['Wasted']          };
    if (b <= row.n_to)   return { label: 'Normal',          ...BAZ_META['Normal']          };
    if (b <= row.ow_to)  return { label: 'Overweight',      ...BAZ_META['Overweight']      };
    return                      { label: 'Obese',           ...BAZ_META['Obese']           };
  }

  // Only reached if a table row is missing — simplified thresholds
  if (bmi < 14)  return { label: 'Severely Wasted', ...BAZ_META['Severely Wasted'] };
  if (bmi < 16)  return { label: 'Wasted',          ...BAZ_META['Wasted']          };
  if (bmi < 23)  return { label: 'Normal',          ...BAZ_META['Normal']          };
  if (bmi < 27)  return { label: 'Overweight',      ...BAZ_META['Overweight']      };
  return               { label: 'Obese',            ...BAZ_META['Obese']           };
}

// ── Height-for-Age (HAZ) ──────────────────────────────────────────────────
// Returns: { label, color, bg } | null

export function getHAZStatus(
  heightCm,
  sex,
  birthdate,
  measurementDate,
  fallbackMonths,
) {
  if (!heightCm) return null;

  const legacyFallbackMonths =
    typeof measurementDate === 'number' ? measurementDate : fallbackMonths;
  const measuredOn =
    typeof measurementDate === 'number' ? null : measurementDate;
  const months = birthdate
    ? measuredOn
      ? ageInMonths(birthdate, measuredOn)
      : null
    : legacyFallbackMonths;
  if (months == null) return null;

  const h           = normalizeHeightCm(heightCm);
  const table       = String(sex || '').trim().toUpperCase().startsWith('F') ? HAZ_TABLE_GIRLS : HAZ_TABLE_BOYS;
  const clampMonths = Math.max(36, Math.min(228, months));
  const row         = table[clampMonths];

  if (!row || h == null) return null;

  const cm = roundTenth(h);
  if (cm <= row.ss_max) return { label: 'Severely Stunted', ...HAZ_META['Severely Stunted'] };
  if (cm <= row.s_to)   return { label: 'Stunted',          ...HAZ_META['Stunted']          };
  if (cm <= row.n_to)   return { label: 'Normal',           ...HAZ_META['Normal']           };
  return                       { label: 'Tall',             ...HAZ_META['Tall']             };
}

// ── Combined nutritional status (both indicators) ─────────────────────────
// Returns: { baz: {...}, haz: {...} }

export function getNutritionalStatus(
  weight,
  height,
  sex,
  birthdate,
  measurementDate,
) {
  const bmi    = calcBMI(weight, height);
  const baz    = getBMIStatus(bmi, sex, birthdate, measurementDate);
  const haz    = getHAZStatus(height, sex, birthdate, measurementDate);
  return { bmi, baz, haz };
}

// ── App constants ─────────────────────────────────────────────────────────

export const GRADE_LEVELS = [
  'Kinder', 'Grade 1', 'Grade 2', 'Grade 3',
  'Grade 4', 'Grade 5', 'Grade 6', 'SNED',
];

export const SECTIONS = [
  'Kinder', 'Grade 1', 'Grade 2', 'Grade 3',
  'Grade 4', 'Grade 5', 'Grade 6', 'SNED',
];

export function getCurrentSchoolYear() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  // School year starts in June
  if (month >= 6) {
    return `${year}–${year + 1}`;
  }

  return `${year - 1}–${year}`;
}

// The first school year with data in this app. Past years stay in the list so
// their records can still be opened after a new school year starts.
const FIRST_SCHOOL_YEAR_START = 2026;

// Every school year from the first one through 3 years after the current one.
export function getSchoolYears() {
  const currentStart = parseInt(getCurrentSchoolYear().split('–')[0]);
  const years = [];
  for (let start = Math.min(FIRST_SCHOOL_YEAR_START, currentStart); start <= currentStart + 3; start++) {
    years.push(`${start}–${start + 1}`);
  }
  return years;
}

export const SCHOOL_YEARS = getSchoolYears();

export const QUARTERS = ['Baseline', 'Midline', 'Endline'];
export const SESSIONS = ['Morning', 'Afternoon'];
