import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import swabeLogo from "../images/swabe.png";
import { getSchoolLogoUrl } from "./schoolLogoMap";
import { getCachedLogoSrc } from "./logoCache";

/**
 * Converts an image URL, base64 data string, or imported module into a Base64 Buffer for ExcelJS.
 */
async function fetchImageAsBase64(imageSource) {
  if (!imageSource) return null;

  try {
    // If it's already a Data URL (data:image/png;base64,...)
    if (typeof imageSource === "string" && imageSource.startsWith("data:image")) {
      const parts = imageSource.split(",");
      return {
        base64: parts[1],
        extension: imageSource.substring(imageSource.indexOf("/") + 1, imageSource.indexOf(";")),
      };
    }

    // Standard URL/Path fetch
    const response = await fetch(imageSource);
    const blob = await response.blob();

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === "string") {
          const base64Data = result.split(",")[1];
          const ext = blob.type.split("/")[1] || "png";
          resolve({ base64: base64Data, extension: ext });
        } else {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("Failed to load logo for Excel export:", imageSource, err);
    return null;
  }
}

export const exportImmunizationExcel = async ({
  students = [],
  rows = [],
  metadata = {},
  selectedSchool,
  sy = "2026-2027",
  selectedProgramKey = "MR & Td",
  activeProgram = {},
  section = "",
  region = "Region IX - Zamboanga Peninsula",
  province = "",
  city = "",
  barangay = "",
  district = "",
  vaxDate = "",
  vax1Received = "",
  vax1Used = "",
  vax1Unused = "",
  vax2Received = "",
  vax2Used = "",
  vax2Unused = "",
}) => {
  const list = students.length > 0 ? students : rows;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Immunization Masterlist");

  // Page setup for landscape legal printing
  worksheet.pageSetup = {
    orientation: "landscape",
    paperSize: 5, // Legal
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  const vax1Label = activeProgram.vax1Label || metadata.vax1Label || "Vaccine 1";
  const vax2Label = activeProgram.vax2Label || metadata.vax2Label || "Vaccine 2";
  const formTitle =
    activeProgram.formTitle ||
    metadata.title ||
    `Recording Form: Masterlist of Students (${selectedProgramKey})`;
  const schoolNameStr =
    selectedSchool || metadata.schoolName || "Division-wide (All Schools)";

  // --- 1. RESOLVE & EMBED LOGOS ---
  const leftLogoUrl =
    selectedSchool && selectedSchool !== "Division-wide (All Schools)"
      ? getCachedLogoSrc(selectedSchool) ||
        getSchoolLogoUrl(selectedSchool) ||
        swabeLogo
      : swabeLogo;

  const rightLogoUrl =
    getCachedLogoSrc("__SDO__") || getCachedLogoSrc("sdo") || swabeLogo;

  const [leftImg, rightImg] = await Promise.all([
    fetchImageAsBase64(leftLogoUrl),
    fetchImageAsBase64(rightLogoUrl),
  ]);

  // Insert Left School Logo (Anchored at Column A/B, Row 1)
  if (leftImg && leftImg.base64) {
    const leftImageId = workbook.addImage({
      base64: leftImg.base64,
      extension: leftImg.extension === "jpeg" ? "jpeg" : "png",
    });
    worksheet.addImage(leftImageId, {
      tl: { col: 0.3, row: 0.2 },
      ext: { width: 75, height: 75 },
    });
  }

  // Insert Right Division Logo (Anchored at Column Q, Row 1)
  if (rightImg && rightImg.base64) {
    const rightImageId = workbook.addImage({
      base64: rightImg.base64,
      extension: rightImg.extension === "jpeg" ? "jpeg" : "png",
    });
    worksheet.addImage(rightImageId, {
      tl: { col: 16.2, row: 0.2 },
      ext: { width: 75, height: 75 },
    });
  }

  // --- 2. TITLE HEADER ---
  worksheet.mergeCells("A1:R1");
  const r1 = worksheet.getCell("A1");
  r1.value = "DEPARTMENT OF EDUCATION";
  r1.font = { name: "Calibri", size: 14, bold: true };
  r1.alignment = { horizontal: "center", vertical: "middle" };

  worksheet.mergeCells("A2:R2");
  const r2 = worksheet.getCell("A2");
  r2.value = "SCHOOL-BASED IMMUNIZATION";
  r2.font = { name: "Calibri", size: 16, bold: true };
  r2.alignment = { horizontal: "center", vertical: "middle" };

  worksheet.mergeCells("A3:R3");
  const r3 = worksheet.getCell("A3");
  r3.value = formTitle;
  r3.font = { name: "Calibri", size: 12, bold: true };
  r3.alignment = { horizontal: "center", vertical: "middle" };

  worksheet.addRow([]); // Blank row 4

  // --- 3. METADATA SECTION ---
  // School name (D:K) is given ample room so long names don't get cut off.
  // Vaccine vial info starts at col L (MR) and col O (Td), aligned with the
  // "Vaccine Given" table header below (L11:O11).
  const dateStr = vaxDate || metadata.date || new Date().toLocaleDateString("en-US");

  // Expand school name merge to D:K so long school names never get truncated
  worksheet.mergeCells("D5:K5");
  worksheet.mergeCells("D6:K6");
  worksheet.mergeCells("D7:K7");
  worksheet.mergeCells("D8:K8");

  // Row 5
  worksheet.getCell("A5").value = `Region:  ${region}`;
  worksheet.getCell("D5").value = `Name of School:  ${schoolNameStr}`;
  worksheet.getCell("L5").value = `${vax1Label}:`;
  worksheet.getCell("O5").value = `${vax2Label}:`;

  // Row 6
  worksheet.getCell("A6").value = `Province:  ${province || "N/A"}`;
  worksheet.getCell("D6").value = `Section:  ${section}`;
  worksheet.getCell("L6").value = `Received (in vials): ${vax1Received || "______"}`;
  worksheet.getCell("O6").value = `Received (in vials): ${vax2Received || "______"}`;

  // Row 7
  worksheet.getCell("A7").value = `City/Municipality:  ${city || "N/A"}`;
  worksheet.getCell("D7").value = `District/Municipality:  ${district || "N/A"}`;
  worksheet.getCell("L7").value = `Used (in vials): ${vax1Used || "______"}`;
  worksheet.getCell("O7").value = `Used (in vials): ${vax2Used || "______"}`;

  // Row 8
  worksheet.getCell("A8").value = `Barangay:  ${barangay || "N/A"}`;
  worksheet.getCell("D8").value = `Date:  ${dateStr}`;
  worksheet.getCell("L8").value = `Unused (in vials): ${vax1Unused || "______"}`;
  worksheet.getCell("O8").value = `Unused (in vials): ${vax2Unused || "______"}`;

  // Apply row height & formatting
  // Bold the vaccine label cells (col L=12 and O=15)
  for (let r = 5; r <= 8; r++) {
    const row = worksheet.getRow(r);
    row.height = 20;
    for (let c = 1; c <= 18; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "Calibri", size: 10, bold: c === 12 || c === 15 };
      cell.alignment = { vertical: "middle", horizontal: "left" };
    }
  }

  worksheet.addRow([]); // Blank row 9

  // --- 4. SUB-HEADER ---
  worksheet.mergeCells("A10:R10");
  const subHeader = worksheet.getCell("A10");
  subHeader.value = "To be filled out by Local Health Center / Vaccination Team";
  subHeader.font = { name: "Calibri", size: 9, italic: true };
  subHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
  subHeader.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };

  // --- 5. TABLE HEADERS ---
  worksheet.getRow(11).values = [
    "No.",
    "Name (Surname, First Name, MI)",
    "Complete Address",
    "Date of Birth",
    "Age",
    "Sex",
    "Consent Slip", "",
    "History of Allergies",
    "Sick today?", "",
    "Vaccine Given", "", "", "",
    "Deferral",
    "Refusal",
    "Reasons",
  ];

  worksheet.getRow(12).values = [
    "", "", "", "", "", "",
    "Y", "N",
    "",
    "Y", "N",
    vax1Label, "Lot/Batch No.", vax2Label, "Lot/Batch No.",
    "", "", "",
  ];

  // Header merges
  worksheet.mergeCells("A11:A12");
  worksheet.mergeCells("B11:B12");
  worksheet.mergeCells("C11:C12");
  worksheet.mergeCells("D11:D12");
  worksheet.mergeCells("E11:E12");
  worksheet.mergeCells("F11:F12");

  worksheet.mergeCells("G11:H11");
  worksheet.mergeCells("I11:I12");
  worksheet.mergeCells("J11:K11");
  worksheet.mergeCells("L11:O11");

  worksheet.mergeCells("P11:P12");
  worksheet.mergeCells("Q11:Q12");
  worksheet.mergeCells("R11:R12");

  const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6E0B4" } };
  const headerFont = { name: "Calibri", size: 9, bold: true };

  for (let r = 11; r <= 12; r++) {
    const row = worksheet.getRow(r);
    row.height = 22;
    for (let c = 1; c <= 18; c++) {
      const cell = row.getCell(c);
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }
  }

  // --- 6. DATA ROWS ---
  list.forEach((s, index) => {
    const rowValues = [
      s.no || index + 1,
      s.name || `${s.lastName || ""}, ${s.firstName || ""} ${s.middleName || ""}`.trim(),
      s.address || s.completeAddress || "",
      s.dob || s.birthDate || "",
      s.age ?? "",
      s.sex || "",
      s.consentY || (s.consentYes ? "✓" : ""),
      s.consentN || (s.consentNo ? "✓" : ""),
      s.allergies || "",
      s.sickY || (s.sickYes ? "✓" : ""),
      s.sickN || (s.sickNo ? "✓" : ""),
      s.vax1 || s.hpv1Date || s.dose1Date || "",
      s.vax1Lot || s.hpv1Batch || s.dose1Batch || "",
      s.vax2 || s.hpv2Date || s.dose2Date || "",
      s.vax2Lot || s.hpv2Batch || s.dose2Batch || "",
      s.deferral || "",
      s.refusal || "",
      s.reasons || s.remarks || "",
    ];

    const rowObj = worksheet.addRow(rowValues);
    rowObj.height = 20;

    for (let c = 1; c <= 18; c++) {
      const cell = rowObj.getCell(c);
      cell.font = { name: "Calibri", size: 9 };
      cell.alignment = {
        horizontal: c === 2 || c === 3 || c === 18 ? "left" : "center",
        vertical: "middle",
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }
  });

  // Ensure 25 total empty rows minimum
  const minRows = 25;
  if (list.length < minRows) {
    for (let i = list.length + 1; i <= minRows; i++) {
      const emptyRow = worksheet.addRow([i, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
      emptyRow.height = 20;
      for (let c = 1; c <= 18; c++) {
        const cell = emptyRow.getCell(c);
        cell.font = { name: "Calibri", size: 9 };
        cell.alignment = { horizontal: c === 1 || c === 6 ? "center" : "left", vertical: "middle" };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      }
    }
  }

  // --- 7. ADJUST COLUMN WIDTHS ---
  const colWidths = [
    5,  // A: No.
    28, // B: Name
    24, // C: Address
    14, // D: DOB
    6,  // E: Age
    6,  // F: Sex
    5,  // G: Consent Y
    5,  // H: Consent N
    18, // I: Allergies
    5,  // J: Sick Y
    5,  // K: Sick N
    13, // L: Vax 1
    13, // M: Lot 1
    13, // N: Vax 2
    13, // O: Lot 2
    8,  // P: Deferral
    8,  // Q: Refusal
    20, // R: Reasons
  ];

  colWidths.forEach((w, idx) => {
    worksheet.getColumn(idx + 1).width = w;
  });

  // Export process
  const buffer = await workbook.xlsx.writeBuffer();
  const cleanSchool = (schoolNameStr || "School").replace(/[^a-zA-Z0-9]/g, "_");
  const cleanProgram = selectedProgramKey.replace(/[^a-zA-Z0-9]/g, "_");
  saveAs(
    new Blob([buffer]),
    `DepEd_Immunization_${cleanProgram}_${cleanSchool}_${sy}.xlsx`
  );
};