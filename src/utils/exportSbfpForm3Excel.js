import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { loadExcelTemplate } from "./loadExcelTemplate";
import { getSchoolAbbreviation } from "./schoolLogoMap";

const FIRST_ROW = 13;
// The template has 37 name rows (13-49); pages hold 35 so print and Excel match.
const ROWS_PER_PAGE = 35;
const sexOf = (student) =>
  String(student.sex || "").toUpperCase().startsWith("M") ? "M" : "F";

// "Grade 2 - Ocampo" -> "G2 OCAMPO", "Kinder - Rose" -> "K ROSE"
export function form3SectionLabel(section) {
  const [grade, ...rest] = String(section || "").split(" - ");
  const short = grade.trim() === "Kinder" ? "K" : grade.replace(/^Grade\s*/i, "G");
  return `${short} ${rest.join(" - ")}`.trim().toUpperCase();
}

// "Jocelyn R. Buenaventura, Ed.D" -> "JOCELYN R. BUENAVENTURA, Ed.D": caps for the
// name, but degrees after the comma keep their own spelling.
export function form3SignatoryName(value) {
  const [name, ...suffix] = String(value || "").split(",");
  return [name.toUpperCase(), ...suffix].join(",");
}

// Week headings from the starting week. A cleared box prints plain "WEEK"
// so the numbers can be written in by hand; never set means week 1.
export function form3WeekLabels(startWeek) {
  const blank = String(startWeek ?? "1").trim() === "";
  const first = Math.max(1, Number(startWeek ?? 1) || 1);
  return [0, 1, 2, 3].map((i) => (blank ? "WEEK" : `WEEK ${first + i}`));
}

// Splits rows into pages of `perPage`. A section that does not fit in the space
// left starts a new page. A section longer than a whole page continues onto the
// next page, which repeats its header.
export function paginateForm3Rows(rows, perPage) {
  const pages = [];
  let current = [];
  let header = null;
  rows.forEach((row, index) => {
    let sectionSize = 0;
    if (row.header) {
      sectionSize = 1;
      while (rows[index + sectionSize] && !rows[index + sectionSize].header) sectionSize++;
    }
    const full =
      current.length >= perPage ||
      (row.header && current.length >= perPage - 1) ||
      (row.header && current.length > 0 && current.length + sectionSize > perPage);
    if (full) {
      pages.push(current);
      current = !row.header && header ? [header] : [];
    }
    if (row.header) header = row;
    current.push(row);
  });
  if (current.length) pages.push(current);
  return pages;
}

// Kinder and Grade 1: one sheet per section. Grades 2-6 (and others): one joined
// sheet. A sheet longer than `perPage` rows continues on extra pages, each with
// the full header and signatories.
export function buildForm3Pages(beneficiaries, perPage = ROWS_PER_PAGE) {
  const bySection = new Map();
  [...beneficiaries]
    .sort(
      (a, b) =>
        // "Grade 0" makes Kinder sort ahead of Grade 1.
        String(a.section || "").replace(/^Kinder/, "Grade 0").localeCompare(
          String(b.section || "").replace(/^Kinder/, "Grade 0"),
          undefined,
          { numeric: true },
        ) ||
        sexOf(b).localeCompare(sexOf(a)) ||
        String(a.name || "").localeCompare(String(b.name || "")),
    )
    .forEach((student) => {
      const key = student.section || "No Section";
      bySection.set(key, [...(bySection.get(key) || []), student]);
    });
  const sheets = [];
  const joined = { name: "G2-G6", grade: "2-6", joined: true, sections: [] };
  bySection.forEach((students, section) => {
    const grade = section.split(" - ")[0].trim();
    if (grade === "Kinder" || grade === "Grade 1") {
      // A single-class sheet names its class in "Grade:" instead of a header row.
      sheets.push({
        name: form3SectionLabel(section),
        grade: section,
        joined: false,
        sections: [{ section, students }],
      });
    } else joined.sections.push({ section, students });
  });
  if (joined.sections.length) sheets.push(joined);
  return sheets.flatMap((sheet) => {
    const rows = sheet.sections.flatMap(({ section, students }) => [
      ...(sheet.joined ? [{ header: form3SectionLabel(section) }] : []),
      // Numbering restarts per section and carries across page breaks.
      ...students.map((student, index) => ({ student, no: index + 1 })),
    ]);
    const chunks = paginateForm3Rows(rows, perPage);
    return chunks.map((chunk, index) => ({
      ...sheet,
      name: chunks.length > 1 ? `${sheet.name} (${index + 1})` : sheet.name,
      rows: chunk,
      learners: chunk.filter((row) => row.student).length,
    }));
  });
}

function fillPage(sheet, page, details) {
  const rows = page.rows;
  const weeks = form3WeekLabels(details.startWeek);
  ["D11", "I11", "N11", "S11"].forEach((cell, index) => {
    sheet.getCell(cell).value = weeks[index];
  });
  sheet.getCell("B4").value =
    `THE MONTH OF ${details.month || "________"}, SY ${String(details.schoolYear || "").replace("–", "-")}`;
  sheet.getCell("B6").value = `Region:  ${details.region || ""}`;
  sheet.getCell("B7").value = `SDO:  ${details.division || ""}`;
  sheet.getCell("B8").value = `District:  ${details.district || ""}`;
  sheet.getCell("J6").value = `School:  ${details.schoolName || ""}`;
  sheet.getCell("J7").value = `School ID Number: ${details.schoolId || ""}`;
  sheet.getCell("J8").value = `Grade: ${page.grade}`;
  rows.forEach((item, index) => {
    const row = sheet.getRow(FIRST_ROW + index);
    row.getCell(1).value = item.no || null;
    row.getCell(1).style = {
      ...row.getCell(1).style,
      font: { name: "Arial", size: 8 },
      alignment: { horizontal: "center", vertical: "middle" },
    };
    const name = row.getCell(2);
    const sex = row.getCell(3);
    name.value = item.header || item.student.name || "";
    sex.value = item.header ? "" : sexOf(item.student);
    // Template cells share style objects, so replace the style instead of mutating it.
    name.style = {
      ...name.style,
      font: { name: "Arial", size: 9, bold: Boolean(item.header) },
      alignment: { horizontal: "left", vertical: "middle" },
    };
    sex.style = {
      ...sex.style,
      font: { name: "Arial", size: 9, bold: true },
      alignment: { horizontal: "center", vertical: "middle" },
    };
  });
  const footerTop = 50;
  sheet.getCell(`B${footerTop + 1}`).value = form3SignatoryName(details.preparedName);
  // "SBFP Coordinator" always prints under the preparer's own position.
  const preparedLines = [details.preparedPosition, "SBFP Coordinator"].filter(Boolean);
  preparedLines.forEach((line, index) => {
    sheet.getCell(`B${footerTop + 2 + index}`).value = line;
  });
  sheet.getCell(`B${footerTop + 6}`).value = form3SignatoryName(details.approvedName);
  sheet.getCell(`B${footerTop + 7}`).value = details.approvedPosition || "";
  matchScreenLayout(sheet);
  sheet.pageSetup.printArea = `A1:W${footerTop + 7}`;
}

// Make the sheet look and print like the on-screen/print-preview Form 3:
// 35 learner rows, black lines (thick outside, around Sex, at each week's end),
// and one landscape Folio page.
function matchScreenLayout(sheet) {
  const black = (style) => ({ style, color: { argb: "FF000000" } });
  const last = FIRST_ROW + ROWS_PER_PAGE - 1;
  const thickRight = new Set([3, 8, 13, 18, 23]); // Sex, and the end of weeks 1-4
  for (let r = FIRST_ROW; r <= last; r++) {
    for (let c = 1; c <= 23; c++) {
      const cell = sheet.getCell(r, c);
      cell.style = {
        ...cell.style,
        border: {
          top: black(r === FIRST_ROW ? "medium" : "thin"),
          bottom: black(r === last ? "medium" : "thin"),
          left: black(c === 1 || c === 3 ? "medium" : c === 2 ? "hair" : "thin"),
          right: black(thickRight.has(c) || c === 2 ? "medium" : c === 1 ? "hair" : "thin"),
        },
      };
    }
  }
  // The template has 37 name rows; pages hold 35, so hide the two spare rows.
  for (let r = last + 1; r < 50; r++) sheet.getRow(r).hidden = true;
  Object.assign(sheet.pageSetup, {
    paperSize: 14, // Folio 8.5 x 13 in
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0, footer: 0 },
  });
}

export async function exportSbfpForm3Excel({ beneficiaries, ...details }) {
  const pages = buildForm3Pages(beneficiaries);
  if (!pages.length) throw new Error("There are no SBFP beneficiaries for Form 3.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await loadExcelTemplate("SBFP FORM 3.xlsx"));
  const template = workbook.getWorksheet("FORM 3 G2") || workbook.worksheets.at(-1);
  workbook.worksheets
    .filter((sheet) => sheet !== template)
    .forEach((sheet) => workbook.removeWorksheet(sheet.id));
  const pristine = template.model;
  pages.forEach((page, index) => {
    const name = page.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
    let sheet = template;
    if (index === 0) sheet.name = name;
    else {
      sheet = workbook.addWorksheet(name);
      sheet.model = { ...structuredClone(pristine), name, id: sheet.id };
      // The model setter drops merged cells, so restore them.
      pristine.merges.forEach((range) => sheet.mergeCells(range));
    }
    fillPage(sheet, page, details);
  });
  const abbreviation = getSchoolAbbreviation(details.schoolName) || "School";
  saveAs(
    new Blob([await workbook.xlsx.writeBuffer()]),
    `${abbreviation}_form3_${details.month || "month"}${details.startWeek ? `_week${details.startWeek}` : ""}.xlsx`,
  );
}
