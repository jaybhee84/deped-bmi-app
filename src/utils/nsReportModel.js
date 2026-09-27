// One model for the Nutritional Status Report, shared by the on-screen Folio
// sheet, its printout and the Excel download, so all three always match.
import { ageInMonths, normalizeHeightMeters } from "./bmi";

export const NS_BMI_ORDER = ["Severely Wasted", "Wasted", "Normal", "Overweight", "Obese"];
export const NS_HFA_ORDER = ["Severely Stunted", "Stunted", "Normal", "Tall"];
export const NS_HFA_LABELS = { "Severely Stunted": "Sev. Stunted" };

const sexCode = (sex) => {
  const value = String(sex || "").toUpperCase();
  if (value.startsWith("M")) return "M";
  if (value.startsWith("F")) return "F";
  return "";
};

const finite = (value) => (Number.isFinite(value) ? value : null);

// "June 09, 2026", as printed after "Date of Weighing:".
export function nsLongDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) return "—";
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  return date.toLocaleDateString("en-US", { month: "long", day: "2-digit", year: "numeric", timeZone: "UTC" });
}

// mm/dd/yyyy, matching the "Birthday" column header.
export function nsShortDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  return match ? `${match[2]}/${match[3]}/${match[1]}` : "—";
}

function tally(rows, key, labels) {
  const counts = Object.fromEntries(labels.map((label) => [label, { M: 0, F: 0 }]));
  let totalM = 0;
  let totalF = 0;
  rows.forEach((row) => {
    if (row.sex === "M") totalM++;
    if (row.sex === "F") totalF++;
    if (counts[row[key]] && (row.sex === "M" || row.sex === "F")) counts[row[key]][row.sex]++;
  });
  return [
    { label: "No. of Cases", M: totalM, F: totalF, T: totalM + totalF },
    ...labels.map((label) => ({
      label: NS_HFA_LABELS[label] || label,
      M: counts[label].M,
      F: counts[label].F,
      T: counts[label].M + counts[label].F,
    })),
  ];
}

/**
 * students: learners already resolved for the chosen SY/period, each with
 * { id, name, birthdate, sex, section, rec: { weight, date }, heightCm, bmi,
 *   baz: { label }, haz: { label } }.
 * teacherFor(section, students) returns the "Prepared by" name for a class.
 */
export function buildNsReportClasses(students, teacherFor = () => "") {
  const groups = new Map();
  students.forEach((student) => {
    const section = student.section || student.grade || "Unassigned";
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(student);
  });

  return [...groups.entries()].map(([section, classStudents]) => {
    const rows = classStudents
      .map((student) => {
        const heightMeters = finite(normalizeHeightMeters(student.heightCm));
        const months = ageInMonths(student.birthdate, student.rec?.date);
        const weight = Number(student.rec?.weight);
        return {
          id: student.id,
          name: String(student.name || "").trim(),
          birthdate: student.birthdate,
          sex: sexCode(student.sex),
          weightKg: Number.isFinite(weight) && weight > 0 ? weight : null,
          heightMeters,
          heightSquared: heightMeters == null ? null : heightMeters * heightMeters,
          years: months == null ? null : Math.floor(months / 12),
          months: months == null ? null : months % 12,
          bmi: finite(student.bmi),
          bmiStatus: student.baz?.label || "",
          hfaStatus: student.haz?.label || "",
          weighedOn: student.rec?.date || "",
        };
      })
      // Boys first, then girls, alphabetical within each.
      .sort((a, b) => {
        const rank = (sex) => (sex === "M" ? 0 : sex === "F" ? 1 : 2);
        return rank(a.sex) - rank(b.sex) || a.name.localeCompare(b.name);
      });

    const weighingDate = rows
      .map((row) => row.weighedOn)
      .filter(Boolean)
      .sort()
      .at(-1) || "";

    return {
      section,
      rows,
      weighingDate,
      preparedBy: teacherFor(section, classStudents) || "",
      bmiTally: tally(rows, "bmiStatus", NS_BMI_ORDER),
      hfaTally: tally(rows, "hfaStatus", NS_HFA_ORDER),
    };
  });
}
