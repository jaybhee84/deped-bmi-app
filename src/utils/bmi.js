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

export function calcBMI(weight, height) {
  const h = parseFloat(height) / 100;
  const w = parseFloat(weight);
  if (!h || !w || h <= 0 || w <= 0) return null;
  return w / (h * h);
}

export function ageInMonths(birthdate) {
  if (!birthdate) return null;
  const birth = new Date(birthdate);
  const today = new Date();
  let months = (today.getFullYear() - birth.getFullYear()) * 12
             + (today.getMonth()    - birth.getMonth());
  if (today.getDate() < birth.getDate()) months--;
  return months >= 0 ? months : null;
}

export function ageInYears(birthdate) {
  if (!birthdate) return '';
  const birth = new Date(birthdate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : '';
}

// ── BMI-for-Age (BAZ) ─────────────────────────────────────────────────────
// Returns: { label, color, bg } | null

export function getBMIStatus(bmi, sex, birthdate, fallbackMonths) {
  if (bmi == null) return null;

  const months = birthdate ? ageInMonths(birthdate) : fallbackMonths;
  if (months == null) return null;

  const table       = sex === 'F' ? BMI_TABLE_GIRLS : BMI_TABLE_BOYS;
  const clampMonths = Math.max(72, Math.min(228, months));
  const row         = table[clampMonths];

  if (row) {
    if (bmi <= row.sw_max)                      return { label: 'Severely Wasted', ...BAZ_META['Severely Wasted'] };
    if (bmi >= row.w_from  && bmi <= row.w_to)  return { label: 'Wasted',          ...BAZ_META['Wasted']          };
    if (bmi >= row.n_from  && bmi <= row.n_to)  return { label: 'Normal',           ...BAZ_META['Normal']          };
    if (bmi >= row.ow_from && bmi <= row.ow_to) return { label: 'Overweight',       ...BAZ_META['Overweight']      };
    if (bmi >= row.ob_min)                      return { label: 'Obese',            ...BAZ_META['Obese']           };
  }

  // Fallback for age < 72 months (Kinder) — simplified thresholds
  if (bmi < 14)  return { label: 'Severely Wasted', ...BAZ_META['Severely Wasted'] };
  if (bmi < 16)  return { label: 'Wasted',          ...BAZ_META['Wasted']          };
  if (bmi < 23)  return { label: 'Normal',          ...BAZ_META['Normal']          };
  if (bmi < 27)  return { label: 'Overweight',      ...BAZ_META['Overweight']      };
  return               { label: 'Obese',            ...BAZ_META['Obese']           };
}

// ── Height-for-Age (HAZ) ──────────────────────────────────────────────────
// Returns: { label, color, bg } | null

export function getHAZStatus(heightCm, sex, birthdate, fallbackMonths) {
  if (!heightCm) return null;

  const months = birthdate ? ageInMonths(birthdate) : fallbackMonths;
  if (months == null) return null;

  const h           = parseFloat(heightCm);
  const table       = sex === 'F' ? HAZ_TABLE_GIRLS : HAZ_TABLE_BOYS;
  const clampMonths = Math.max(36, Math.min(228, months));
  const row         = table[clampMonths];

  if (!row) return null;

  if (h <= row.ss_max)                    return { label: 'Severely Stunted', ...HAZ_META['Severely Stunted'] };
  if (h >= row.s_from  && h <= row.s_to)  return { label: 'Stunted',          ...HAZ_META['Stunted']          };
  if (h >= row.n_from  && h <= row.n_to)  return { label: 'Normal',           ...HAZ_META['Normal']           };
  if (h >= row.tall_min)                  return { label: 'Tall',             ...HAZ_META['Tall']             };

  return null;
}

// ── Combined nutritional status (both indicators) ─────────────────────────
// Returns: { baz: {...}, haz: {...} }

export function getNutritionalStatus(weight, height, sex, birthdate) {
  const bmi    = calcBMI(weight, height);
  const baz    = getBMIStatus(bmi, sex, birthdate);
  const haz    = getHAZStatus(height, sex, birthdate);
  return { bmi, baz, haz };
}

// ── App constants ─────────────────────────────────────────────────────────

export const GRADE_LEVELS = [
  'Kinder', 'Grade 1', 'Grade 2', 'Grade 3',
  'Grade 4', 'Grade 5', 'Grade 6',
];

export const SECTIONS = [
  'Kinder', 'Grade 1', 'Grade 2', 'Grade 3',
  'Grade 4', 'Grade 5', 'Grade 6',
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

export function getSchoolYears() {
  const currentSY = getCurrentSchoolYear();
  const startYear = parseInt(currentSY.split('–')[0]);

  return [
    `${startYear - 2}–${startYear - 1}`,
    `${startYear - 1}–${startYear}`,
    `${startYear}–${startYear + 1}`,
    `${startYear + 1}–${startYear + 2}`,
  ];
}

export const SCHOOL_YEARS = getSchoolYears();

export const QUARTERS = ['Baseline', 'Midline', 'Endline'];
export const SESSIONS = ['Morning', 'Afternoon'];
