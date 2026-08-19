import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { getSchoolAbbreviation } from "./schoolLogoMap";

const GRADES = [
  ["Kinder", "Kinder"],
  ["Grade 1", "Grade I"],
  ["Grade 2", "Grade II"],
  ["Grade 3", "Grade III"],
  ["Grade 4", "Grade IV"],
  ["Grade 5", "Grade V"],
  ["Grade 6", "Grade VI"],
  ["SNED", "SNED"],
];

const yes = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .startsWith("Y");
const gradeOf = (student) =>
  String(student.section || student.grade || "")
    .split(" - ")[0]
    .trim();
const sexOf = (student) =>
  String(student.sex || "")
    .toUpperCase()
    .startsWith("M")
    ? "M"
    : "F";
const count = (list, predicate) => list.filter(predicate).length;

function summarize(label, sex, students) {
  return {
    label,
    sex,
    sw: count(students, (s) => s.baz?.label === "Severely Wasted"),
    wasted: count(students, (s) => s.baz?.label === "Wasted"),
    normal: count(students, (s) => s.baz?.label === "Normal"),
    over: count(students, (s) =>
      ["Overweight", "Obese"].includes(s.baz?.label),
    ),
    total: students.length,
    ss: count(students, (s) => s.haz?.label === "Severely Stunted"),
    stunted: count(students, (s) => s.haz?.label === "Stunted"),
    hNormal: count(students, (s) => s.haz?.label === "Normal"),
    tall: count(students, (s) => s.haz?.label === "Tall"),
    // This application contains elementary learners only. Secondary-target
    // fields do not apply and must remain blank on screen and in the export.
    adolescent: "",
    pardo: "",
    stuntedTotal: "",
    indigent: "",
    indigenous: "",
    dewormed: count(students, (s) => yes(s.dewormed)),
    fourPs: count(students, (s) => yes(s.member4ps)),
    repeaters: count(students, (s) => yes(s.previousSbfpBeneficiary)),
  };
}

export function buildForm2Rows(beneficiaries) {
  const rows = [];
  GRADES.forEach(([grade, label]) => {
    const gradeStudents = beneficiaries.filter(
      (student) => gradeOf(student) === grade,
    );
    const male = gradeStudents.filter((student) => sexOf(student) === "M");
    const female = gradeStudents.filter((student) => sexOf(student) === "F");
    rows.push(
      summarize(label, "M", male),
      summarize(label, "F", female),
      summarize(label, "Total", gradeStudents),
    );
  });
  const male = beneficiaries.filter((student) => sexOf(student) === "M");
  const female = beneficiaries.filter((student) => sexOf(student) === "F");
  rows.push(
    summarize("Grand Total", "M", male),
    summarize("Grand Total", "F", female),
    summarize("Grand Total", "Total", beneficiaries),
  );
  return rows;
}

function abbreviation(schoolName) {
  return (
    getSchoolAbbreviation(schoolName) ||
    String(schoolName || "School")
      .match(/[a-zA-Z0-9]+/g)
      ?.map((word) => word[0].toUpperCase())
      .join("") ||
    "School"
  );
}

export async function exportSbfpForm2Excel({
  beneficiaries,
  schoolName,
  schoolId,
  schoolYear,
  division,
  cityBarangay,
  principalName,
  feedingFocalPerson,
  feedingStartDate,
  lastMile,
}) {
  const template = await fetch("/templates/SBFP FORM 2.xlsx");
  if (!template.ok) throw new Error("Unable to load the SBFP Form 2 template.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await template.arrayBuffer());
  const sheet =
    workbook.getWorksheet("SBFP-FORM 2-ES (2)") || workbook.worksheets[0];
  if (!sheet) throw new Error("The SBFP Form 2 worksheet is unavailable.");
  sheet.name = "SBFP Form 2";
  const year = String(schoolYear || "").replace("â€“", "-");
  sheet.getCell("A5").value =
    `SCHOOL-BASED FEEDING PROGRAM (SBFP) SUMMARY OF BENEFICIARIES & START OF FEEDING (SY: ${year})`;
  sheet.getCell("A6").value = `Schools Division Office:  ${division || ""}`;
  sheet.getCell("A7").value =
    `City/ Municipality/Barangay : ${cityBarangay || ""}`;
  sheet.getCell("A8").value =
    `Name of School / School District :  ${schoolName || "Not set"}`;
  sheet.getCell("A9").value = `School  ID Number:  ${schoolId || "Not set"}`;
  sheet.getCell("A10").value =
    `Date of Start of Feeding:  ${feedingStartDate || ""}`;
  sheet.getCell("A11").value =
    `Last Mile School:  ${lastMile === "Y" ? "Y" : "N"}`;
  sheet.unMergeCells("C12:M12");
  sheet.unMergeCells("N12:Q12");
  sheet.unMergeCells("H14:K14");
  sheet.mergeCells("C12:L12");
  sheet.mergeCells("M12:Q12");
  sheet.mergeCells("H14:L14");
  const headers = {
    A12: "Number of School Children by Grade Level",
    B12: "Sex",
    C12: "No. of Primary Targets",
    M12: "No. of Secondary Targets",
    R12: "No. of Learners Dewormed",
    S12: "No. of 4Ps Beneficiaries",
    T12: "Previous-Year Beneficiaries",
    U12: "Date Feeding Started/Ended",
    C13: "Nutritional Status at Start/End of Feeding",
    M13: "Adolescent Pregnant Learners / Mothers",
    N13: "PARDOs",
    O13: "Stunted / Severely Stunted",
    P13: "Indigent Learners",
    Q13: "Indigenous Peoples",
    C14: "WEIGHT",
    H14: "HEIGHT",
    C15: "SW",
    D15: "W",
    E15: "Normal",
    F15: "OW + O",
    G15: "Total",
    H15: "SS",
    I15: "S",
    J15: "Normal",
    K15: "Tall",
    L15: "Total",
  };
  Object.entries(headers).forEach(([cell, value]) => {
    sheet.getCell(cell).value = value;
  });
  [
    21, 9, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.3, 9.3, 9.3, 9.3,
    9.3, 10, 10, 10, 12,
  ].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  for (let row = 12; row <= 15; row++) {
    for (let column = 1; column <= 21; column++) {
      sheet.getCell(row, column).alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
    }
  }
  sheet.unMergeCells("A37:A39");
  sheet.unMergeCells("M43:T43");
  sheet.unMergeCells("A44:U45");
  sheet.spliceRows(37, 0, [], [], []);
  for (let offset = 0; offset < 3; offset++) {
    const source = sheet.getRow(34 + offset);
    const target = sheet.getRow(37 + offset);
    target.height = source.height;
    for (let column = 1; column <= 21; column++) {
      const sourceCell = source.getCell(column);
      const targetCell = target.getCell(column);
      targetCell.style = { ...sourceCell.style };
      targetCell.numFmt = sourceCell.numFmt;
    }
  }
  sheet.mergeCells("A37:A39");
  sheet.mergeCells("A40:A42");
  const rows = buildForm2Rows(beneficiaries);
  rows.forEach((item, index) => {
    const row = sheet.getRow(16 + index);
    const values = [
      item.label,
      item.sex,
      item.sw,
      item.wasted,
      item.normal,
      item.over,
      item.total,
      item.ss,
      item.stunted,
      item.hNormal,
      item.tall,
      item.total,
      item.adolescent,
      item.pardo,
      item.stuntedTotal,
      item.indigent,
      item.indigenous,
      item.dewormed,
      item.fourPs,
      item.repeaters,
      feedingStartDate || "",
    ];
    values.forEach((value, column) => {
      row.getCell(column + 1).value = value;
      row.getCell(column + 1).alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: false,
      };
    });
  });
  for (let row = 43; row <= 50; row++) {
    for (let column = 1; column <= 21; column++) {
      sheet.getCell(row, column).value = null;
    }
  }
  sheet.mergeCells("M46:U46");
  sheet.mergeCells("A48:U49");
  sheet.getCell("A44").value = "Prepared by:";
  sheet.getCell("M44").value = "Approved by:";
  sheet.getCell("A45").value = feedingFocalPerson || "";
  sheet.getCell("M45").value = principalName || "";
  sheet.getCell("A46").value = "SBFP DepEd Focal";
  sheet.getCell("M46").value = "School Head";
  sheet.getCell("A48").value =
    "Note: This form shall be prepared by the school before the start of feeding and after feeding, to be compiled by the SDO, and for final compilation by the RO, for submission to DepEd BLSS-SHD";
  ["A44", "M44"].forEach((cell) => {
    sheet.getCell(cell).font = { name: "Arial", size: 10 };
  });
  ["A45", "M45", "A46", "M46", "A48"].forEach((cell) => {
    sheet.getCell(cell).font = { name: "Arial", size: 10, bold: true };
  });
  ["A44", "M44", "A45", "M45", "A46", "M46", "A48"].forEach((cell) => {
    sheet.getCell(cell).alignment = {
      horizontal: "left",
      vertical: "middle",
      wrapText: false,
    };
  });
  sheet.pageSetup.printArea = "A1:U49";
  saveAs(
    new Blob([await workbook.xlsx.writeBuffer()]),
    `${abbreviation(schoolName)}_form2_SY${year}.xlsx`,
  );
}
