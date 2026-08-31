import ExcelJS from "exceljs";
import FileSaver from "file-saver";
import { ageInMonths, formatHeightMeters } from "./bmi";
import { getSchoolAbbreviation } from "./schoolLogoMap";
import { loadExcelTemplate } from "./loadExcelTemplate";

const { saveAs } = FileSaver;

const safe = (value) => String(value || "School").replace(/[^a-zA-Z0-9]+/g, "_");
const sex = (student) =>
  String(student.sex || "").toUpperCase().startsWith("M") ? "M" : "F";
const count = (students, predicate) => students.filter(predicate).length;

function bmiFormulaImage() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120" viewBox="0 0 300 120"><rect x="1" y="1" width="298" height="118" fill="white" stroke="#111" stroke-width="2"/><text x="150" y="29" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="700">Body Mass Index =</text><line x1="48" y1="41" x2="252" y2="41" stroke="#64748b" stroke-width="1"/><text x="150" y="72" text-anchor="middle" font-family="Arial, sans-serif" font-size="15">Weight (kgs)</text><text x="150" y="101" text-anchor="middle" font-family="Arial, sans-serif" font-size="15">Height squared (m²)</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function teacherFromSection(section) {
  const parts = String(section || "").split(" - ").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return "";
  const teacherParts = parts.slice(1);
  if (["Morning", "Afternoon"].includes(teacherParts.at(-1))) teacherParts.pop();
  return teacherParts.join(" - ");
}

function teacherDisplayName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (!name) return "";
  if (name.includes(",")) {
    const [lastName, givenNames = ""] = name.split(/,(.+)/);
    const parts = givenNames.trim().split(" ").filter(Boolean);
    if (parts.length < 2) return `${lastName.trim()}, ${givenNames.trim()}`.trim();
    return `${lastName.trim()}, ${parts[0]} ${parts.slice(1).map((part) => `${part.charAt(0)}.`).join(" ")}`;
  }
  const parts = name.split(" ");
  if (parts.length < 3) return name;
  return `${parts[0]} ${parts.slice(1, -1).map((part) => `${part.charAt(0)}.`).join(" ")} ${parts.at(-1)}`;
}

function cleanSheetName(value, used) {
  const base = String(value || "Unassigned").replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 31) || "Unassigned";
  let name = base;
  let number = 2;
  while (used.has(name)) {
    const suffix = ` ${number++}`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(name);
  return name;
}

function dateValue(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : "";
}

function summary(sheet, students) {
  const bmi = [
    [77, "No. of Cases", () => true],
    [78, "Severely Wasted", (student) => student.baz?.label === "Severely Wasted"],
    [79, "Wasted", (student) => student.baz?.label === "Wasted"],
    [80, "Normal", (student) => student.baz?.label === "Normal"],
    [81, "Overweight", (student) => student.baz?.label === "Overweight"],
    [82, "Obese", (student) => student.baz?.label === "Obese"],
  ];
  bmi.forEach(([row, label, predicate]) => {
    const male = count(students, (student) => sex(student) === "M" && predicate(student));
    const female = count(students, (student) => sex(student) === "F" && predicate(student));
    sheet.getCell(`C${row}`).value = label;
    sheet.getCell(`D${row}`).value = male;
    sheet.getCell(`E${row}`).value = female;
    sheet.getCell(`F${row}`).value = male + female;
  });
  const hfa = [
    [77, "No. of Cases", () => true],
    [78, "Sev. Stunted", (student) => student.haz?.label === "Severely Stunted"],
    [79, "Stunted", (student) => student.haz?.label === "Stunted"],
    [80, "Normal", (student) => student.haz?.label === "Normal"],
    [81, "Tall", (student) => student.haz?.label === "Tall"],
  ];
  hfa.forEach(([row, label, predicate]) => {
    const male = count(students, (student) => sex(student) === "M" && predicate(student));
    const female = count(students, (student) => sex(student) === "F" && predicate(student));
    sheet.getCell(`G${row}`).value = label;
    sheet.getCell(`I${row}`).value = male;
    sheet.getCell(`L${row}`).value = female;
    sheet.getCell(`M${row}`).value = male + female;
  });
}

function mergeSummaryCells(sheet) {
  // Give the summary labels enough room without forcing the learner table's
  // individual columns to be unnecessarily wide.
  for (let row = 76; row <= 82; row++) {
    const source = sheet.getCell(`C${row}`);
    const value = source.value;
    const style = structuredClone(source.style);
    sheet.mergeCells(`A${row}:C${row}`);
    const target = sheet.getCell(`A${row}`);
    target.value = value;
    target.style = style;
    target.alignment = {
      ...target.alignment,
      horizontal: row === 76 ? "center" : "left",
      vertical: "middle",
    };
    target.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  }

  // Keep M, F, and Total compact. These values do not need the wide merged
  // ranges used by the original template.
  for (let row = 76; row <= 81; row++) {
    const maleCell = sheet.getCell(`I${row}`);
    const femaleCell = sheet.getCell(`L${row}`);
    const totalCell = sheet.getCell(`M${row}`);
    const maleValue = maleCell.value;
    const femaleValue = femaleCell.value;
    const totalValue = totalCell.value;
    const maleStyle = structuredClone(maleCell.style);
    const femaleStyle = structuredClone(femaleCell.style);
    const totalStyle = structuredClone(totalCell.style);

    sheet.unMergeCells(`I${row}:K${row}`);
    sheet.getCell(`I${row}`).value = maleValue;
    sheet.getCell(`I${row}`).style = maleStyle;
    sheet.getCell(`J${row}`).value = femaleValue;
    sheet.getCell(`J${row}`).style = femaleStyle;
    sheet.getCell(`K${row}`).value = totalValue;
    sheet.getCell(`K${row}`).style = totalStyle;
    sheet.getCell(`L${row}`).value = null;
    sheet.getCell(`L${row}`).style = {};
    sheet.getCell(`M${row}`).value = null;
    sheet.getCell(`M${row}`).style = {};
  }
}

function unmergeIfPresent(sheet, range) {
  try {
    sheet.unMergeCells(range);
  } catch {
    // The source template may already have been sanitized.
  }
}

function compactLearnerRows(sheet, studentCount) {
  const firstRemovedRow = 10 + Math.min(studentCount, 65);
  const removeCount = Math.max(0, 76 - firstRemovedRow);
  const affectedMerges = Object.values(sheet._merges)
    .map((merge) => merge.range)
    .filter((range) => Number(range.match(/\d+/)?.[0]) >= firstRemovedRow);
  const movedMerges = affectedMerges.filter((range) => {
    const row = Number(range.match(/\d+/)?.[0]);
    return row >= 76 && row <= 89;
  });
  affectedMerges.forEach((range) => sheet.unMergeCells(range));
  if (removeCount) sheet.spliceRows(firstRemovedRow, removeCount);
  movedMerges.forEach((range) => {
    const shifted = range.replace(/([A-Z]+)(\d+)/g, (_, column, row) =>
      `${column}${Number(row) - removeCount}`,
    );
    sheet.mergeCells(shifted);
  });
  const finalRow = 89 - removeCount;
  if (sheet.rowCount > finalRow) {
    sheet.spliceRows(finalRow + 1, sheet.rowCount - finalRow);
  }
  sheet._rows.length = finalRow;
  return finalRow;
}

function populateSheet(sheet, students, details, formulaImageId) {
  // Size the actual printable columns instead of relying on Excel to scale
  // oversized or undersized template defaults at print time.
  const columnWidths = [
    4, 1, 24, 11, 8, 8, 5, 9, 3, 3, 5, 9, 15, 15,
  ];
  columnWidths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  // The source workbook colored ages below 6 red. With the combined
  // year.month age field, blank reserved rows evaluate like zero in Excel and
  // incorrectly turn red, so this legacy rule no longer applies.
  sheet.removeConditionalFormatting(
    (formatting) => formatting.ref !== "I9:I73",
  );
  Object.values(sheet._merges)
    .map((merge) => merge.range)
    .filter((range) => [7, 8].includes(Number(range.match(/\d+/)?.[0])))
    .forEach((range) => sheet.unMergeCells(range));
  const reportHeaders = [
    ["A7:A8", "No."],
    ["B7:C8", "Names"],
    ["D7:D8", "Birthday\nmm/dd/yyyy"],
    ["E7:E8", "Weight\n(kg)"],
    ["F7:F8", "Height\n(meters)"],
    ["G7:G8", "Sex"],
    ["H7:H8", "Height²\n(m²)"],
    ["I7:K8", "Age\n(year) (month)"],
    ["L7:L8", "Body Mass\nIndex"],
    ["M7:M8", "Nutritional\nStatus"],
    ["N7:N8", "Height-for-Age"],
  ];
  reportHeaders.forEach(([range, label]) => {
    sheet.mergeCells(range);
    const cell = sheet.getCell(range.split(":")[0]);
    cell.value = label;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true, shrinkToFit: true };
    cell.font = { ...cell.font, bold: true, size: 8 };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });
  sheet.getRow(7).height = 22;
  sheet.getRow(8).height = 22;
  for (let row = 9; row <= 73; row++) {
    sheet.getRow(row).height = 18;
    for (let column = 1; column <= 14; column++) sheet.getCell(row, column).value = null;
    if (!sheet.getCell(`B${row}`).isMerged) sheet.mergeCells(`B${row}:C${row}`);
    if (!sheet.getCell(`I${row}`).isMerged) sheet.mergeCells(`I${row}:K${row}`);
    for (let column = 1; column <= 14; column++) {
      sheet.getCell(row, column).alignment = {
        horizontal: column === 2 || column === 3 ? "left" : "center",
        vertical: "bottom",
        wrapText: false,
        shrinkToFit: column === 4,
      };
    }
  }
  sheet.getCell("A1").value = "NUTRITIONAL STATUS REPORT";
  sheet.getCell("A2").value = details.schoolName || "School not set";
  sheet.getCell("A3").value = details.cityBarangay || "";
  sheet.getCell("A4").value = `${details.period} SY ${String(details.schoolYear || "").replace("–", "-")}`;
  sheet.getCell("A6").value = "Date of Weighing:";
  sheet.getCell("D6").value = dateValue(students[0]?.rec?.date);
  sheet.getCell("D6").numFmt = "mm/dd/yyyy";
  if (!sheet.getCell("M6").isMerged) sheet.mergeCells("M6:N6");
  sheet.getCell("M6").value = `Grade/Class: ${details.section}`;
  sheet.getCell("M6").alignment = {
    horizontal: "right",
    vertical: "middle",
    wrapText: false,
    shrinkToFit: true,
  };
  sheet.getRow(6).height = Math.max(sheet.getRow(6).height || 0, 18);

  students.slice(0, 65).forEach((student, index) => {
    const row = sheet.getRow(9 + index);
    const months = ageInMonths(student.birthdate, student.rec?.date);
    const height = Number(formatHeightMeters(student.heightCm));
    const values = [
      index + 1, student.name || "", dateValue(student.birthdate),
      student.rec?.weight ?? "", Number.isFinite(height) ? height : "", sex(student),
      Number.isFinite(height) ? Number((height * height).toFixed(4)) : "",
      months == null ? "" : `${Math.floor(months / 12)}.${months % 12}`,
      student.bmi == null ? "" : Number(student.bmi.toFixed(1)),
      student.baz?.label || "", student.haz?.label || "",
    ];
    const columns = [1, 2, 4, 5, 6, 7, 8, 9, 12, 13, 14];
    values.forEach((value, index) => { row.getCell(columns[index]).value = value; });
    row.getCell(4).numFmt = "mm/dd/yyyy";
    row.getCell(5).numFmt = "0.##";
    row.getCell(6).numFmt = "0.00";
    row.getCell(8).numFmt = "0.0000";
    row.getCell(12).numFmt = "0.0";
  });

  summary(sheet, students);
  mergeSummaryCells(sheet);
  for (let row = 76; row <= 81; row++) {
    const cell = sheet.getCell(`N${row}`);
    cell.value = null;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
    cell.border = {};
  }
  ["I82:L83", "G83:H83", "L84:N84", "L85:N85", "L86:N86", "L87:N87", "F89:M89"]
    .forEach((range) => unmergeIfPresent(sheet, range));
  for (let row = 82; row <= 89; row++) {
    for (let column = 7; column <= 14; column++) {
      const cell = sheet.getCell(row, column);
      cell.value = null;
      cell._comment = undefined;
      cell.border = {};
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
    }
  }
  sheet.getCell("I82").value = "";
  sheet.getCell("G82").value = "";
  const teacherRecord = students.find((student) => student.rec?.teacherName)?.rec;
  sheet.getCell("G84").value = "Prepared by:";
  if (!sheet.getCell("G87").isMerged) sheet.mergeCells("G87:K87");
  if (!sheet.getCell("G88").isMerged) sheet.mergeCells("G88:K88");
  sheet.getCell("G87").value = teacherRecord?.teacherDisplayName || teacherDisplayName(
    teacherRecord?.teacherName || teacherFromSection(details.section),
  );
  sheet.getCell("G87").font = {
    ...sheet.getCell("G87").font,
    size: 12,
    bold: true,
  };
  sheet.getCell("G85").value = "";
  sheet.getCell("G86").value = "";
  sheet.getCell("G88").value = "Class Adviser";
  ["G84", "G87", "G88"].forEach((address) => {
    sheet.getCell(address).alignment = {
      horizontal: "left",
      vertical: "middle",
      shrinkToFit: false,
    };
    sheet.getCell(address)._comment = undefined;
  });
  for (let row = 84; row <= 88; row++) {
    for (let column = 7; column <= 11; column++) {
      const cell = sheet.getCell(row, column);
      cell._comment = undefined;
      cell.border = {};
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
    }
  }
  [84, 85, 86, 87, 88].forEach((row) => {
    sheet.getRow(row).height = 18;
  });
  for (let row = 1; row <= 89; row++) {
    for (let column = 1; column <= 14; column++) {
      sheet.getCell(row, column)._comment = undefined;
    }
  }
  const finalRow = compactLearnerRows(sheet, students.length);
  const summaryRow = 10 + Math.min(students.length, 65);
  for (let row = summaryRow; row <= summaryRow + 6; row++) {
    sheet.getRow(row).height = 18;
  }
  sheet.addImage(formulaImageId, {
    tl: { col: 11.45, row: summaryRow - 1 },
    ext: { width: 150, height: 60 },
    editAs: "oneCell",
  });
  sheet.views = [{ state: "normal", showGridLines: false }];
  sheet.pageSetup.printArea = `A1:N${finalRow}`;
  sheet.pageSetup.paperSize = 14;
  sheet.pageSetup.orientation = "portrait";
  sheet.pageSetup.fitToPage = true;
  sheet.pageSetup.fitToWidth = 1;
  sheet.pageSetup.fitToHeight = 1;
  sheet.pageSetup.horizontalCentered = true;
  sheet.pageSetup.verticalCentered = false;
  sheet.pageSetup.margins = {
    left: 0.25,
    right: 0.25,
    top: 0.35,
    bottom: 0.35,
    header: 0.2,
    footer: 0.2,
  };
}

export async function buildNsReportWorkbook({ students, schoolName, schoolYear, period, cityBarangay, preparedBy, principalName }) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await loadExcelTemplate("NS REPORT.xlsx"));
  const template = workbook.worksheets[0];
  if (!template) throw new Error("The NS Report template is unavailable.");
  const formulaImageId = workbook.addImage({
    base64: bmiFormulaImage(),
    extension: "svg",
  });

  const groups = new Map();
  students.forEach((student) => {
    const section = student.section || student.grade || "Unassigned";
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(student);
  });
  if (!groups.size) groups.set("No Learners", []);

  const templateModel = structuredClone(template.model);
  const templateMergeRanges = Object.values(template._merges).map(
    (merge) => merge.range,
  );
  const usedNames = new Set();
  [...groups.entries()].forEach(([section, sectionStudents], index) => {
    const name = cleanSheetName(section, usedNames);
    let sheet = template;
    if (index === 0) {
      sheet.name = name;
    } else {
      sheet = workbook.addWorksheet(name);
      const id = sheet.id;
      sheet.model = { ...structuredClone(templateModel), id, name };
      // ExcelJS's worksheet model setter does not reliably rebuild every
      // merge from a styled template. Restore them explicitly so every class
      // sheet has the same title, metadata, headers, and summary layout as the
      // first sheet.
      const existingMerges = new Set(
        Object.values(sheet._merges).map((merge) => merge.range),
      );
      templateMergeRanges.forEach((range) => {
        if (!existingMerges.has(range)) sheet.mergeCells(range);
      });
    }
    populateSheet(sheet, sectionStudents, {
      schoolName, schoolYear, period, cityBarangay, preparedBy, principalName, section,
    }, formulaImageId);
  });

  return workbook;
}

export async function exportNsReportExcel(options) {
  const workbook = await buildNsReportWorkbook(options);

  const abbreviation = getSchoolAbbreviation(options.schoolName) || safe(options.schoolName);
  const year = String(options.schoolYear || "").replace("–", "-");
  const classSuffix = options.selectedClass && options.selectedClass !== "All"
    ? `_${safe(options.selectedClass)}`
    : "";
  saveAs(
    new Blob([await workbook.xlsx.writeBuffer()]),
    `${abbreviation}_NS_Report_${options.period}${classSuffix}_SY${year}.xlsx`,
  );
}
