const SCHOOL_YEAR_DASHES = /[\u002d\u2010-\u2015\u2212]/g;

export function normalizeSchoolYear(value) {
  return String(value || "")
    .trim()
    .replace(SCHOOL_YEAR_DASHES, "–")
    .replace(/\s+/g, "");
}

export function countPortalEnrolments(students, schoolYear) {
  const targetYear = normalizeSchoolYear(schoolYear);
  if (!targetYear) return 0;

  return (students || []).filter((student) => {
    const enrolledYear =
      student?.schoolYear || student?.school_year || student?.enrolmentSy;
    return normalizeSchoolYear(enrolledYear) === targetYear;
  }).length;
}

export function totalManualEnrolment(data) {
  return Object.values(data || {}).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0,
  );
}

export function chooseEnrolmentTotal(portalTotal, manualTotal) {
  const portal = Number(portalTotal) || 0;
  return portal > 0 ? portal : Number(manualTotal) || 0;
}

export function combineSchoolEnrolmentTotals(portalRows, manualRows) {
  const portalBySchool = new Map();

  for (const row of portalRows || []) {
    const schoolId = String(row?.school_id || "").trim();
    if (!schoolId) continue;
    portalBySchool.set(schoolId, (portalBySchool.get(schoolId) || 0) + 1);
  }

  const manualBySchool = new Map();
  for (const row of manualRows || []) {
    const schoolId = String(row?.school_id || "").trim();
    if (!schoolId) continue;
    const total =
      row?.total ??
      Object.values(row?.data || {}).reduce(
        (sum, value) => sum + (Number(value) || 0),
        0,
      );
    manualBySchool.set(schoolId, Number(total) || 0);
  }

  const schoolIds = new Set([
    ...portalBySchool.keys(),
    ...manualBySchool.keys(),
  ]);

  let grandTotal = 0;
  for (const schoolId of schoolIds) {
    grandTotal += chooseEnrolmentTotal(
      portalBySchool.get(schoolId),
      manualBySchool.get(schoolId),
    );
  }
  return grandTotal;
}
