// Renames a class and/or changes its adviser across every learner in it.
// The class name lives on the learner (`section`) and on each measurement
// record taken in that class (`rec.section`); the adviser lives beside both as
// `teacherName` / `teacherDisplayName`. Records from other classes (e.g. a
// learner's previous school year) are left untouched.

import { titleCaseName } from "./nameCase.js";

const sameText = (a, b) => String(a || "").trim() === String(b || "").trim();

// The adviser currently saved for a class, from its records first.
export function classAdviser(students, section) {
  for (const student of students) {
    if (!sameText(student.section, section)) continue;
    const rec = (student.records || []).find(
      (record) => sameText(record.section, section) && record.teacherName,
    );
    if (rec) return rec.teacherName;
    if (student.teacherName) return student.teacherName;
  }
  return "";
}

// "Grade 6 - Elliot - Morning" + "Eliot" -> "Grade 6 - Eliot - Morning".
export function sectionWithAdviser(section, familyName) {
  const parts = String(section || "").split(" - ");
  const family = titleCaseName(String(familyName || "").trim());
  if (parts.length < 2 || !family) return section;
  parts[1] = family;
  return parts.join(" - ");
}

// The class name exactly as it will be saved: "grade 6 -  ELIOT" -> "Grade 6 - Eliot".
export function normalizeClassName(value) {
  return titleCaseName(String(value || "").trim().replace(/\s+/g, " "));
}

/**
 * changes: { section?: string, adviser?: string }. A blank adviser clears it so
 * reports fall back to the name in the section; omit `adviser` to keep it.
 * Returns a new students array; unchanged learners keep their identity.
 */
export function applyClassEdit(students, oldSection, changes) {
  const nextSection = normalizeClassName(changes.section) || oldSection;
  const editAdviser = Object.prototype.hasOwnProperty.call(changes, "adviser");
  const adviser = titleCaseName(
    String(changes.adviser || "").trim().replace(/\s+/g, " "),
  );
  const withAdviser = (item) => {
    if (!editAdviser) return item;
    const next = { ...item };
    if (adviser) {
      next.teacherName = adviser;
      next.teacherDisplayName = adviser;
    } else {
      delete next.teacherName;
      delete next.teacherDisplayName;
    }
    return next;
  };

  return students.map((student) => {
    if (!sameText(student.section, oldSection)) return student;
    const records = (student.records || []).map((record) =>
      sameText(record.section, oldSection)
        ? withAdviser({ ...record, section: nextSection })
        : record,
    );
    return { ...withAdviser(student), section: nextSection, records };
  });
}
