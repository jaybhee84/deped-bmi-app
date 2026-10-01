import React, { useRef, useState, useMemo } from "react";
import {
  QUARTERS,
  SCHOOL_YEARS,
  GRADE_LEVELS,
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  normalizeHeightMeters,
  formatHeightMeters,
  parseRecordNote,
  RECORD_NOTE_META,
} from "../utils/bmi";
import { getStudentIdentifier, gradeFromSection } from "../utils/registry";
import { filterByLearnerScope, useSbfpConfig } from "../utils/sbfpBeneficiary";
import "./CSVUpload.css";
import Papa from "papaparse";

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
  const [sy, setSy] = useState("2026–2027");
  const [period, setPeriod] = useState("Midline");
  const [date, setDate] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [preview, setPreview] = useState([]);
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);

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
          .filter((section) => section && section.startsWith(filterGrade)),
      ),
    ].sort();
  }, [scopedStudents, filterGrade]);

  // Students in the selected class
  const classStudents = useMemo(() => {
    if (!filterGrade || !filterSection) {
      return [];
    }

    return scopedStudents.filter(
      (s) =>
        gradeFromSection(s.section) === filterGrade &&
        s.section === filterSection,
    );
  }, [scopedStudents, filterGrade, filterSection]);

  // ── Download template ─────────────────────────────────────
  function downloadTemplate() {
    const sectionLabel = filterSection || filterGrade || "Class";
    // A learner already noted as Transferred / Not in School this school year
    // (this period, or Midline when preparing Endline) comes prefilled.
    const noteFor = (s) => {
      if (period === "Baseline") return "";
      const periods = period === "Endline" ? ["Endline", "Midline"] : [period];
      for (const q of periods) {
        const rec = s.records?.find((r) => r.sy === sy && r.q === q);
        if (rec?.note) return rec.note;
      }
      return "";
    };
    const rows = [
      // Class name on the first row; the upload skips it.
      [sectionLabel],
      ["registry_no", "name", "weight", "height_m"],
      ...classStudents.map((s) => {
        const note = noteFor(s);
        // Blank for the user to fill, unless the learner has a status note.
        return [s.registryNo || "—", s.name, note, note];
      }),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sectionLabel.replace(/\s/g, "_")}_${period}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Robust CSV Processing with PapaParse ────────────────────
  function parseCSV(text) {
    // The template starts with a class-name row; the column headers are the
    // first line that has registry_no. Older templates have no such row.
    const lines = String(text).replace(/^﻿/, "").split(/\r?\n/);
    const headerIndex = lines.findIndex((line) =>
      line.toLowerCase().includes("registry_no"),
    );
    const rowOffset = Math.max(headerIndex, 0);
    if (headerIndex > 0) text = lines.slice(headerIndex).join("\n");

    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: "greedy",
    });

    if (!parsed.data || !parsed.data.length) {
      return { rows: [], errors: ["File is empty."] };
    }

    const standardKeys = Object.keys(parsed.data[0]).map((h) =>
      h.trim().toLowerCase(),
    );
    const errs = [];

    const hasRegistry = standardKeys.includes("registry_no");

    if (!hasRegistry) {
      return {
        rows: [],
        errors: ["CSV must have a registry_no column. Download the template."],
      };
    }
    if (!standardKeys.includes("weight") || (!standardKeys.includes("height_m") && !standardKeys.includes("height"))) {
      return { rows: [], errors: ["CSV must have weight and height_m columns."] };
    }

    const rows = [];

    parsed.data.forEach((row, i) => {
      const regKey = Object.keys(row).find(
        (k) => k.trim().toLowerCase() === "registry_no",
      );
      const weightKey = Object.keys(row).find(
        (k) => k.trim().toLowerCase() === "weight",
      );
      const heightKey = Object.keys(row).find(
        (k) => ["height_m", "height"].includes(k.trim().toLowerCase()),
      );
      const nameKey = Object.keys(row).find(
        (k) => k.trim().toLowerCase() === "name",
      );

      const registryNo = row[regKey] ? String(row[regKey]).trim() : null;

      const weightRaw = String(row[weightKey] || "").trim();
      const heightRaw = String(row[heightKey] || "").trim();

      // "Transferred" / "Not in School" typed in either cell: the learner is
      // still recorded for the period, with 0 weight and height plus the note.
      const note = parseRecordNote(weightRaw) || parseRecordNote(heightRaw);

      const weight = note ? 0 : weightRaw !== "" ? parseFloat(weightRaw) : null;
      const height = note
        ? 0
        : heightRaw !== ""
          ? normalizeHeightMeters(heightRaw)
          : null;

      if (!registryNo) {
        errs.push(`Row ${i + 2 + rowOffset}: No registry_no found.`);
        return;
      }
      if (note && period === "Baseline") {
        errs.push(
          `Row ${i + 2 + rowOffset}: "${note}" is only accepted for Midline and Endline.`,
        );
        return;
      }
      // Weight and height are optional - only flag as an error if a value
      // was actually provided but isn't a valid positive number.
      if (!note && weightRaw !== "" && (isNaN(weight) || weight <= 0)) {
        errs.push(`Row ${i + 2 + rowOffset}: Invalid weight.`);
        return;
      }
      if (!note && heightRaw !== "" && (isNaN(height) || height <= 0)) {
        errs.push(`Row ${i + 2 + rowOffset}: Invalid height.`);
        return;
      }

      const anyMatch = students.find(
        (s) => registryNo && registryNo !== "—" && s.registryNo === registryNo,
      );
      // With the beneficiaries filter on, other learners are skipped.
      const match =
        anyMatch && scopedStudents.some((s) => s.id === anyMatch.id)
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
        ? getBMIStatus(bmi, match?.sex, match?.birthdate, date)
        : null;
      const hazStatus = height
        ? getHAZStatus(height, match?.sex, match?.birthdate, date)
        : null;

      rows.push({
        registryNo: registryNo || "—",
        name: row[nameKey] || match?.name || "—",
        weight,
        height,
        note,
        birthdate,
        sex,
        age,
        bmi,
        bmiStatus,
        hazStatus,
        matched: !!match,
        notBeneficiary: !!anyMatch && !match,
        studentId: match?.id,
        studentName: match?.name || "—",
      });
    });

    return { rows, errors: errs };
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const { rows, errors } = parseCSV(evt.target.result);
      setPreview(rows);
      setErrors(errors);
      setSaved(false);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleSave() {
    if (!date) {
      setErrors(["Please select a date measured before saving."]);
      return;
    }
    const matched = preview.filter((r) => r.matched);
    if (!matched.length) {
      setErrors([
        "No matching students found. Download the template to get the correct registry numbers.",
      ]);
      return;
    }

    setStudents((prev) =>
      prev.map((s) => {
        const row = matched.find((r) => r.studentId === s.id);
        if (!row) return s;
        const cleaned = s.records.filter(
          (r) => !(r.sy === sy && r.q === period),
        );
        return {
          ...s,
          records: [
            ...cleaned,
            {
              sy,
              q: period,
              date,
              weight: row.weight,
              height: row.height,
              ...(row.note ? { note: row.note } : {}),
            },
          ],
        };
      }),
    );

    if (window.electronAPI?.upsertSQLiteRecords) {
      const payloads = matched.map((r) => ({
        registry_no: r.registryNo,
        school_year: sy,
        period_stage: period,
        date_measured: date,
        weight_kg: r.weight,
        // SQLite keeps its legacy column name, so convert metres at this boundary.
        height_cm: r.height == null ? null : r.height * 100,
      }));
      window.electronAPI.upsertSQLiteRecords(payloads);
    }

    setSaved(true);
    setPreview([]);
    setErrors([]);
    setTimeout(() => {
      setSaved(false);
      setOpen(false);
    }, 3000);
  }

  const matchedCount = preview.filter((r) => r.matched).length;
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
          Upload Beneficiary Measurements
        </h3>
        <button
          className="csv-close-btn"
          onClick={() => {
            setOpen(false);
            setPreview([]);
            setErrors([]);
          }}
        >
          ×
        </button>
      </div>

      <p className="csv-panel-sub">
        <strong>Step 1:</strong> Select the class and download the template
        (prefilled with learner names + registry numbers).
        <br />
        <strong>Step 2:</strong> Fill in the Weight and Height columns in the
        CSV.
        <br />
        <strong>Step 3:</strong> Upload the CSV and save.
        <br />
        For Midline and Endline, type <strong>Transferred</strong> or{" "}
        <strong>Not in School</strong> in the Weight or Height column for a
        learner who could not be measured. They are saved with 0 weight and
        height and that note, and remain SBFP beneficiaries.
      </p>

      {/* Controls */}
      <div className="csv-controls">
        <div className="form-group">
          <label className="form-label">School Year</label>
          <select
            className="form-select"
            value={sy}
            onChange={(e) => setSy(e.target.value)}
          >
            {SCHOOL_YEARS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Learners</label>
          <select
            className="form-select"
            value={learnerScope}
            onChange={(e) => {
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
          <label className="form-label">Period</label>
          <select
            className="form-select"
            value={period}
            onChange={(e) => {
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
          <label className="form-label">Date Measured</label>
          <input
            type="date"
            className="form-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {/* Class selector controls bar */}
      <div
        className="csv-class-selector"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: "12px",
        }}
      >
        <div className="form-group">
          <label className="form-label">Grade Level</label>
          <select
            className="form-select"
            value={filterGrade}
            onChange={(e) => {
              setFilterGrade(e.target.value);
              setFilterSection("");
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
          <label className="form-label">Section / Class</label>
          <select
            className="form-select"
            value={filterSection}
            onChange={(e) => setFilterSection(e.target.value)}
            disabled={!filterGrade}
          >
            <option value="">Select Section</option>
            {availableSections.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
        </div>

        <div className="csv-class-count">
          <span className="csv-count-num">{classStudents.length}</span>
          <span className="csv-count-label">
            {beneficiariesOnly ? "beneficiaries in class" : "learners in class"}
          </span>
        </div>

        <button
          className="btn btn-secondary"
          onClick={downloadTemplate}
          disabled={
            !filterGrade || !filterSection || classStudents.length === 0
          }
        >
          ⬇ Download Template for This Class
        </button>

        <button
          className="btn btn-primary"
          onClick={() => fileRef.current.click()}
          disabled={
            !filterGrade || !filterSection || classStudents.length === 0
          }
        >
          📤 Upload Completed CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={handleFile}
        />
      </div>

      {(!filterGrade || !filterSection) && (
        <div
          style={{
            marginTop: "12px",
            padding: "10px",
            background: "#f8fafc",
            borderRadius: "8px",
            color: "#64748b",
          }}
        >
          Select a Grade Level and Section to view the{" "}
          {beneficiariesOnly ? "SBFP beneficiaries" : "learners"} in that class.
          {beneficiariesOnly &&
            " Beneficiaries are the learners who qualified at this school year's Baseline."}
        </div>
      )}

      {/* Roster list table - Hidden if staging preview is active */}
      {filterGrade &&
        filterSection &&
        classStudents.length > 0 &&
        preview.length === 0 && (
          <div className="csv-class-roster" style={{ marginTop: "16px" }}>
            <h4 style={{ marginBottom: "10px", color: "#334155" }}>
              {beneficiariesOnly ? "SBFP Beneficiaries" : "Learners"} in
              Selected Class ({classStudents.length})
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
                      REGISTRY NO.
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
                    const note = periodRec?.note || null;
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
                          {student.registryNo || "—"}
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
                          {weight || note ? `${weight} kg` : "—"}
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
                          {height || note
                            ? `${formatHeightMeters(height)} m`
                            : "—"}
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
                          {note ? (
                            <LocalBadge label={note} {...RECORD_NOTE_META} />
                          ) : (
                            <LocalBadge
                              label={bmiStatus?.label}
                              color={bmiStatus?.color}
                              bg={bmiStatus?.bg}
                            />
                          )}
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
      {preview.length > 0 && (
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
                    REGISTRY NO.
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
                      {row.note ? (
                        <LocalBadge label={row.note} {...RECORD_NOTE_META} />
                      ) : (
                        <LocalBadge
                          label={row.bmiStatus?.label}
                          color={row.bmiStatus?.color}
                          bg={row.bmiStatus?.bg}
                        />
                      )}
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
                          {row.note ? ` · ${row.note}` : ""}
                        </span>
                      ) : (
                        <span style={{ color: "#ef4444", fontWeight: "600" }}>
                          {row.notBeneficiary
                            ? "⚠ Not an SBFP beneficiary"
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
              onClick={handleSave}
              disabled={matchedCount === 0}
            >
              Save {matchedCount} Record{matchedCount !== 1 ? "s" : ""} as{" "}
              {period}
            </button>
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
