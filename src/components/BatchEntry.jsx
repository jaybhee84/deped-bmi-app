import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  ageInYears,
  SCHOOL_YEARS,
  GRADE_LEVELS,
  SESSIONS,
} from "../utils/bmi";
import Badge from "./Badge";
import "./BatchEntry.css";
import { generateRegistryNumbers } from "../utils/registry";
import Papa from "papaparse";
import CSVUpload from "./CSVUpload";

// Tapping into the context tunnel up one directory level
import { useSchoolScope } from "../context/SchoolContext";

const STORAGE_KEY = "deped_bmi_teachers";

function loadSavedTeachers() {
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    return r ? JSON.parse(r) : {};
  } catch {
    return {};
  }
}

function saveTeachersToStorage(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

function emptyRow() {
  return {
    lrn: "",
    name: "",
    birthdate: "",
    age: "",
    sex: "M",
    weight: "",
    height: "",
  };
}

// Fixed function structure alignment
function buildSectionLabel(gradeLevel, teacherName, session) {
  const t = teacherName.trim() || "Unknown";
  return gradeLevel === "Kinder"
    ? `Kinder - ${t} - ${session}`
    : `${gradeLevel} - ${t}`;
}

function downloadCsvTemplate() {
  const headers = [["lrn", "name", "birthdate", "sex", "weight", "height"]];
  const csvContent = headers.map((row) => row.join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "Baseline_Entry_Template.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function BatchEntry({ students, setStudents, currentUser }) {
  const fileInputRef = useRef(null);

  // Pull data out of the shared global tunnel
  const { school, loading: contextLoading } = useSchoolScope();

  const [gradeLevel, setGradeLevel] = useState("Kinder");
  const [teacherName, setTeacherName] = useState("");
  const [session, setSession] = useState("Morning");
  const [sy, setSy] = useState("2026–2027");

  // Period dropdown removed; hardcoded strictly to Baseline entry point
  const quarter = "Baseline";

  const [date, setDate] = useState("");
  const [rows, setRows] = useState([emptyRow()]);
  const [saved, setSaved] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);

  const [savedTeachers, setSavedTeachers] = useState(loadSavedTeachers);
  const teacherSuggestions = savedTeachers[gradeLevel] || [];
  const sectionLabel = buildSectionLabel(gradeLevel, teacherName, session);
  const canUpload = gradeLevel.trim() && teacherName.trim();

  const [schoolConfigured, setSchoolConfigured] = useState(false);

  // Reactively verify initialization using ONLY the school_id source of truth
  useEffect(() => {
    const isConfigured = !!school?.school_id?.toString().trim();
    setSchoolConfigured(isConfigured);
  }, [school]);

  const schoolName = school?.school_name || school?.name || "Unknown School";
  const verifiedSchoolId = school?.school_id || "";

  function handleCsvUpload(event) {
    if (!teacherName.trim()) {
      alert("Please enter the Teacher Name first.");
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const importedRows = results.data.map((row) => {
          let birthdate = "";
          if (row.birthdate) {
            const dateObj = new Date(row.birthdate);
            if (!isNaN(dateObj.getTime())) {
              birthdate = dateObj.toISOString().split("T")[0];
            }
          }

          let sex = "M";
          const rawSex = row.sex?.trim().toUpperCase() || "";
          if (rawSex.startsWith("F")) {
            sex = "F";
          } else if (rawSex.startsWith("M")) {
            sex = "M";
          }

          const weight = row.weight
            ? row.weight.toString().replace(/[^0-9.]/g, "")
            : "";
          const height = row.height
            ? row.height.toString().replace(/[^0-9.]/g, "")
            : "";

          return {
            lrn: row.lrn?.trim() || "",
            name: row.name?.trim() || "",
            birthdate,
            age: birthdate ? ageInYears(birthdate) : "",
            weight,
            height,
            sex,
          };
        });
        setRows(importedRows);
        alert(`${importedRows.length} students imported successfully.`);
      },
      error: (err) => {
        console.error(err);
        alert("Failed to import CSV.");
      },
    });

    event.target.value = "";
  }

  function handleTeacherBlur() {
    const name = teacherName.trim();
    if (!name) return;
    setSavedTeachers((prev) => {
      const existing = prev[gradeLevel] || [];
      if (existing.includes(name)) return prev;
      const updated = { ...prev, [gradeLevel]: [...existing, name] };
      saveTeachersToStorage(updated);
      return updated;
    });
  }

  function removeTeacher(grade, name) {
    setSavedTeachers((prev) => {
      const updated = {
        ...prev,
        [grade]: (prev[grade] || []).filter((n) => n !== name),
      };
      saveTeachersToStorage(updated);
      return updated;
    });
  }

  const updateRow = useCallback((i, field, value) => {
    setRows((prev) =>
      prev.map((r, j) => {
        if (j !== i) return r;
        const updated = { ...r, [field]: value };
        if (field === "birthdate") updated.age = ageInYears(value);
        return updated;
      }),
    );
  }, []);

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (i) => setRows((prev) => prev.filter((_, j) => j !== i));

  function saveAll() {
    if (!schoolConfigured) {
      alert(
        "School setup is required.\n\nPlease complete the configuration setup flow before adding learners.",
      );
      return;
    }

    const valid = rows.filter((r) => r.name.trim() && r.weight && r.height);
    if (!valid.length) return;

    const needsRegistry = valid.filter((r) => !r.lrn.trim());
    const registryNums = generateRegistryNumbers(
      sy,
      gradeLevel,
      schoolName,
      needsRegistry.length,
    );
    let regIdx = 0;

    setStudents((prev) => {
      const updated = [...prev];
      valid.forEach((row) => {
        const newRec = {
          sy,
          q: quarter,
          date,
          weight: parseFloat(row.weight),
          height: parseFloat(row.height),
        };
        const existing = row.lrn.trim()
          ? updated.find((s) => s.lrn === row.lrn.trim())
          : null;

        if (existing) {
          const hasSamePeriod = existing.records.some(
            (r) => r.sy === sy && r.q === quarter,
          );
          if (hasSamePeriod) {
            existing.records = existing.records.map((r) =>
              r.sy === sy && r.q === quarter ? newRec : r,
            );
          } else {
            existing.records = [...existing.records, newRec];
          }
        } else {
          const registryNo = row.lrn.trim()
            ? undefined
            : registryNums[regIdx++];

          updated.push({
            id: Date.now() + Math.random(),
            lrn: row.lrn.trim() || "—",
            registryNo: registryNo || null,
            name: row.name,
            birthdate: row.birthdate,
            age: typeof row.age === "number" ? row.age : parseInt(row.age) || 0,
            sex: row.sex,
            section: sectionLabel,
            parentConsent: "N",
            member4ps: "N",
            schoolId: verifiedSchoolId,
            schoolName: schoolName,
            records: [newRec],
          });
        }
      });
      return updated;
    });

    handleTeacherBlur();
    setSaved(true);
    setRows([emptyRow()]);
    setTimeout(() => setSaved(false), 3500);

    if (window.electronAPI?.forceRefocusWindow) {
      window.electronAPI.forceRefocusWindow();
    }
  }

  if (contextLoading) {
    return (
      <div className="page" style={{ padding: "20px", color: "#666" }}>
        Resolving workspace context parameters...
      </div>
    );
  }

  return (
    <div
      className="page"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: "20px",
        overflowY: "auto",
      }}
    >
      <h1 className="page-title">Baseline Entry</h1>
      <p className="page-sub" style={{ marginBottom: "12px" }}>
        Enter measurements for an entire class at once (School:{" "}
        <strong>{schoolName}</strong>)
      </p>

      <div
        className="card"
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "16px",
          marginBottom: "24px",
        }}
      >
        {/* UPPER CONTROLS GRID */}
        <div className="batch-class-box" style={{ marginBottom: "12px" }}>
          <div className="batch-class-title">Class / Section Setup</div>

          <div
            className="batch-header-grid"
            style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
          >
            <div className="form-group">
              <label className="form-label">Grade Level</label>
              <select
                className="form-select full-width"
                value={gradeLevel}
                onChange={(e) => {
                  setGradeLevel(e.target.value);
                  setTeacherName("");
                }}
              >
                {GRADE_LEVELS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </div>

            <div className="form-group teacher-group">
              <label className="form-label">
                Teacher Name<span className="label-hint"> (auto-saved)</span>
              </label>
              <input
                className="form-input"
                placeholder="e.g. Mrs. Santos"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                onBlur={handleTeacherBlur}
                list={`teacher-list-${gradeLevel}`}
              />
              <datalist id={`teacher-list-${gradeLevel}`}>
                {teacherSuggestions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>

            {gradeLevel === "Kinder" && (
              <div className="form-group">
                <label className="form-label">Session</label>
                <select
                  className="form-select full-width"
                  value={session}
                  onChange={(e) => setSession(e.target.value)}
                >
                  {SESSIONS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">School Year</label>
              <select
                className="form-select full-width"
                value={sy}
                onChange={(e) => setSy(e.target.value)}
              >
                {SCHOOL_YEARS.map((s) => (
                  <option key={s}>{s}</option>
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

          {teacherSuggestions.length > 0 && (
            <div className="teacher-chips-row">
              <span className="teacher-chips-label">Saved:</span>
              <div className="teacher-chips">
                {teacherSuggestions.map((t) => (
                  <span
                    key={t}
                    className={`teacher-chip ${teacherName === t ? "active" : ""}`}
                    onClick={() => setTeacherName(t)}
                  >
                    {t}
                    <button
                      className="chip-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTeacher(gradeLevel, t);
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="section-preview">
            <span className="section-preview-label">Class:</span>
            <span className="section-preview-value">
              {teacherName.trim() ? (
                sectionLabel
              ) : (
                <span className="section-preview-empty">
                  Enter teacher name above
                </span>
              )}
            </span>
            <span className="section-preview-meta">
              {sy} · {quarter}
            </span>
          </div>
        </div>

        {/* REGISTRY INFO */}
        <div
          className="registry-info-box"
          style={{
            padding: "8px 12px",
            marginBottom: "12px",
            fontSize: "12px",
          }}
        >
          <span className="registry-info-icon">🔖</span>
          <span>
            Students <strong>without an LRN</strong> will be assigned a Registry
            Number automatically.
          </span>
        </div>

        {/* DATA ENTRIES TABLE */}
        <div
          className="batch-table-wrap"
          style={{
            maxHeight: "400px",
            overflow: "auto",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            background: "#fff",
          }}
        >
          <table
            className="batch-table"
            style={{
              display: "table",
              borderCollapse: "collapse",
              tableLayout: "fixed",
              width: "1480px",
              minWidth: "1480px",
              margin: 0,
            }}
          >
            <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
              <tr style={{ background: "#5D9C32" }}>
                <th
                  style={{
                    display: "table-cell",
                    width: "50px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "center",
                  }}
                >
                  #
                </th>
                <th
                  style={{
                    display: "table-cell",
                    width: "130px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "left",
                  }}
                >
                  LRN
                </th>
                <th
                  style={{
                    display: "table-cell",
                    width: "300px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "left",
                  }}
                >
                  NAME
                </th>
                <th
                  style={{
                    display: "table-cell",
                    width: "230px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "center",
                  }}
                >
                  BIRTHDATE
                </th>
                <th
                  style={{
                    display: "table-cell",
                    width: "80px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "center",
                  }}
                >
                  AGE
                </th>
                <th
                  style={{
                    display: "table-cell",
                    width: "90px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "center",
                  }}
                >
                  SEX
                </th>
                <th
                  style={{
                    display: "table-cell",
                    width: "100px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "center",
                  }}
                >
                  WEIGHT
                </th>
                <th
                  style={{
                    display: "table-cell",
                    width: "100px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "center",
                  }}
                >
                  HEIGHT
                </th>
                <th
                  style={{
                    display: "table-cell",
                    width: "90px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "center",
                  }}
                >
                  BMI
                </th>
                <th
                  style={{
                    display: "table-cell",
                    width: "140px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "center",
                  }}
                >
                  BMI Status
                </th>
                <th
                  style={{
                    display: "table-cell",
                    width: "140px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "center",
                  }}
                >
                  HFA Status
                </th>
                <th
                  style={{
                    display: "table-cell",
                    width: "70px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "center",
                  }}
                ></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const bmi =
                  row.weight && row.height
                    ? calcBMI(row.weight, row.height)
                    : null;
                const status = bmi
                  ? getBMIStatus(bmi, row.sex, row.birthdate)
                  : null;
                const haz = row.height
                  ? getHAZStatus(row.height, row.sex, row.birthdate)
                  : null;
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        display: "table-cell",
                        padding: "8px",
                        textAlign: "center",
                      }}
                    >
                      {i + 1}
                    </td>
                    <td style={{ display: "table-cell", padding: "8px" }}>
                      <input
                        className="form-input"
                        value={row.lrn}
                        onChange={(e) => updateRow(i, "lrn", e.target.value)}
                        style={{ width: "100%", height: "34px" }}
                      />
                    </td>
                    <td style={{ display: "table-cell", padding: "8px" }}>
                      <input
                        className="form-input"
                        value={row.name}
                        onChange={(e) => updateRow(i, "name", e.target.value)}
                        style={{ width: "100%", height: "34px" }}
                      />
                    </td>
                    <td style={{ display: "table-cell", padding: "8px" }}>
                      <input
                        type="date"
                        className="form-input"
                        value={row.birthdate}
                        onChange={(e) =>
                          updateRow(i, "birthdate", e.target.value)
                        }
                        style={{
                          width: "100%",
                          height: "34px",
                          textAlign: "center",
                        }}
                      />
                    </td>
                    <td
                      style={{
                        display: "table-cell",
                        padding: "8px",
                        textAlign: "center",
                      }}
                    >
                      {row.age !== "" ? row.age : "—"}
                    </td>
                    <td style={{ display: "table-cell", padding: "8px" }}>
                      <select
                        className="form-select"
                        value={row.sex}
                        onChange={(e) => updateRow(i, "sex", e.target.value)}
                        style={{ width: "100%", height: "34px" }}
                      >
                        <option value="M">M</option>
                        <option value="F">F</option>
                      </select>
                    </td>
                    <td style={{ display: "table-cell", padding: "8px" }}>
                      <input
                        type="number"
                        className="form-input"
                        value={row.weight}
                        onChange={(e) => updateRow(i, "weight", e.target.value)}
                        style={{
                          width: "100%",
                          height: "34px",
                          textAlign: "center",
                        }}
                      />
                    </td>
                    <td style={{ display: "table-cell", padding: "8px" }}>
                      <input
                        type="number"
                        className="form-input"
                        value={row.height}
                        onChange={(e) => updateRow(i, "height", e.target.value)}
                        style={{
                          width: "100%",
                          height: "34px",
                          textAlign: "center",
                        }}
                      />
                    </td>
                    <td
                      style={{
                        display: "table-cell",
                        padding: "8px",
                        textAlign: "center",
                      }}
                    >
                      {bmi ? bmi.toFixed(2) : "—"}
                    </td>
                    <td style={{ display: "table-cell", padding: "8px" }}>
                      {status ? (
                        <Badge
                          label={status.label}
                          color={status.color}
                          bg={status.bg}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ display: "table-cell", padding: "8px" }}>
                      {haz ? (
                        <Badge
                          label={haz.label}
                          color={haz.color}
                          bg={haz.bg}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      style={{
                        display: "table-cell",
                        padding: "8px",
                        textAlign: "center",
                      }}
                    >
                      {rows.length > 1 && (
                        <button
                          className="btn-danger"
                          onClick={() => removeRow(i)}
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <input
          type="file"
          accept=".csv"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleCsvUpload}
        />

        {/* FOOTER ACTIONS */}
        <div
          className="batch-actions"
          style={{
            marginTop: "12px",
            display: "flex",
            gap: "10px",
            alignItems: "center",
          }}
        >
          <button
            className="btn btn-secondary"
            disabled={!canUpload || !schoolConfigured}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload CSV
          </button>
          <button className="btn btn-secondary" onClick={addRow}>
            + Add Row
          </button>
          <button className="btn btn-secondary" onClick={downloadCsvTemplate}>
            ⬇ Template
          </button>
          <button
            className="btn btn-primary"
            onClick={saveAll}
            disabled={!canUpload || !schoolConfigured}
          >
            Save All Records
          </button>

          {saved && <span className="save-confirm">✓ Saved successfully!</span>}
        </div>

        {!schoolConfigured && (
          <p
            className="teacher-warning"
            style={{ color: "red", marginTop: "6px" }}
          >
            ⚠ Tunnel blocked: Missing an active School ID configuration profile
            mapping.
          </p>
        )}
      </div>

      {/* CSV UPLOAD DISPLAYED DIRECTLY BELOW */}
      <div style={{ width: "100%", clear: "both" }}>
        <CSVUpload
          students={students}
          setStudents={setStudents}
          open={csvOpen}
          setOpen={setCsvOpen}
          currentUser={currentUser}
        />
      </div>
    </div>
  );
}
