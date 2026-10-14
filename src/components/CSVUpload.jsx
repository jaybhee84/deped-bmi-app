import React, { useRef, useState, useMemo, useEffect } from "react";
import {
  QUARTERS,
  SCHOOL_YEARS,
  GRADE_LEVELS,
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  normalizeHeightMeters,
  formatHeightMeters,
} from "../utils/bmi";
import { gradeFromSection } from "../utils/registry";
import { filterByLearnerScope, useSbfpConfig } from "../utils/sbfpBeneficiary";
import "./CSVUpload.css";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { existingMeasurementDate, mergeMeasurementRows, measurementIdentifier, matchMeasurementLearner } from "../utils/measurementImport";
import { sectionSheetName, workbookRows } from "../utils/measurementWorkbook";
import { createImportRequestGate } from "../utils/importRequestGate";
import { parseMeasurementHeight } from "../utils/measurementInput";

// Each period's template shows the earlier periods for reference, then the
// two columns to fill in. Only the selected period's columns are read back.
const REFERENCE_PERIODS = {
  Baseline: [],
  Midline: ["Baseline"],
  Endline: ["Baseline", "Midline"],
};

// "Midline Weight (kg)" and "midline_weight" both become "midline_weight".
function normalizeHeader(header) {
  return String(header ?? "")
    .toLowerCase()
    .replace(/height\s*\((cm|m)\)/g, "height_$1")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cellText(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
    if ("result" in value) return cellText(value.result);
    if ("text" in value) return cellText(value.text);
    return "";
  }
  return String(value).trim();
}

function normalizeRow(row) {
  const values = {};
  Object.entries(row).forEach(([header, value]) => {
    const key = normalizeHeader(header);
    if (key) values[key] = cellText(value);
  });
  return values;
}

function readCsvRows(text) {
  // v4.0.0 CSV templates include a class title before the header row.
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerIndex = lines.findIndex(line => /registry[_ /]|\blrn\b/i.test(line));
  if (headerIndex > 0) text = lines.slice(headerIndex).join("\n");
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: "greedy" });
  return (parsed.data || []).map((row, i) => ({
    rowNo: i + 2 + Math.max(headerIndex, 0),
    values: normalizeRow(row),
  }));
}

async function readXlsxRows(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbookRows(workbook, cellText, normalizeRow);
}

// Simple Badge component mirroring the one used in BatchEntry layout
function LocalBadge({ label, color, bg }) {
  if (!label) return "—";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: "600",
        color: color || "#334155",
        backgroundColor: bg || "#f1f5f9",
        textAlign: "center",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

export default function CSVUpload({ students, setStudents, open, setOpen }) {
  const fileRef = useRef();
  const importGate = useRef(null);
  if (!importGate.current) importGate.current = createImportRequestGate();
  useEffect(() => {
    return () => importGate.current.invalidate();
  }, [open]);
  function invalidateImport() {
    importGate.current.invalidate();
    setPreview([]);
    setErrors([]);
    setSaved(false);
    setOverwriteCount(null);
  }
  const [sy, setSy] = useState("2026–2027");
  const [period, setPeriod] = useState("Midline");
  const [date, setDate] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [preview, setPreview] = useState([]);
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);
  const [overwriteCount, setOverwriteCount] = useState(null);
  useEffect(() => {
    setOverwriteCount(null);
  }, [preview, sy, period, filterGrade, filterSection, open]);
  const viewOnly = period === "Baseline";
  const existingDate = period === "Midline" || viewOnly
    ? existingMeasurementDate(students, sy, period)
    : "";
  const measurementDate = existingDate || date;

  const [learnerScope, setLearnerScope] = useState("beneficiaries");
  const sbfpConfig = useSbfpConfig();

  // SBFP beneficiaries are measured at Baseline, Midline and Endline; the
  // whole school only at Baseline and Endline.
  const allowedPeriods =
    learnerScope === "all" ? QUARTERS.filter((q) => q !== "Midline") : QUARTERS;

  const beneficiariesOnly = learnerScope === "beneficiaries";

  // Beneficiaries are the learners who qualified at this school year's Baseline.
  const scopedStudents = useMemo(
    () => filterByLearnerScope(students, beneficiariesOnly ? "sbfp" : "all", sy, sbfpConfig),
    [students, beneficiariesOnly, sy, sbfpConfig],
  );

  // Available sections for the selected grade
  const availableSections = useMemo(() => {
    if (!filterGrade) {
      return [];
    }

    return [
      ...new Set(
        scopedStudents
          .map((s) => s.section)
          .filter((section) => section && gradeFromSection(section) === filterGrade),
      ),
    ].sort();
  }, [scopedStudents, filterGrade]);

  // Students in the selected class
  const classStudents = useMemo(() => {
    if (!filterGrade || !filterSection) {
      return [];
    }

    // Boys first, then girls, alphabetical within each. An entire grade is
    // listed section by section, matching the sheets of its template.
    const sexRank = (sex) => {
      const code = String(sex || "").trim().toUpperCase();
      if (code === "M" || code === "MALE") return 0;
      if (code === "F" || code === "FEMALE") return 1;
      return 2;
    };

    return scopedStudents
      .filter(
        (s) =>
          gradeFromSection(s.section) === filterGrade &&
          (filterSection === "__grade__" || s.section === filterSection),
      )
      .sort(
        (a, b) =>
          String(a.section || "").localeCompare(String(b.section || "")) ||
          sexRank(a.sex) - sexRank(b.sex) ||
          String(a.name || "").localeCompare(String(b.name || "")),
      );
  }, [scopedStudents, filterGrade, filterSection]);

  // ── Download template ─────────────────────────────────────
  async function downloadTemplate() {
    if (viewOnly) return;
    const sectionLabel = filterSection === "__grade__" ? filterGrade : filterSection;
    const referencePeriods = REFERENCE_PERIODS[period] || [];
    const lastCol = 3 + (referencePeriods.length + 1) * 2;

    const workbook = new ExcelJS.Workbook();
    const sections = filterSection === "__grade__" ? availableSections : [filterSection];
    const usedNames = new Set();
    for (const section of sections) {
    const sheet = workbook.addWorksheet(sectionSheetName(section, usedNames), {
      views: [{ state: "frozen", xSplit: 3, ySplit: 1 }],
    });

    sheet.addRow([
      "Registry / LRN No",
      "Name",
      "Sex",
      ...[...referencePeriods, period].flatMap((p) => [
        `${p} Weight (kg)`,
        `${p} Height (cm)`,
      ]),
    ]);

    classStudents.filter(s => s.section === section).forEach((s) => {
      // Prefill both reference periods and the editable selected period so
      // repeat downloads include measurements that have already been saved.
      const reference = [...referencePeriods, period].flatMap((p) => {
        const rec = s.records?.find((r) => r.sy === sy && r.q === p);
        const weight = parseFloat(rec?.weight);
        const height = normalizeHeightMeters(rec?.height);
        return [
          weight > 0 ? weight : null,
          height ? Number((height * 100).toFixed(1)) : null,
        ];
      });
      // Registry numbers stay text so Excel does not reformat them.
      // Sex is for reference only; the upload does not read it back.
      const sexCode = String(s.sex || "").trim().toUpperCase();
      const sex =
        sexCode === "M" || sexCode === "MALE"
          ? "Male"
          : sexCode === "F" || sexCode === "FEMALE"
            ? "Female"
            : "";
      sheet.addRow([String(measurementIdentifier(s) || "—"), s.name, sex, ...reference]);
    });

    sheet.getColumn(1).width = 20;
    sheet.getColumn(1).numFmt = "@";
    sheet.getColumn(2).width = 38;
    sheet.getColumn(3).width = 10;
    for (let col = 4; col <= lastCol; col++) sheet.getColumn(col).width = 18;
    for (let col = 5; col <= lastCol; col += 2) sheet.getColumn(col).numFmt = "0.0";

    const border = { style: "thin", color: { argb: "FFCBD5E1" } };
    const solid = (argb) => ({
      type: "pattern",
      pattern: "solid",
      fgColor: { argb },
    });

    sheet.getRow(1).height = 32;
    for (let rowNo = 1; rowNo <= sheet.rowCount; rowNo++) {
      for (let col = 1; col <= lastCol; col++) {
        const cell = sheet.getCell(rowNo, col);
        const isEntry = col > lastCol - 2;
        const isReference = col > 3 && !isEntry;
        cell.border = { top: border, left: border, bottom: border, right: border };
        cell.alignment = {
          vertical: "middle",
          horizontal: col === 2 ? "left" : "center",
          wrapText: rowNo === 1,
        };
        if (rowNo === 1) {
          cell.font = {
            bold: true,
            color: { argb: isEntry ? "FFFFFFFF" : "FF334155" },
          };
          cell.fill = solid(isEntry ? "FF5D9C32" : "FFE2E8F0");
        } else if (isEntry) {
          cell.fill = solid("FFFEFCE8");
        } else if (isReference) {
          cell.font = { color: { argb: "FF64748B" } };
          cell.fill = solid("FFF8FAFC");
        }
      }
    }

    }
    saveAs(
      new Blob([await workbook.xlsx.writeBuffer()]),
      `${sectionLabel.replace(/\s/g, "_")}_${period}_template.xlsx`,
    );
  }

  // ── Read the selected period's columns from the uploaded rows ──
  function parseRows(fileRows) {
    if (!fileRows.length) {
      return { rows: [], errors: ["File is empty."] };
    }

    const keys = [...new Set(fileRows.flatMap(row => Object.keys(row.values)))];
    const errs = [];

    const identifierKeys = ["registry_lrn_no", "registry_lrn_number", "registry_no", "lrn", "lrn_no", "lrn_number"];
    if (!identifierKeys.some(key => keys.includes(key))) {
      return {
        rows: [],
        errors: ["File must have a Registry / LRN No column. Download the template."],
      };
    }

    // Only this period's columns are read; the other periods in the template
    // are reference only. Plain weight/height_m files are still accepted.
    const prefix = period.toLowerCase();
    const isTemplate = keys.some((k) => /^(baseline|midline|endline)_/.test(k));
    const weightKey = [`${prefix}_weight`, ...(isTemplate ? [] : ["weight"])].find(
      (k) => keys.includes(k),
    );
    const heightKey = [
      `${prefix}_height`,
      `${prefix}_height_m`,
      `${prefix}_height_cm`,
      ...(isTemplate ? [] : ["height_cm", "height_m", "height"]),
    ].find((k) => keys.includes(k));

    if (!weightKey || !heightKey) {
      return {
        rows: [],
        errors: [
          `File has no ${period} Weight and ${period} Height columns. Download the ${period} template.`,
        ],
      };
    }

    const rows = [];

    fileRows.forEach(({ rowNo, values: row }) => {
      // Resolve each worksheet's headers independently, including legacy CSV
      // headers, rather than using a column chosen from another sheet.
      const rowKeys = Object.keys(row);
      const rowIsTemplate = rowKeys.some(key => /^(baseline|midline|endline)_/.test(key));
      const rowWeightKey = [`${prefix}_weight`, ...(rowIsTemplate ? [] : ["weight"])].find(key => key in row);
      const rowHeightKey = [`${prefix}_height`, `${prefix}_height_cm`, `${prefix}_height_m`, ...(rowIsTemplate ? [] : ["height_cm", "height_m", "height"])].find(key => key in row);
      const identifierKey = identifierKeys.find(key => key in row);
      if (!rowWeightKey || !rowHeightKey || !identifierKey) {
        errs.push(`Row ${rowNo}: Missing registry or ${period} measurement columns. Use the downloaded template.`);
        return;
      }
      const registryNo = row[identifierKey] || null;

      const weightRaw = row[rowWeightKey] || "";
      const heightRaw = row[rowHeightKey] || "";

      const weight = weightRaw !== "" ? Number(weightRaw) : null;
      const heightUnit = rowHeightKey.endsWith('_cm') ? 'cm' : rowHeightKey.endsWith('_m') ? 'm' : '';
      const height = parseMeasurementHeight(heightRaw, heightUnit);

      if (!registryNo) {
        errs.push(`Row ${rowNo}: No registry / LRN number found.`);
        return;
      }
      // Weight and height are optional - only flag as an error if a value
      // was actually provided but isn't a valid positive number.
      if (weightRaw !== "" && (!Number.isFinite(weight) || weight <= 0)) {
        errs.push(`Row ${rowNo}: Invalid weight.`);
        return;
      }
      if (heightRaw !== "" && (height == null || !Number.isFinite(height) || height < 0.3)) {
        errs.push(`Row ${rowNo}: Invalid height "${heightRaw}". Accepted examples: 110 cm = 1.10 m; 110.3 cm or 1103 = 1.103 m. Converted height must be between 0.30 and 3.00 m.`);
        return;
      }

      const resolved = matchMeasurementLearner(students, classStudents, registryNo, row.name);
      if (resolved.error) {
        errs.push(`Row ${rowNo}: ${resolved.error}`);
        return;
      }
      const anyMatch = resolved.student;
      // With the beneficiaries filter on, other learners are skipped.
      const match =
        anyMatch && classStudents.some((s) => s.id === anyMatch.id)
          ? anyMatch
          : null;

      // Extract metadata from match
      const birthdate = match?.birthdate || "—";
      const sex = match?.sex || "—";
      const age =
        match?.age !== undefined && match?.age !== "" ? match.age : "—";

      // Dynamically map statuses for preview display
      const bmi = weight && height ? calcBMI(weight, height) : null;
      const bmiStatus = bmi
        ? getBMIStatus(bmi, match?.sex, match?.birthdate, measurementDate)
        : null;
      const hazStatus = height
        ? getHAZStatus(height, match?.sex, match?.birthdate, measurementDate)
        : null;

      rows.push({
        rowNo,
        registryNo: registryNo || "—",
        lrn: resolved.lrn,
        name: row.name || match?.name || "—",
        weight,
        height,
        birthdate,
        sex,
        age,
        bmi,
        bmiStatus,
        hazStatus,
        matched: !!match,
        notBeneficiary: !!anyMatch && !scopedStudents.some(s => s.id === anyMatch.id),
        notInSelection: !!anyMatch && !match,
        studentId: match?.id,
        studentName: match?.name || "—",
      });
    });

    const conflicts = new Set();
    rows.forEach(row => {
      if (!row.matched || !row.lrn) return;
      rows.forEach(other => {
        if (!other.matched || !other.lrn || row === other) return;
        if ((row.lrn === other.lrn && row.studentId !== other.studentId) ||
          (row.studentId === other.studentId && row.lrn !== other.lrn)) {
          conflicts.add(row);
          conflicts.add(other);
        }
      });
    });
    conflicts.forEach(row => errs.push(`Row ${row.rowNo}: Conflicting LRN assignment in this file. No conflicting rows will be saved.`));
    return { rows: rows.filter(row => !conflicts.has(row)), errors: errs };
  }

  async function handleFile(e) {
    if (viewOnly) return;
    const file = e.target.files[0];
    if (!file) return;
    const isCurrent = importGate.current.start();
    setPreview([]);
    setErrors([]);
    setSaved(false);
    e.target.value = "";
    try {
      const fileRows = /\.xlsx$/i.test(file.name)
        ? await readXlsxRows(await file.arrayBuffer())
        : readCsvRows(await file.text());
      if (!isCurrent()) return;
      const { rows, errors } = parseRows(fileRows);
      setPreview(rows);
      setErrors(errors);
    } catch (error) {
      if (!isCurrent()) return;
      console.error(error);
      setPreview([]);
      setErrors([
        `Could not read ${file.name}. Upload the Excel template (.xlsx) or a CSV file.`,
      ]);
    }
    setSaved(false);
  }

  function handleSave(confirmed = false) {
    if (viewOnly) return;
    if (!measurementDate) {
      setErrors(["Please select a date measured before saving."]);
      return;
    }
    const matched = preview.filter((r) => r.matched && (r.weight != null || r.height != null || r.lrn));
    if (!matched.length) {
      setErrors([
        "No matching students with measurements found. Blank rows are skipped.",
      ]);
      return;
    }

    const overwriteCount = new Set(matched.filter((row) => {
      const student = students.find((s) => s.id === row.studentId);
      const record = student?.records?.find((r) => r.sy === sy && r.q === period);
      return record && ["weight", "height"].some((key) =>
        row[key] != null && record[key] != null && record[key] !== ""
      );
    }).map((row) => row.studentId)).size;
    if (overwriteCount && !confirmed) {
      setOverwriteCount(overwriteCount);
      return;
    }

    // updateStudents persists the merged records through the SQLite bridge.
    setStudents((prev) => mergeMeasurementRows(prev, matched, sy, period, measurementDate));

    setSaved(true);
    setOverwriteCount(null);
    setPreview([]);
    setErrors([]);
    // Keep the panel open so the user can verify saved records or switch
    // sections. A delayed automatic close could discard the next upload.
  }

  const matchedCount = preview.filter((r) => r.matched && (r.weight != null || r.height != null || r.lrn)).length;
  const unmatchedCount = preview.filter((r) => !r.matched).length;

  if (!open) {
    return (
      <button className="btn-csv-upload" onClick={() => setOpen(true)}>
        📥 CSV Upload (Baseline / Midline / Endline)
      </button>
    );
  }

  return (
    <div className="csv-upload-panel card">
      <div className="csv-panel-header">
        <h3 className="card-title" style={{ margin: 0 }}>
          Upload Measurements
        </h3>
        <button
          className="csv-close-btn"
          aria-label="Close measurement upload"
          onClick={() => {
            invalidateImport();
            setOpen(false);
            setPreview([]);
            setErrors([]);
          }}
        >
          ×
        </button>
      </div>

      {viewOnly ? (
        <p className="csv-empty-state">Baseline is view-only here. Select a class to review its saved measurements. Choose Midline or Endline to download a template and upload measurements.</p>
      ) : <>
      <ol className="csv-steps">
        <li><strong>Choose a class</strong><span>Download its prefilled template.</span></li>
        <li><strong>Enter {period} measurements</strong><span>Fill in weight (kg) and height (cm). For example, 110.3 cm is converted to 1.103 m for BMI. Older templates with heights in meters are also accepted.</span></li>
        <li><strong>Upload and review</strong><span>Check the preview, then save.</span></li>
      </ol>
      <p className="csv-preserve-note">You can upload again to add missing measurements. Blank cells keep your saved data.</p>
      </>}

      {/* Controls */}
      <div className="csv-controls">
        <div className="form-group">
          <label className="form-label" htmlFor="csv-year">School Year</label>
          <select
            className="form-select"
            id="csv-year"
            value={sy}
            onChange={(e) => {
              invalidateImport();
              setSy(e.target.value);
              setPreview([]);
              setErrors([]);
              setDate("");
              setSaved(false);
            }}
          >
            {SCHOOL_YEARS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="csv-learners">Learners</label>
          <select
            className="form-select"
            id="csv-learners"
            value={learnerScope}
            onChange={(e) => {
              invalidateImport();
              const scope = e.target.value;
              setLearnerScope(scope);
              // Midline is for SBFP beneficiaries only.
              if (scope === "all" && period === "Midline") setPeriod("Endline");
              setFilterSection("");
              setPreview([]);
            }}
          >
            <option value="beneficiaries">SBFP Beneficiaries only</option>
            <option value="all">All learners</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="csv-period">Period</label>
          <select
            className="form-select"
            id="csv-period"
            value={period}
            onChange={(e) => {
              invalidateImport();
              setPeriod(e.target.value);
              setPreview([]);
            }}
          >
            {allowedPeriods.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="csv-date">Date Measured {existingDate && <span className="csv-date-badge">Saved date</span>}</label>
          <input
            type="date"
            id="csv-date"
            aria-describedby={existingDate ? "csv-date-note" : undefined}
            className="form-input"
            value={measurementDate}
            disabled={viewOnly || !!existingDate}
            onChange={(e) => {
              invalidateImport();
              setDate(e.target.value);
            }}
          />
        </div>
      </div>
      {existingDate && <p id="csv-date-note" className="csv-date-note">{viewOnly ? `Showing the saved Baseline date for ${sy}.` : `All Midline uploads for ${sy} use this saved measurement date.`}</p>}

      {/* Class selector controls bar */}
      <div className="csv-class-selector">
        <div className="form-group">
          <label className="form-label" htmlFor="csv-grade">Grade Level</label>
          <select
            className="form-select"
            id="csv-grade"
            value={filterGrade}
            onChange={(e) => {
              invalidateImport();
              setFilterGrade(e.target.value);
              setFilterSection("");
              setPreview([]);
            }}
          >
            <option value="">Select Grade Level</option>
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="csv-section">Section / Class</label>
          <select
            className="form-select"
            id="csv-section"
            value={filterSection}
            onChange={(e) => {
              invalidateImport();
              setFilterSection(e.target.value);
              setPreview([]);
            }}
            disabled={!filterGrade}
          >
            <option value="">Select Section</option>
            <option value="__grade__">Entire grade level</option>
            {availableSections.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
        </div>

        <div className="csv-class-count">
          <span className="csv-count-num">{filterSection ? classStudents.length : "—"}</span>
          <span className="csv-count-label">
            {beneficiariesOnly ? "beneficiaries" : "learners"} in {filterSection === "__grade__" ? "grade" : "class"}
          </span>
        </div>

        <div className="csv-template-actions">
        <button
          className="btn csv-download-btn"
          onClick={downloadTemplate}
          data-excel-download="true"
          title={viewOnly ? "Baseline is view-only" : "Download an Excel template with one sheet per selected section"}
          disabled={
            viewOnly || !filterGrade || !filterSection || classStudents.length === 0
          }
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" /></svg>
          Download template
        </button>

        <button
          className="btn btn-primary"
          onClick={() => fileRef.current.click()}
          disabled={
            viewOnly || !filterGrade || !filterSection || classStudents.length === 0
          }
        >
          Upload CSV / Excel
        </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv"
          style={{ display: "none" }}
          onChange={handleFile}
        />
      </div>
      {filterSection === "__grade__" && !viewOnly && <p className="csv-date-note">One Excel workbook, one sheet per section. Upload the completed workbook to save all sections at once. Choose a section above to view its saved measurements.</p>}

      {(!filterGrade || !filterSection) && (
        <div className="csv-empty-state">
          Select a Grade Level and Section to view the{" "}
          {beneficiariesOnly ? "SBFP beneficiaries" : "learners"} in that class.
          {beneficiariesOnly &&
            " Beneficiaries are the learners who qualified at this school year's Baseline."}
        </div>
      )}
      {filterGrade && filterSection && classStudents.length === 0 && (
        <div className="csv-empty-state">No {beneficiariesOnly ? "SBFP beneficiaries" : "learners"} found in this class for {sy}. {beneficiariesOnly ? "Try All learners or check the Baseline records." : "Choose another class or school year."}</div>
      )}

      {/* Roster list table - Hidden if staging preview is active */}
      {filterGrade &&
        filterSection &&
        classStudents.length > 0 &&
        preview.length === 0 && (
          <div className="csv-class-roster" style={{ marginTop: "16px" }}>
            <h4 style={{ marginBottom: "10px", color: "#334155" }}>
              {beneficiariesOnly ? "SBFP Beneficiaries" : "Learners"} in
              {filterSection === "__grade__" ? `${filterGrade} — All Sections` : filterSection} ({classStudents.length})
            </h4>
            <div
              style={{
                maxHeight: "450px",
                overflow: "auto",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                background: "#fff",
              }}
            >
              <table
                className="data-table"
                style={{
                  display: "table",
                  borderCollapse: "collapse",
                  tableLayout: "fixed",
                  width: "1450px",
                  minWidth: "1450px",
                  margin: 0,
                }}
              >
                <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                  <tr style={{ background: "#5D9C32" }}>
                    <th
                      style={{
                        display: "table-cell",
                        width: "40px",
                        color: "#fff",
                        padding: "10px 4px",
                        fontSize: "12px",
                        textAlign: "center",
                        textTransform: "uppercase",
                      }}
                    >
                      #
                    </th>
                    <th
                      style={{
                        display: "table-cell",
                        width: "180px",
                        color: "#fff",
                        padding: "10px 8px",
                        fontSize: "12px",
                        textAlign: "center",
                        textTransform: "uppercase",
                      }}
                    >
                      REGISTRY / LRN NO.
                    </th>
                    <th
                      style={{
                        display: "table-cell",
                        width: "300px",
                        color: "#fff",
                        padding: "10px 8px",
                        fontSize: "12px",
                        textAlign: "left",
                        textTransform: "uppercase",
                      }}
                    >
                      NAME
                    </th>
                    <th
                      style={{
                        display: "table-cell",
                        width: "120px",
                        color: "#fff",
                        padding: "10px 8px",
                        fontSize: "12px",
                        textAlign: "center",
                        textTransform: "uppercase",
                      }}
                    >
                      BIRTHDATE
                    </th>
                    <th
                      style={{
                        display: "table-cell",
                        width: "70px",
                        color: "#fff",
                        padding: "10px 4px",
                        fontSize: "12px",
                        textAlign: "center",
                        textTransform: "uppercase",
                      }}
                    >
                      AGE
                    </th>
                    <th
                      style={{
                        display: "table-cell",
                        width: "70px",
                        color: "#fff",
                        padding: "10px 4px",
                        fontSize: "12px",
                        textAlign: "center",
                        textTransform: "uppercase",
                      }}
                    >
                      SEX
                    </th>
                    <th
                      style={{
                        display: "table-cell",
                        width: "70px",
                        color: "#fff",
                        padding: "10px 4px",
                        fontSize: "12px",
                        textAlign: "center",
                        textTransform: "uppercase",
                      }}
                    >
                      WEIGHT
                    </th>
                    <th
                      style={{
                        display: "table-cell",
                        width: "70px",
                        color: "#fff",
                        padding: "10px 4px",
                        fontSize: "12px",
                        textAlign: "center",
                        textTransform: "uppercase",
                      }}
                    >
                      HEIGHT
                    </th>
                    <th
                      style={{
                        display: "table-cell",
                        width: "70px",
                        color: "#fff",
                        padding: "10px 4px",
                        fontSize: "12px",
                        textAlign: "center",
                        textTransform: "uppercase",
                      }}
                    >
                      BMI
                    </th>
                    <th
                      style={{
                        display: "table-cell",
                        width: "300px",
                        color: "#fff",
                        padding: "10px 8px",
                        fontSize: "12px",
                        textAlign: "center",
                        textTransform: "uppercase",
                      }}
                    >
                      NUTRITIONAL STATUS
                    </th>
                    <th
                      style={{
                        display: "table-cell",
                        width: "160px",
                        color: "#fff",
                        padding: "10px 8px",
                        fontSize: "12px",
                        textAlign: "center",
                        textTransform: "uppercase",
                      }}
                    >
                      HFA STATUS
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {classStudents.map((student, index) => {
                    const bdate = student.birthdate || "—";
                    const sex = student.sex || "—";
                    const age =
                      student.age !== undefined && student.age !== ""
                        ? student.age
                        : "—";
                    const periodRec = student.records?.find(
                      (r) => r.sy === sy && r.q === period,
                    );
                    const weight = periodRec ? periodRec.weight : "";
                    const height = periodRec ? periodRec.height : "";
                    const bmi =
                      weight && height ? calcBMI(weight, height) : null;
                    const bmiStatus = bmi
                      ? getBMIStatus(
                          bmi,
                          student.sex,
                          student.birthdate,
                          periodRec?.date,
                        )
                      : null;
                    const hazStatus = height
                      ? getHAZStatus(
                          height,
                          student.sex,
                          student.birthdate,
                          periodRec?.date,
                        )
                      : null;

                    return (
                      <tr
                        key={student.id}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          background: index % 2 === 0 ? "#ffffff" : "#f8fafc",
                        }}
                      >
                        <td
                          style={{
                            display: "table-cell",
                            padding: "8px 4px",
                            textAlign: "center",
                            fontSize: "13px",
                            color: "#64748b",
                          }}
                        >
                          {index + 1}
                        </td>
                        <td
                          style={{
                            display: "table-cell",
                            padding: "8px",
                            textAlign: "center",
                            fontSize: "13px",
                            fontFamily: "monospace",
                          }}
                        >
                          {measurementIdentifier(student) || "—"}
                        </td>
                        <td
                          style={{
                            display: "table-cell",
                            padding: "8px",
                            textAlign: "left",
                            fontSize: "13px",
                            fontWeight: "600",
                            color: "#1e293b",
                          }}
                        >
                          {student.name}
                        </td>
                        <td
                          style={{
                            display: "table-cell",
                            padding: "8px",
                            textAlign: "center",
                            fontSize: "13px",
                          }}
                        >
                          {bdate}
                        </td>
                        <td
                          style={{
                            display: "table-cell",
                            padding: "8px 4px",
                            textAlign: "center",
                            fontSize: "13px",
                          }}
                        >
                          {age}
                        </td>
                        <td
                          style={{
                            display: "table-cell",
                            padding: "8px 4px",
                            textAlign: "center",
                            fontSize: "13px",
                          }}
                        >
                          {sex}
                        </td>
                        <td
                          style={{
                            display: "table-cell",
                            padding: "8px 4px",
                            textAlign: "center",
                            fontSize: "13px",
                            fontWeight: "500",
                          }}
                        >
                          {weight ? `${weight} kg` : "—"}
                        </td>
                        <td
                          style={{
                            display: "table-cell",
                            padding: "8px 4px",
                            textAlign: "center",
                            fontSize: "13px",
                            fontWeight: "500",
                          }}
                        >
                          {height ? `${formatHeightMeters(height)} m` : "—"}
                        </td>
                        <td
                          style={{
                            display: "table-cell",
                            padding: "8px 4px",
                            textAlign: "center",
                            fontSize: "13px",
                          }}
                        >
                          {bmi ? bmi.toFixed(2) : "—"}
                        </td>
                        <td style={{ display: "table-cell", padding: "8px" }}>
                          <LocalBadge
                            label={bmiStatus?.label}
                            color={bmiStatus?.color}
                            bg={bmiStatus?.bg}
                          />
                        </td>
                        <td style={{ display: "table-cell", padding: "8px" }}>
                          <LocalBadge
                            label={hazStatus?.label}
                            color={hazStatus?.color}
                            bg={hazStatus?.bg}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {errors.length > 0 && (
        <div className="csv-errors" style={{ marginTop: "12px" }}>
          {errors.map((e, i) => (
            <div key={i} className="csv-error-row">
              ⚠ {e}
            </div>
          ))}
        </div>
      )}

      {/* Preview table - Structure perfectly preserved identical to layout before upload */}
      {!viewOnly && preview.length > 0 && (
        <div className="csv-preview" style={{ marginTop: "16px" }}>
          <div className="csv-preview-header" style={{ marginBottom: "10px" }}>
            <span
              className="csv-match-count matched"
              style={{
                marginRight: "10px",
                fontWeight: "bold",
                color: "#5D9C32",
              }}
            >
              ✓ {matchedCount} matched
            </span>
            {unmatchedCount > 0 && (
              <span
                className="csv-match-count unmatched"
                style={{ fontWeight: "bold", color: "#ef4444" }}
              >
                ⚠ {unmatchedCount} unmatched (skipped)
              </span>
            )}
          </div>

          <div
            style={{
              maxHeight: "400px",
              overflow: "auto",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              background: "#fff",
            }}
          >
            <table
              className="data-table"
              style={{
                display: "table",
                borderCollapse: "collapse",
                tableLayout: "fixed",
                width: "1630px",
                minWidth: "1630px",
                margin: 0,
              }}
            >
              <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                <tr style={{ background: "#5D9C32" }}>
                  <th
                    style={{
                      display: "table-cell",
                      width: "40px",
                      color: "#fff",
                      padding: "10px 4px",
                      fontSize: "12px",
                      textAlign: "center",
                      textTransform: "uppercase",
                    }}
                  >
                    #
                  </th>
                  <th
                    style={{
                      display: "table-cell",
                      width: "180px",
                      color: "#fff",
                      padding: "10px 8px",
                      fontSize: "12px",
                      textAlign: "center",
                      textTransform: "uppercase",
                    }}
                  >
                    REGISTRY / LRN NO.
                  </th>
                  <th
                    style={{
                      display: "table-cell",
                      width: "300px",
                      color: "#fff",
                      padding: "10px 8px",
                      fontSize: "12px",
                      textAlign: "left",
                      textTransform: "uppercase",
                    }}
                  >
                    NAME
                  </th>
                  <th
                    style={{
                      display: "table-cell",
                      width: "120px",
                      color: "#fff",
                      padding: "10px 8px",
                      fontSize: "12px",
                      textAlign: "center",
                      textTransform: "uppercase",
                    }}
                  >
                    BIRTHDATE
                  </th>
                  <th
                    style={{
                      display: "table-cell",
                      width: "70px",
                      color: "#fff",
                      padding: "10px 4px",
                      fontSize: "12px",
                      textAlign: "center",
                      textTransform: "uppercase",
                    }}
                  >
                    AGE
                  </th>
                  <th
                    style={{
                      display: "table-cell",
                      width: "70px",
                      color: "#fff",
                      padding: "10px 4px",
                      fontSize: "12px",
                      textAlign: "center",
                      textTransform: "uppercase",
                    }}
                  >
                    SEX
                  </th>
                  <th
                    style={{
                      display: "table-cell",
                      width: "70px",
                      color: "#fff",
                      padding: "10px 4px",
                      fontSize: "12px",
                      textAlign: "center",
                      textTransform: "uppercase",
                    }}
                  >
                    WEIGHT
                  </th>
                  <th
                    style={{
                      display: "table-cell",
                      width: "70px",
                      color: "#fff",
                      padding: "10px 4px",
                      fontSize: "12px",
                      textAlign: "center",
                      textTransform: "uppercase",
                    }}
                  >
                    HEIGHT
                  </th>
                  <th
                    style={{
                      display: "table-cell",
                      width: "70px",
                      color: "#fff",
                      padding: "10px 4px",
                      fontSize: "12px",
                      textAlign: "center",
                      textTransform: "uppercase",
                    }}
                  >
                    BMI
                  </th>
                  <th
                    style={{
                      display: "table-cell",
                      width: "300px",
                      color: "#fff",
                      padding: "10px 8px",
                      fontSize: "12px",
                      textAlign: "center",
                      textTransform: "uppercase",
                    }}
                  >
                    NUTRITIONAL STATUS
                  </th>
                  <th
                    style={{
                      display: "table-cell",
                      width: "160px",
                      color: "#fff",
                      padding: "10px 8px",
                      fontSize: "12px",
                      textAlign: "center",
                      textTransform: "uppercase",
                    }}
                  >
                    HFA STATUS
                  </th>
                  <th
                    style={{
                      display: "table-cell",
                      width: "180px",
                      color: "#fff",
                      padding: "10px 8px",
                      fontSize: "12px",
                      textAlign: "center",
                      textTransform: "uppercase",
                    }}
                  >
                    ACTION
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      background: i % 2 === 0 ? "#ffffff" : "#f8fafc",
                      opacity: row.matched ? 1 : 0.45,
                    }}
                  >
                    <td
                      style={{
                        display: "table-cell",
                        padding: "8px 4px",
                        textAlign: "center",
                        fontSize: "13px",
                        color: "#64748b",
                      }}
                    >
                      {i + 1}
                    </td>
                    <td
                      style={{
                        display: "table-cell",
                        padding: "8px",
                        textAlign: "center",
                        fontSize: "13px",
                        fontFamily: "monospace",
                      }}
                    >
                      {row.registryNo}
                    </td>
                    <td
                      style={{
                        display: "table-cell",
                        padding: "8px",
                        textAlign: "left",
                        fontSize: "13px",
                        fontWeight: "600",
                        color: "#1e293b",
                      }}
                    >
                      {row.studentName}
                    </td>
                    <td
                      style={{
                        display: "table-cell",
                        padding: "8px",
                        textAlign: "center",
                        fontSize: "13px",
                      }}
                    >
                      {row.birthdate}
                    </td>
                    <td
                      style={{
                        display: "table-cell",
                        padding: "8px 4px",
                        textAlign: "center",
                        fontSize: "13px",
                      }}
                    >
                      {row.age}
                    </td>
                    <td
                      style={{
                        display: "table-cell",
                        padding: "8px 4px",
                        textAlign: "center",
                        fontSize: "13px",
                      }}
                    >
                      {row.sex}
                    </td>
                    <td
                      style={{
                        display: "table-cell",
                        padding: "8px 4px",
                        textAlign: "center",
                        fontSize: "13px",
                        fontWeight: "500",
                      }}
                    >
                      {row.weight != null ? `${row.weight} kg` : "—"}
                    </td>
                    <td
                      style={{
                        display: "table-cell",
                        padding: "8px 4px",
                        textAlign: "center",
                        fontSize: "13px",
                        fontWeight: "500",
                      }}
                    >
                      {row.height != null ? `${formatHeightMeters(row.height)} m` : "—"}
                    </td>
                    <td
                      style={{
                        display: "table-cell",
                        padding: "8px 4px",
                        textAlign: "center",
                        fontSize: "13px",
                      }}
                    >
                      {row.bmi ? row.bmi.toFixed(2) : "—"}
                    </td>
                    <td style={{ display: "table-cell", padding: "8px" }}>
                      <LocalBadge
                            label={row.bmiStatus?.label}
                            color={row.bmiStatus?.color}
                            bg={row.bmiStatus?.bg}
                      />
                    </td>
                    <td style={{ display: "table-cell", padding: "8px" }}>
                      <LocalBadge
                        label={row.hazStatus?.label}
                        color={row.hazStatus?.color}
                        bg={row.hazStatus?.bg}
                      />
                    </td>
                    <td
                      style={{
                        display: "table-cell",
                        padding: "8px",
                        textAlign: "center",
                        fontSize: "12px",
                      }}
                    >
                      {row.matched ? (
                        <span style={{ color: "#5D9C32", fontWeight: "600" }}>
                          ✓ Will save as {period}
                        </span>
                      ) : (
                        <span style={{ color: "#ef4444", fontWeight: "600" }}>
                          {row.notBeneficiary
                            ? "⚠ Not an SBFP beneficiary"
                            : row.notInSelection ? "Outside selected class / grade"
                            : "⚠ Not found"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action Row */}
          <div className="csv-save-row" style={{ marginTop: "12px" }}>
            <button
              className="btn btn-primary"
              onClick={() => handleSave()}
              disabled={matchedCount === 0}
            >
              Save {matchedCount} Record{matchedCount !== 1 ? "s" : ""} as{" "}
              {period}
            </button>
            {overwriteCount != null && (
              <div className="csv-overwrite-confirm" role="alert" aria-live="polite">
                <p>Overwrite saved {period} measurements for {overwriteCount} learner{overwriteCount === 1 ? "" : "s"} in {sy}? Uploaded values replace saved measurements. Blank cells keep saved values. BMI and nutritional status will be recalculated.</p>
                <div className="csv-overwrite-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setOverwriteCount(null)}>Cancel</button>
                  <button type="button" className="btn btn-primary" onClick={() => handleSave(true)}>Overwrite and save</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {saved && (
        <div style={{ marginTop: "12px" }}>
          <span
            className="save-confirm"
            style={{ color: "#5D9C32", fontWeight: "600" }}
          >
            ✓ Records saved successfully!
          </span>
        </div>
      )}
    </div>
  );
}
