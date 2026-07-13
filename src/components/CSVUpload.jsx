import React, { useRef, useState, useMemo } from "react";
import { QUARTERS, SCHOOL_YEARS, GRADE_LEVELS } from "../utils/bmi";
import { getStudentIdentifier, gradeFromSection } from "../utils/registry";
import "./CSVUpload.css";
import Papa from "papaparse";

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
      ["registry_no", "lrn", "name", "weight", "height"],
      ...classStudents.map((s) => [
        s.registryNo || "—",
        s.lrn || "—",
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
  console.log("CLASS STUDENTS", classStudents);

  // ── Parse uploaded CSV ────────────────────────────────────
  function parseCSV(text) {
    const lines = text.trim().split("\n").filter(Boolean);
    if (!lines.length) return { rows: [], errors: ["File is empty."] };
    const headers = lines[0]
      .split(",")
      .map((h) => h.trim().toLowerCase().replace(/"/g, ""));
    const errs = [];

    const hasRegistry = headers.includes("registry_no");
    const hasLRN = headers.includes("lrn");
    if (!hasRegistry && !hasLRN) {
      return {
        rows: [],
        errors: [
          "CSV must have a registry_no or lrn column. Download the template.",
        ],
      };
    }
    if (!headers.includes("weight") || !headers.includes("height")) {
      return { rows: [], errors: ["CSV must have weight and height columns."] };
    }

    const idx = (h) => headers.indexOf(h);
    const rows = [];

    lines.slice(1).forEach((line, i) => {
      const cols = line.split(",").map((c) => c.trim().replace(/"/g, ""));
      const registryNo = hasRegistry ? cols[idx("registry_no")]?.trim() : null;
      const lrn = hasLRN ? cols[idx("lrn")]?.trim() : null;
      const weight = parseFloat(cols[idx("weight")]);
      const height = parseFloat(cols[idx("height")]);

      if (!registryNo && !lrn) {
        errs.push(`Row ${i + 2}: No registry_no or lrn.`);
        return;
      }
      if (isNaN(weight) || weight <= 0) {
        errs.push(`Row ${i + 2}: Invalid weight.`);
        return;
      }
      if (isNaN(height) || height <= 0) {
        errs.push(`Row ${i + 2}: Invalid height.`);
        return;
      }

      // Match student — try registryNo first, then LRN
      const match = students.find(
        (s) =>
          (registryNo && registryNo !== "—" && s.registryNo === registryNo) ||
          (lrn && lrn !== "—" && s.lrn === lrn),
      );

      rows.push({
        registryNo: registryNo || "—",
        lrn: lrn || "—",
        name: cols[headers.indexOf("name")] || match?.name || "—",
        weight,
        height,
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

      {/* Class selector */}
      <div className="csv-class-selector">
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

      {filterGrade && filterSection && classStudents.length > 0 && (
        <div className="csv-class-roster" style={{ marginTop: "16px" }}>
          <h4>Learners in Selected Class ({classStudents.length})</h4>

          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Registry No.</th>
                <th>LRN</th>
                <th>Name</th>
              </tr>
            </thead>

            <tbody>
              {classStudents.map((student, index) => (
                <tr key={student.id}>
                  <td>{index + 1}</td>
                  <td>{student.registryNo || "—"}</td>
                  <td>{student.lrn || "—"}</td>
                  <td>{student.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload area */}
      <div className="csv-drop-zone" onClick={() => fileRef.current.click()}>
        <div className="csv-drop-icon">📄</div>
        <div className="csv-drop-text">Click to upload completed CSV</div>
        <div className="csv-drop-sub">
          Matches learners by Registry Number or LRN
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={handleFile}
        />
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="csv-errors">
          {errors.map((e, i) => (
            <div key={i} className="csv-error-row">
              ⚠ {e}
            </div>
          ))}
        </div>
      )}

      {/* Preview table */}
      {preview.length > 0 && (
        <div className="csv-preview">
          <div className="csv-preview-header">
            <span className="csv-match-count matched">
              ✓ {matchedCount} matched
            </span>
            {unmatchedCount > 0 && (
              <span className="csv-match-count unmatched">
                ⚠ {unmatchedCount} unmatched (skipped)
              </span>
            )}
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Registry No.</th>
                <th>LRN</th>
                <th>Name</th>
                <th>Weight</th>
                <th>Height</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} style={{ opacity: row.matched ? 1 : 0.45 }}>
                  <td>
                    <code style={{ fontSize: 11 }}>{row.registryNo}</code>
                  </td>
                  <td>{row.lrn}</td>
                  <td>{row.studentName}</td>
                  <td>{row.weight} kg</td>
                  <td>{row.height} cm</td>
                  <td>
                    {row.matched ? (
                      <span className="csv-status-ok">
                        ✓ Will save as {period}
                      </span>
                    ) : (
                      <span className="csv-status-skip">⚠ Not found</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="csv-save-row">
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={matchedCount === 0}
            >
              Save {matchedCount} Record{matchedCount !== 1 ? "s" : ""} as{" "}
              {period}
            </button>
            {saved && <span className="save-confirm">✓ Records saved!</span>}
          </div>
        </div>
      )}
    </div>
  );
}
