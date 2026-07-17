import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  ageInYears,
  SCHOOL_YEARS,
  QUARTERS,
  GRADE_LEVELS,
  SESSIONS,
} from "../utils/bmi";
import Badge from "./Badge";
import "./BatchEntry.css";
import { generateRegistryNumbers } from "../utils/registry";
import Papa from "papaparse";

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
  link.download = "Batch_Entry_Template.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function BatchEntry({ setStudents }) {
  const fileInputRef = useRef(null);
  const [gradeLevel, setGradeLevel] = useState("Kinder");
  const [teacherName, setTeacherName] = useState("");
  const [session, setSession] = useState("Morning");
  const [sy, setSy] = useState("2026–2027");
  const [quarter, setQuarter] = useState("Baseline");
  const [date, setDate] = useState("");
  const [rows, setRows] = useState([emptyRow()]);
  const [saved, setSaved] = useState(false);

  const [savedTeachers, setSavedTeachers] = useState(loadSavedTeachers);
  const teacherSuggestions = savedTeachers[gradeLevel] || [];
  const sectionLabel = buildSectionLabel(gradeLevel, teacherName, session);
  const canUpload = gradeLevel.trim() && teacherName.trim();
  const [school, setSchool] = useState(null);
  const [schoolConfigured, setSchoolConfigured] = useState(false);

  useEffect(() => {
    async function loadSchool() {
      const schoolData = await window.sqlite.loadSchool();
      setSchool(schoolData);
      setSchoolConfigured(!!(schoolData?.school_id && schoolData?.school_name));
    }
    loadSchool();
  }, []);

  const schoolName = school?.school_name || "unknown";

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
            const date = new Date(row.birthdate);
            if (!isNaN(date.getTime())) {
              birthdate = date.toISOString().split("T")[0];
            }
          }
          return {
            lrn: row.lrn?.trim() || "",
            name: row.name?.trim() || "",
            birthdate,
            age: birthdate ? ageInYears(birthdate) : "",
            weight: row.weight?.toString() || "",
            height: row.height?.toString() || "",
            sex: row.sex?.trim().toUpperCase() || "M",
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
        "School setup is required.\n\nPlease go to Settings and enter the School Name and School ID before adding learners.",
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
            schoolId: school.school_id,
            schoolName: school.school_name,
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

    window.electronAPI.forceRefocusWindow();
  }

  return (
    <div className="page">
      <h1 className="page-title">Batch Entry</h1>
      <p className="page-sub">Enter measurements for an entire class at once</p>

      <div className="card">
        <div className="batch-class-box">
          <div className="batch-class-title">Class / Section Setup</div>

          <div className="batch-header-grid">
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
                Teacher Name
                <span className="label-hint"> (auto-saved per grade)</span>
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
              <label className="form-label">Period</label>
              <select
                className="form-select full-width"
                value={quarter}
                onChange={(e) => setQuarter(e.target.value)}
              >
                {QUARTERS.map((q) => (
                  <option key={q}>{q}</option>
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

        <div className="registry-info-box">
          <span className="registry-info-icon">🔖</span>
          <span>
            Students <strong>without an LRN</strong> will be assigned a Registry
            Number automatically (e.g.{" "}
            <code>
              {sy.split("–")[0]}-schoolcode-
              {gradeLevel === "Kinder" ? "K" : `G${gradeLevel.split(" ")[1]}`}
              -0001
            </code>
            ). This serves as their identifier for Midline / Endline CSV
            uploads.
          </span>
        </div>

        {/* --- INLINE STYLE TARGETED STANDALONE TABLE CONTAINER --- */}
        <div
          className="batch-table-wrap"
          style={{
            overflowX: "auto",
            width: "100%",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
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
            <thead>
              <tr style={{ background: "#5D9C32" }}>
                <th
                  style={{
                    display: "table-cell",
                    width: "50px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "center",
                    fontWeight: 600,
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
                    fontWeight: 600,
                  }}
                >
                  LRN
                  <span
                    style={{
                      display: "block",
                      fontSize: "10px",
                      opacity: 0.8,
                      fontWeight: 400,
                      textTransform: "none",
                      color: "#e2f0d9",
                    }}
                  >
                    (optional)
                  </span>
                </th>
                <th
                  style={{
                    display: "table-cell",
                    width: "300px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "left",
                    fontWeight: 600,
                  }}
                >
                  NAME
                  <span
                    style={{
                      display: "block",
                      fontSize: "10px",
                      opacity: 0.8,
                      fontWeight: 400,
                      textTransform: "none",
                      color: "#e2f0d9",
                    }}
                  >
                    (Last, First M.)
                  </span>
                </th>
                {/* 230px forced width locks birthdate container structure from ever resizing or overflowing */}
                <th
                  style={{
                    display: "table-cell",
                    width: "230px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  BIRTHDATE
                  <span
                    style={{
                      display: "block",
                      fontSize: "10px",
                      opacity: 0.8,
                      fontWeight: 400,
                      textTransform: "none",
                      color: "#e2f0d9",
                    }}
                  >
                    (YYYY-MM-DD)
                  </span>
                </th>
                <th
                  style={{
                    display: "table-cell",
                    width: "80px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  AGE
                  <span
                    style={{
                      display: "block",
                      fontSize: "10px",
                      opacity: 0.8,
                      fontWeight: 400,
                      textTransform: "none",
                      color: "#e2f0d9",
                    }}
                  >
                    (Years)
                  </span>
                </th>
                <th
                  style={{
                    display: "table-cell",
                    width: "90px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "center",
                    fontWeight: 600,
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
                    fontWeight: 600,
                  }}
                >
                  WEIGHT
                  <span
                    style={{
                      display: "block",
                      fontSize: "10px",
                      opacity: 0.8,
                      fontWeight: 400,
                      textTransform: "none",
                      color: "#e2f0d9",
                    }}
                  >
                    (kg)
                  </span>
                </th>
                <th
                  style={{
                    display: "table-cell",
                    width: "100px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  HEIGHT
                  <span
                    style={{
                      display: "block",
                      fontSize: "10px",
                      opacity: 0.8,
                      fontWeight: 400,
                      textTransform: "none",
                      color: "#e2f0d9",
                    }}
                  >
                    (cm)
                  </span>
                </th>
                <th
                  style={{
                    display: "table-cell",
                    width: "90px",
                    color: "#fff",
                    padding: "10px 8px",
                    fontSize: "12px",
                    textAlign: "center",
                    fontWeight: 600,
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
                    fontWeight: 600,
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
                    fontWeight: 600,
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
                    fontWeight: 600,
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
                const _hazStatus = row.height
                  ? getHAZStatus(row.height, row.sex, row.birthdate)
                  : null;
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #edf2f7" }}>
                    <td
                      style={{
                        display: "table-cell",
                        width: "50px",
                        padding: "8px",
                        textAlign: "center",
                        verticalAlign: "middle",
                      }}
                    >
                      <span
                        style={{
                          color: "#718096",
                          fontSize: "13px",
                          fontWeight: 600,
                        }}
                      >
                        {i + 1}
                      </span>
                    </td>

                    <td
                      style={{
                        display: "table-cell",
                        width: "130px",
                        padding: "8px",
                        verticalAlign: "middle",
                      }}
                    >
                      <input
                        className="form-input"
                        placeholder="LRN"
                        value={row.lrn}
                        onChange={(e) => updateRow(i, "lrn", e.target.value)}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          height: "34px",
                          fontSize: "13px",
                        }}
                      />
                    </td>

                    <td
                      style={{
                        display: "table-cell",
                        width: "300px",
                        padding: "8px",
                        verticalAlign: "middle",
                      }}
                    >
                      <input
                        className="form-input"
                        placeholder="e.g. Reyes, Maria A."
                        value={row.name}
                        onChange={(e) => updateRow(i, "name", e.target.value)}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          height: "34px",
                          fontSize: "13px",
                        }}
                      />
                    </td>

                    {/* Width of 230px here allows standard date inputs (including native dropdown arrow icons) to stay fully visible */}
                    <td
                      style={{
                        display: "table-cell",
                        width: "230px",
                        padding: "8px",
                        textAlign: "center",
                        verticalAlign: "middle",
                      }}
                    >
                      <input
                        type="date"
                        className="form-input"
                        value={row.birthdate}
                        onChange={(e) =>
                          updateRow(i, "birthdate", e.target.value)
                        }
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          height: "34px",
                          fontSize: "13px",
                          textAlign: "center",
                        }}
                      />
                    </td>

                    <td
                      style={{
                        display: "table-cell",
                        width: "80px",
                        padding: "8px",
                        textAlign: "center",
                        verticalAlign: "middle",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "34px",
                          width: "100%",
                          maxWidth: "60px",
                          background: "#f7fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: "4px",
                          fontSize: "13px",
                          boxSizing: "border-box",
                          margin: "0 auto",
                        }}
                      >
                        {row.age !== "" ? (
                          <span style={{ fontWeight: 700, color: "#1a365d" }}>
                            {row.age}
                          </span>
                        ) : (
                          <span style={{ color: "#a0aec0" }}>—</span>
                        )}
                      </div>
                    </td>

                    <td
                      style={{
                        display: "table-cell",
                        width: "90px",
                        padding: "8px",
                        textAlign: "center",
                        verticalAlign: "middle",
                      }}
                    >
                      <select
                        className="form-select"
                        value={row.sex}
                        onChange={(e) => updateRow(i, "sex", e.target.value)}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          height: "34px",
                          fontSize: "13px",
                          textAlign: "center",
                          textAlignLast: "center", // Cross-browser support for dropdown text alignment
                        }}
                      >
                        <option value="M">M</option>
                        <option value="F">F</option>
                      </select>
                    </td>

                    <td
                      style={{
                        display: "table-cell",
                        width: "100px",
                        padding: "8px",
                        textAlign: "center",
                        verticalAlign: "middle",
                      }}
                    >
                      <input
                        type="number"
                        className="form-input"
                        placeholder="kg"
                        value={row.weight}
                        onChange={(e) => updateRow(i, "weight", e.target.value)}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          height: "34px",
                          fontSize: "13px",
                          textAlign: "center",
                        }}
                      />
                    </td>

                    <td
                      style={{
                        display: "table-cell",
                        width: "100px",
                        padding: "8px",
                        textAlign: "center",
                        verticalAlign: "middle",
                      }}
                    >
                      <input
                        type="number"
                        className="form-input"
                        placeholder="cm"
                        value={row.height}
                        onChange={(e) => updateRow(i, "height", e.target.value)}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          height: "34px",
                          fontSize: "13px",
                          textAlign: "center",
                        }}
                      />
                    </td>

                    <td
                      style={{
                        display: "table-cell",
                        width: "90px",
                        padding: "8px",
                        textAlign: "center",
                        verticalAlign: "middle",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "34px",
                          fontWeight: 600,
                          fontSize: "13px",
                          background: "#f7fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: "4px",
                          boxSizing: "border-box",
                        }}
                      >
                        {bmi ? (
                          bmi.toFixed(2)
                        ) : (
                          <span style={{ color: "#a0aec0" }}>—</span>
                        )}
                      </div>
                    </td>

                    <td
                      style={{
                        display: "table-cell",
                        width: "140px",
                        padding: "8px",
                        textAlign: "center",
                        verticalAlign: "middle",
                      }}
                    >
                      <div
                        style={{ display: "flex", justifyContent: "center" }}
                      >
                        {status ? (
                          <Badge
                            label={status.label}
                            color={status.color}
                            bg={status.bg}
                          />
                        ) : (
                          <span style={{ color: "#a0aec0" }}>—</span>
                        )}
                      </div>
                    </td>

                    <td
                      style={{
                        display: "table-cell",
                        width: "140px",
                        padding: "8px",
                        textAlign: "center",
                        verticalAlign: "middle",
                      }}
                    >
                      <div
                        style={{ display: "flex", justifyContent: "center" }}
                      >
                        {_hazStatus ? (
                          <Badge
                            label={_hazStatus.label}
                            color={_hazStatus.color}
                            bg={_hazStatus.bg}
                          />
                        ) : (
                          <span style={{ color: "#a0aec0" }}>—</span>
                        )}
                      </div>
                    </td>

                    <td
                      style={{
                        display: "table-cell",
                        width: "70px",
                        padding: "8px",
                        textAlign: "center",
                        verticalAlign: "middle",
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

        {!schoolConfigured && (
          <p className="teacher-warning">
            ⚠ School setup is incomplete. Please go to Settings and enter the
            School Name and School ID first.
          </p>
        )}

        <div className="batch-actions" style={{ marginTop: "1rem" }}>
          <button
            className="btn btn-secondary"
            disabled={!canUpload || !schoolConfigured}
            title={
              !canUpload
                ? "Select Grade Level and enter Teacher Name first."
                : ""
            }
            onClick={() => fileInputRef.current?.click()}
          >
            Upload CSV
          </button>

          <button className="btn btn-secondary" onClick={addRow}>
            + Add Row
          </button>

          <button className="btn btn-secondary" onClick={downloadCsvTemplate}>
            ⬇ Download CSV Template
          </button>

          <button
            className="btn btn-primary"
            onClick={saveAll}
            disabled={!canUpload || !schoolConfigured}
            title={
              !schoolConfigured
                ? "Please configure School Name and School ID in Settings first."
                : !canUpload
                  ? "Select Grade Level and enter Teacher Name first."
                  : ""
            }
          >
            Save All Records
          </button>

          {saved && (
            <span className="save-confirm">
              ✓ Saved to <strong>{sectionLabel}</strong>!
            </span>
          )}
        </div>

        {!canUpload && (
          <p className="teacher-warning">
            ⚠ Please select a Grade Level and enter the Teacher Name before
            uploading or saving.
          </p>
        )}
      </div>
    </div>
  );
}
