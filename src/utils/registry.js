// ── Registry Number System ────────────────────────────────────────────────
// Format: YYYY-SCHOOLCODE-GX-NNNN
//   YYYY       = school year start (e.g. 2026 for SY 2026–2027)
//   SCHOOLCODE = short code derived from school name (e.g. ieces, ibes, bqes)
//   GX         = grade code (K, G1–G6, G7–G12)
//   NNNN       = zero-padded sequential number unique per school+grade+year

const STORAGE_KEY = 'deped_bmi_registry_counters';

const GRADE_CODES = {
  'Kinder':   'K',
  'Grade 1':  'G1',
  'Grade 2':  'G2',
  'Grade 3':  'G3',
  'Grade 4':  'G4',
  'Grade 5':  'G5',
  'Grade 6':  'G6',
  'Grade 7':  'G7',
  'Grade 8':  'G8',
  'Grade 9':  'G9',
  'Grade 10': 'G10',
  'Grade 11': 'G11',
  'Grade 12': 'G12',
};

// ── School code generator ─────────────────────────────────────────────────
// Takes initials of meaningful words from school name
// e.g. "Isabela East Central Elementary School" → "ieces"
//      "Isabela Bliss Elementary School"         → "ibes"
//      "Bishop Querexeta Elementary School"      → "bqes"

const SKIP_WORDS = new Set([
  'and', 'the', 'of', 'de', 'ng', 'sa', 'at', 'a', 'an',
]);

// Manual overrides for schools with ambiguous or collision-prone codes
const SCHOOL_CODE_OVERRIDES = {
  'Isabela East Central Elementary School':           'ieces',
  'Isabela Bliss Elementary School':                  'ibes',
  'Isabela Central Pilot Elementary School':          'icpes',
  'Isabela Central Pilot Elementary School - Night':  'icpes-n',
  'Westside Elementary School':                       'wes',
  'Ismael Integrated School':                         'iis',
  'Ismael Integrated School (High School)':           'iis-hs',
  'Panigayan Integrated School':                      'pis',
  'Panigayan Integrated School (High School)':        'pis-hs',
  'Badjao Floating Integrated School':                'bfis',
  'Badjao Floating Integrated School (High School)':  'bfis-hs',
  'Geras Integrated School':                          'gis',
  'Geras Integrated School (High School)':            'gis-hs',
  'Basilan National High School':                     'bnhs',
  'Basilan National High School - Night':             'bnhs-n',
  'Isabela City National High School':                'icnhs',
  'Simeon & Josefa Obsequio Elementary School':       'sjoes',
  'Hadji Amilhamja Lahaba Memorial Elementary School':'halmes',
  'Hadji Camlani Elementary School':                  'hces',
  'Hadji Maulana Primary School':                     'hmps',
  'MS Bernardo Elementary School':                    'msbes',
  'Ustadz Wahab Akbar Elementary School':             'uwaes',
};

export function getSchoolCode(schoolName) {
  if (!schoolName) return 'unk';
  const override = SCHOOL_CODE_OVERRIDES[schoolName];
  if (override) return override;

  // Auto-generate: first letter of each meaningful word, lowercase
  const code = schoolName
    .split(/[\s&]+/)
    .filter(w => w.length > 0 && !SKIP_WORDS.has(w.toLowerCase()))
    .map(w => w[0].toLowerCase())
    .join('');

  return code || 'unk';
}

// ── Counter helpers ───────────────────────────────────────────────────────

function loadCounters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCounters(counters) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(counters)); } catch {}
}

function getSYYear(sy) {
  if (!sy) return new Date().getFullYear().toString();
  return sy.split('–')[0].trim();
}

function getGradeCode(gradeLevel) {
  return GRADE_CODES[gradeLevel] || 'XX';
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Generate one registry number.
 * e.g. 2026-ieces-K-0001
 */
export function generateRegistryNumber(sy, gradeLevel, schoolName) {
  const year       = getSYYear(sy);
  const schoolCode = getSchoolCode(schoolName);
  const gradeCode  = getGradeCode(gradeLevel);
  const key        = `${year}-${schoolCode}-${gradeCode}`;

  const counters   = loadCounters();
  const next       = (counters[key] || 0) + 1;
  counters[key]    = next;
  saveCounters(counters);

  return `${year}-${schoolCode}-${gradeCode}-${String(next).padStart(4, '0')}`;
}

/**
 * Generate multiple registry numbers at once (batch entry).
 * Increments counter only once for the whole batch.
 */
export function generateRegistryNumbers(sy, gradeLevel, schoolName, count) {
  if (count <= 0) return [];
  const year       = getSYYear(sy);
  const schoolCode = getSchoolCode(schoolName);
  const gradeCode  = getGradeCode(gradeLevel);
  const key        = `${year}-${schoolCode}-${gradeCode}`;

  const counters   = loadCounters();
  const start      = (counters[key] || 0) + 1;
  counters[key]    = start + count - 1;
  saveCounters(counters);

  return Array.from({ length: count }, (_, i) =>
    `${year}-${schoolCode}-${gradeCode}-${String(start + i).padStart(4, '0')}`
  );
}

/**
 * Get the student's primary identifier — LRN if present, else registryNo.
 */
export function getStudentIdentifier(student) {
  if (student.lrn && student.lrn !== '—') return student.lrn;
  return student.registryNo || '—';
}

/**
 * Get the grade level string from a section label.
 * e.g. "Grade 1 - Mrs. Santos" → "Grade 1"
 */
export function gradeFromSection(section) {
  if (!section) return '';
  return section.split(' - ')[0].trim();
}

/**
 * Check if a registry number belongs to a specific school.
 */
export function registryBelongsToSchool(registryNo, schoolName) {
  if (!registryNo || !schoolName) return false;
  const code = getSchoolCode(schoolName);
  const parts = registryNo.split('-');
  // Format: YYYY-schoolcode-GX-NNNN
  // schoolcode might itself contain dashes (e.g. iis-hs) so check carefully
  return registryNo.includes(`-${code}-`);
}
