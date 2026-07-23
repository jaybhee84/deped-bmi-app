import React, { useRef, useState, useMemo } from "react";
import {
  QUARTERS,
  SCHOOL_YEARS,
  GRADE_LEVELS,
  calcBMI,
  getBMIStatus,
  getHAZStatus,
} from "../utils/bmi";
import { getStudentIdentifier, gradeFromSection } from "../utils/registry";
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

  const allowedPeriods = QUARTERS.filter((q) => q !== "Baseline");

  // Available sections for the selected grade
  const availableSections = useMemo(() => {
    if (!filterGrade) {
      return [];
    }

    return [
      ...new Set(
        students
          .map((s) => s.section)
          .filter((section) => section && section.startsWith(filterGrade)),
      ),
    ].sort();
  }, [students, filterGrade]);

  // Students in the selected class
  const classStudents = useMemo(() => {
    if (!filterGrade || !filterSection) {
      return [];
    }

    return students.filter(
      (s) =>
        gradeFromSection(s.section) === filterGrade &&
        s.section === filterSection,
    );
  }, [students, filterGrade, filterSection]);

  // ── Download template ─────────────────────────────────────
  function downloadTemplate() {
    const sectionLabel = filterSection || filterGrade || "Class";
    const rows = [
      ["registry_no", "name", "weight", "height"],
      ...classStudents.map((s) => [
        s.registryNo || "—",
        s.name,
        "", // blank for user to fill
        "", // blank for user to fill
      ]),
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
    if (!standardKeys.includes("weight") || !standardKeys.includes("height")) {
      return { rows: [], errors: ["CSV must have weight and height columns."] };
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
        (k) => k.trim().toLowerCase() === "height",
      );
      const nameKey = Object.keys(row).find(
        (k) => k.trim().toLowerCase() === "name",
      );

      const registryNo = row[regKey] ? String(row[regKey]).trim() : null;

      const weightRaw = String(row[weightKey] || "").trim();
      let heightRaw = String(row[heightKey] || "").trim();

      // Height is stored in centimeters. Pasted values may sometimes be in
      // meters (e.g. "1.20") - no school-age child is under 3m tall, so
      // anything that low is treated as meters and converted to cm.
      if (heightRaw !== "") {
        const numHeight = parseFloat(heightRaw);
        if (!isNaN(numHeight) && numHeight <= 3) {
          heightRaw = (numHeight * 100).toFixed(1);
        }
      }

      const weight = weightRaw !== "" ? parseFloat(weightRaw) : null;
      const height = heightRaw !== "" ? parseFloat(heightRaw) : null;

      if (!registryNo) {
        errs.push(`Row ${i + 2}: No registry_no found.`);
        return;
      }
      // Weight and height are optional - only flag as an error if a value
      // was actually provided but isn't a valid positive number.
      if (weightRaw !== "" && (isNaN(weight) || weight <= 0)) {
        errs.push(`Row ${i + 2}: Invalid weight.`);
        return;
      }
      if (heightRaw !== "" && (isNaN(height) || height <= 0)) {
        errs.push(`Row ${i + 2}: Invalid height.`);
        return;
      }

      const match = students.find(
        (s) => registryNo && registryNo !== "—" && s.registryNo === registryNo,
      );

      // Extract metadata from match
      const birthdate = match?.birthdate || "—";
      const sex = match?.sex || "—";
      const age =
        match?.age !== undefined && match?.age !== "" ? match.age : "—";

      // Dynamically map statuses for preview display
      const bmi = weight && height ? calcBMI(weight, height) : null;
      const bmiStatus = bmi
        ? getBMIStatus(bmi, match?.sex, match?.birthdate)
        : null;
      const hazStatus = height
        ? getHAZStatus(height, match?.sex, match?.birthdate)
        : null;

      rows.push({
        registryNo: registryNo || "—",
        name: row[nameKey] || match?.name || "—",
        weight,
        height,
        birthdate,
        sex,
        age,
        bmi,
        bmiStatus,
        hazStatus,
        matched: !!match,
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
            { sy, q: period, date, weight: row.weight, height: row.height },
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
        height_cm: r.height,
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
        📥 CSV Upload (Midline / Endline)
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
          <label className="form-label">Period</label>
          <select
            className="form-select"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
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
          <span className="csv-count-label">learners in class</span>
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
          Select a Grade Level and Section to view the learners in that class.
        </div>
      )}

      {/* Roster list table - Hidden if staging preview is active */}
      {filterGrade &&
        filterSection &&
        classStudents.length > 0 &&
        preview.length === 0 && (
          <div className="csv-class-roster" style={{ marginTop: "16px" }}>
            <h4 style={{ marginBottom: "10px", color: "#334155" }}>
              Learners in Selected Class ({classStudents.length})
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
                    const bmi =
                      weight && height ? calcBMI(weight, height) : null;
                    const bmiStatus = bmi
                      ? getBMIStatus(bmi, student.sex, student.birthdate)
                      : null;
                    const hazStatus = height
                      ? getHAZStatus(height, student.sex, student.birthdate)
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
                          {height ? `${height} cm` : "—"}
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
                      {row.height != null ? `${row.height} cm` : "—"}
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
                          ⚠ Not found
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
