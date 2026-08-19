import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { getSchoolAbbreviation } from "./schoolLogoMap";

const STATUS_CODES = {
  "Severely Wasted": "SW",
  Wasted: "W",
  Normal: "N",
  Overweight: "OW",
  Obese: "O",
  "Severely Stunted": "SS",
  Stunted: "S",
  Tall: "T",
};
const safe = (value) =>
  String(value || "School").replace(/[^a-zA-Z0-9]+/g, "_");
const schoolAbbreviation = (value) => {
  const mappedAbbreviation = getSchoolAbbreviation(value);
  if (mappedAbbreviation) return mappedAbbreviation;
  const initials = String(value || "School")
    .match(/[a-zA-Z0-9]+/g)
    ?.map((word) => word.charAt(0).toUpperCase())
    .join("");
  return initials || safe(value);
};
const normalizedYear = (value) =>
  String(value || "__________").replace("–", "-");

function toDate(value) {
  const parts = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (parts) return new Date(+parts[1], +parts[2] - 1, +parts[3]);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function age(value) {
  const birth = toDate(value);
  if (!birth) return "";
  const today = new Date();
  let months =
    (today.getFullYear() - birth.getFullYear()) * 12 +
    today.getMonth() -
    birth.getMonth();
  if (today.getDate() < birth.getDate()) months--;
  return `${Math.max(0, Math.floor(months / 12))}. ${Math.max(0, months % 12)}`;
}

// Retains the supplied Form 1 template's layout, images, styles, merged cells and print settings.
export async function exportSbfpForm1Excel({
  beneficiaries,
  schoolName,
  schoolId,
  schoolYear,
  division,
  cityBarangay,
  principalName,
  feedingFocalPerson,
}) {
  const template = await fetch("/templates/SBFP FORM 1.xlsx");
  if (!template.ok) throw new Error("Unable to load the SBFP Form 1 template.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await template.arrayBuffer());
  const sheet =
    workbook.getWorksheet("SBFP-FORM 1 (2)") || workbook.worksheets[1];
  if (!sheet) throw new Error("The SBFP Form 1 worksheet is unavailable.");
  sheet.name = "SBFP Form 1";

  for (let row = 14; row <= 202; row++)
    for (let col = 1; col <= 19; col++) sheet.getCell(row, col).value = null;
  sheet.getCell("A5").value =
    `Master List Beneficiaries for School-Based Feeding Program (SBFP) (SY${normalizedYear(schoolYear)})`;
  sheet.getCell("A7").value =
    `Division/Province: ${division || ""}`;
  sheet.getCell("A8").value =
    `City/ Municipality/Barangay : ${cityBarangay || ""}`;
  sheet.getCell("A9").value =
    `Name of School / School District :  ${schoolName || "Not set"}`;
  sheet.getCell("A10").value =
    `School  ID Number:  ${schoolId || "Not set"}`;
  sheet.getCell("G7").value =
    `Name of Principal : ${principalName || ""}`;
  sheet.getCell("G8").value =
    `Name of Feeding Focal Person : ${feedingFocalPerson || ""}`;
  sheet.getCell("A206").value = feedingFocalPerson || "";
  sheet.getCell("H206").value = principalName || "";

  beneficiaries.slice(0, 189).forEach((student, index) => {
    const row = sheet.getRow(14 + index);
    const rec = student.rec;
    row.getCell(1).value = index + 1;
    row.getCell(2).value = student.name || "";
    row.getCell(3).value = String(student.sex || "")
      .toUpperCase()
      .startsWith("M")
      ? "M"
      : String(student.sex || "")
            .toUpperCase()
            .startsWith("F")
        ? "F"
        : "";
    row.getCell(4).value = student.section || student.grade || "";
    row.getCell(5).value = toDate(student.birthdate) || "";
    row.getCell(6).value = toDate(rec?.date) || "";
    row.getCell(7).value = age(student.birthdate);
    row.getCell(8).value = rec?.weight ?? "";
    row.getCell(9).value = student.heightCm ?? rec?.height ?? "";
    row.getCell(10).value = student.bmi ? Number(student.bmi.toFixed(2)) : "";
    row.getCell(11).value = STATUS_CODES[student.baz?.label] || "";
    row.getCell(12).value = STATUS_CODES[student.haz?.label] || "";
    row.getCell(13).value = student.dewormed ?? "";
    row.getCell(14).value = student.parentConsent ?? "";
    row.getCell(15).value = student.member4ps ?? "";
    row.getCell(16).value = student.previousSbfpBeneficiary ?? "";
    row.getCell(5).numFmt = "mm/dd/yyyy";
    row.getCell(6).numFmt = "mm/dd/yyyy";
    row.getCell(8).numFmt = "0.##";
    row.getCell(9).numFmt = "0.##";
    row.getCell(10).numFmt = "0.00";
  });
  [5, 32, 6, 23, 13, 13, 13, 9, 9, 13, 10, 10, 13, 13, 13, 13].forEach(
    (width, index) => {
      sheet.getColumn(index + 1).width = width;
    },
  );
  for (let row = 12; row <= 202; row++)
    for (let col = 1; col <= 16; col++)
      sheet.getCell(row, col).alignment = {
        ...sheet.getCell(row, col).alignment,
        wrapText: row <= 13,
        vertical: "middle",
        horizontal: col === 2 ? "left" : "center",
      };
  saveAs(
    new Blob([await workbook.xlsx.writeBuffer()]),
    `${schoolAbbreviation(schoolName)}_form1_SY${normalizedYear(schoolYear)}.xlsx`,
  );
}
