import { calcBMI, getBMIStatus, getHAZStatus } from "./bmi.js";

const REPORT_GRADE_ORDER = [
  "Kinder",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "SNED",
];

const BMI_LABELS = [
  "Severely Wasted",
  "Wasted",
  "Normal",
  "Overweight",
  "Obese",
];
const HFA_LABELS = ["Severely Stunted", "Stunted", "Normal", "Tall"];

function emptyStats() {
  return {
    enrolment: 0,
    weighed: 0,
    takenHeight: 0,
    bmi: Object.fromEntries(BMI_LABELS.map((l) => [l, 0])),
    hfa: Object.fromEntries(HFA_LABELS.map((l) => [l, 0])),
  };
}

function addInto(target, src) {
  target.enrolment += src.enrolment;
  target.weighed += src.weighed;
  target.takenHeight += src.takenHeight;
  BMI_LABELS.forEach((l) => (target.bmi[l] += src.bmi[l]));
  HFA_LABELS.forEach((l) => (target.hfa[l] += src.hfa[l]));
}

function deriveGrade(s) {
  const g = s.section?.split(" - ")[0] || s.grade || "";
  return REPORT_GRADE_ORDER.includes(g) ? g : "SNED";
}

export function buildNutritionReport(students, filterSY, filterPeriod) {
  const rows = REPORT_GRADE_ORDER.map((grade) => ({
    grade,
    M: emptyStats(),
    F: emptyStats(),
  }));
  const rowByGrade = Object.fromEntries(rows.map((r) => [r.grade, r]));

  students.forEach((s) => {
    const rec =
      s.records?.find((r) => r.sy === filterSY && r.q === filterPeriod) || null;
    const grade = deriveGrade({ ...s, section: rec?.section || s.section });
    const row = rowByGrade[grade];
    if (!row) return;
    const sex = String(s.sex || "")
      .trim()
      .toUpperCase();

    const bucket = sex === "M" || sex === "MALE" ? row.M : row.F;

    bucket.enrolment++;

    if (!rec) return;

    // Only positive measurements count toward the summary.
    const hasWeight = Number.isFinite(Number(rec.weight)) && Number(rec.weight) > 0;
    const hasHeight = Number.isFinite(Number(rec.height)) && Number(rec.height) > 0;

    if (hasWeight && hasHeight) {
      bucket.weighed++;
      const bmi = calcBMI(rec.weight, rec.height);
      const baz = getBMIStatus(bmi, s.sex, s.birthdate, rec.date);
      if (baz?.label && bucket.bmi[baz.label] !== undefined) {
        bucket.bmi[baz.label]++;
      }
    }

    if (hasHeight) {
      bucket.takenHeight++;
      const haz = getHAZStatus(rec.height, s.sex, s.birthdate, rec.date);
      if (haz?.label && bucket.hfa[haz.label] !== undefined) {
        bucket.hfa[haz.label]++;
      }
    }
  });

  const withTotals = rows.map((r) => {
    const Total = emptyStats();
    addInto(Total, r.M);
    addInto(Total, r.F);
    return { ...r, Total };
  });

  const grand = { M: emptyStats(), F: emptyStats(), Total: emptyStats() };
  withTotals.forEach((r) => {
    addInto(grand.M, r.M);
    addInto(grand.F, r.F);
    addInto(grand.Total, r.Total);
  });

  return { rows: withTotals, grand };
}
