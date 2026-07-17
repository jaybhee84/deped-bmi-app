import React, { useState, useMemo } from "react";
import {
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  SECTIONS,
  GRADE_LEVELS,
  SCHOOL_YEARS,
} from "../utils/bmi";
import Badge from "./Badge";
import Modal from "./Modal";
import "./SDOStudents.css";
import { queueStudentForDelete } from "../utils/syncService";
import { SCHOOL_OPTIONS } from "../constants/schools";

function hasPreviousYearData(student, currentSy) {
  if (!student?.records?.length) {
    return false;
  }

  const [startYear] = currentSy.split("–");
  const previousSy = `${parseInt(startYear) - 1}–${startYear}`;
  return student.records.some((record) => record.sy === previousSy);
}

export default function SDOStudents({
  students,
  setStudents,
  onViewProfile,
  readOnly,
}) {
  const [filterSy, setFilterSy] = useState("2026–2027");
  const [filterSchool, setFilterSchool] = useState("ALL SCHOOLS");
  const [filterPeriod, setFilterPeriod] = useState("Baseline");
  const [filterGrade, setFilterGrade] = useState("All");
  const [filterSection, setFilterSection] = useState("All");
  const [searchQ, setSearchQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ visible: false, name: "" });
  const [form, setForm] = useState({
    lrn: "",
    name: "",
    age: "",
    sex: "M",
    section: "Grade 6",
  });

  const availableSections = useMemo(() => {
    const filteredStudents = students.filter((student) =>
      filterSy === "All"
        ? true
        : student.records?.some((r) => r.sy === filterSy),
    );

    let list = [...new Set(filteredStudents.map((s) => s.section))];
    if (filterGrade !== "All") {
      list = list.filter((section) => section.startsWith(filterGrade));
    }
    return list.sort();
  }, [students, filterSy, filterGrade]);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const matchSy =
        filterSy === "All" || s.records?.some((r) => r.sy === filterSy);

      const matchPeriod =
        filterPeriod === "All" ||
        s.records?.some((r) => r.sy === filterSy && r.q === filterPeriod);

      const matchSchool =
        filterSchool === "ALL SCHOOLS" || s.schoolName === filterSchool;

      const matchGrade =
        filterGrade === "All" || s.section.startsWith(filterGrade);

      const matchSec = filterSection === "All" || s.section === filterSection;

      const matchSearch =
        searchQ === "" ||
        s.name.toLowerCase().includes(searchQ.toLowerCase()) ||
        s.lrn.includes(searchQ);

      return (
        matchSchool &&
        matchSy &&
        matchPeriod &&
        matchGrade &&
        matchSec &&
        matchSearch
      );
    });
  }, [
    students,
    filterSchool,
    filterSy,
    filterPeriod,
    filterGrade,
    filterSection,
    searchQ,
  ]);

  async function saveStudentChanges(student) {
    try {
      setStudents((prev) =>
        prev.map((s) =>
          s.id === student.id ? { ...s, hasUnsavedChanges: false } : s,
        ),
      );
      setSaveMessage({ name: student.name, visible: true });
      setTimeout(() => setSaveMessage({ name: "", visible: false }), 3000);
    } catch (error) {
      console.error(error);
      alert("Failed to save changes.");
    }
  }

  function deleteStudent(student) {
    const confirmed = window.confirm(
      `Delete ${student.name}?\n\nThis will remove the learner and all health records.`,
    );
    if (!confirmed) return;
    queueStudentForDelete(student.id);
    setStudents((prev) => prev.filter((s) => s.id !== student.id));
  }

  function handleAdd() {
    if (!form.name.trim()) return;
    setStudents((prev) => [
      ...prev,
      {
        id: Date.now(),
        lrn: form.lrn || "—",
        name: form.name,
        age: parseInt(form.age) || 0,
        sex: form.sex,
        section: form.section,
        parentConsent: "N",
        member4ps: "N",
        records: [],
      },
    ]);
    setAddOpen(false);
    setForm({ lrn: "", name: "", age: "", sex: "M", section: "Grade 6" });
  }

  return (
    <div className="sdo-page">
      <div className="sdo-page-header">
        <div>
          <h1 className="sdo-page-title">SDO Students</h1>
          <p className="sdo-page-sub">
            Manage student profiles and health records
          </p>
        </div>
        {!readOnly && (
          <button
            className="sdo-btn sdo-btn-primary"
            onClick={() => setAddOpen(true)}
          >
            + Add Student
          </button>
        )}
      </div>

      <div className="sdo-filter-row">
        <input
          className="sdo-form-input sdo-search-input"
          placeholder="Search by name or LRN…"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
        />
        <select
          className="sdo-form-select"
          value={filterSchool}
          onChange={(e) => setFilterSchool(e.target.value)}
        >
          {SCHOOL_OPTIONS.map((school) => (
            <option key={school} value={school}>
              {school}
            </option>
          ))}
        </select>

        <select
          className="sdo-form-select"
          value={filterPeriod}
          onChange={(e) => setFilterPeriod(e.target.value)}
        >
          <option value="Baseline">Baseline</option>
          <option value="Midline">Midline</option>
          <option value="Endline">Endline</option>
        </select>

        <select
          className="sdo-form-select"
          value={filterSy}
          onChange={(e) => {
            setFilterSy(e.target.value);
            setFilterGrade("All");
            setFilterSection("All");
          }}
        >
          <option value="All">All Years</option>
          {SCHOOL_YEARS.map((sy) => (
            <option key={sy} value={sy}>
              {sy}
            </option>
          ))}
        </select>
        <select
          className="sdo-form-select"
          value={filterGrade}
          onChange={(e) => {
            setFilterGrade(e.target.value);
            setFilterSection("All");
          }}
        >
          <option value="All">All Grade Levels</option>
          {GRADE_LEVELS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <select
          className="sdo-form-select"
          value={filterSection}
          onChange={(e) => setFilterSection(e.target.value)}
        >
          <option value="All">All Sections</option>
          {availableSections.map((section) => (
            <option key={section} value={section}>
              {section}
            </option>
          ))}
        </select>
      </div>

      {saveMessage.visible && (
        <div className="sdo-success-toast">
          <div className="sdo-toast-icon">✓</div>
          <div>
            <div className="sdo-toast-title">Saved Successfully</div>
            <div className="sdo-toast-text">
              {saveMessage.name} was updated.
            </div>
          </div>
        </div>
      )}

      <div className="sdo-card">
        <div className="sdo-table-container">
          <table className="sdo-table">
            <thead>
              <tr>
                <th>LRN</th>
                <th>Name</th>
                <th style={{ textAlign: "center" }}>Age</th>
                <th style={{ textAlign: "center" }}>Sex</th>
                <th>Section</th>
                <th style={{ textAlign: "center" }}>Latest BMI</th>
                <th style={{ textAlign: "center" }}>Nutritional Status</th>
                <th style={{ textAlign: "center" }}>HFA Status</th>
                <th style={{ textAlign: "center" }}>Consent</th>
                <th style={{ textAlign: "center" }}>4Ps</th>
                <th style={{ textAlign: "center" }}>Prev SBFP</th>
                <th style={{ textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    style={{
                      textAlign: "center",
                      padding: "30px",
                      color: "#718096",
                    }}
                  >
                    No students found.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const rec = s.records.length
                    ? s.records[s.records.length - 1]
                    : null;
                  const bmi = rec ? calcBMI(rec.weight, rec.height) : null;
                  const status = bmi
                    ? getBMIStatus(bmi, s.sex, s.birthdate)
                    : null;
                  const hfa = rec
                    ? getHAZStatus(rec.height, s.sex, s.birthdate)
                    : null;
                  const previousSbfp = hasPreviousYearData(
                    s,
                    filterSy === "All" ? "2026–2027" : filterSy,
                  );

                  return (
                    <tr
                      key={s.id}
                      onClick={() => onViewProfile(s)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{s.lrn}</td>
                      <td className="sdo-name-cell">{s.name}</td>
                      <td style={{ textAlign: "center" }}>{s.age}</td>
                      <td style={{ textAlign: "center" }}>{s.sex}</td>
                      <td>{s.section}</td>
                      <td style={{ textAlign: "center" }}>
                        {bmi ? (
                          bmi.toFixed(1)
                        ) : (
                          <span className="sdo-muted">—</span>
                        )}
                      </td>
                      <td>
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
                            <span className="sdo-no-data-tag">No data</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div
                          style={{ display: "flex", justifyContent: "center" }}
                        >
                          {hfa ? (
                            <Badge
                              label={hfa.label}
                              color={hfa.color}
                              bg={hfa.bg}
                            />
                          ) : (
                            <span className="sdo-no-data-tag">No data</span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span
                          style={{
                            color:
                              (s.parentConsent || "N") === "Y"
                                ? "#16a34a"
                                : "#dc2626",
                            fontWeight: "bold",
                          }}
                        >
                          {s.parentConsent || "N"}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span
                          style={{
                            color:
                              (s.member4ps || "N") === "Y"
                                ? "#16a34a"
                                : "#dc2626",
                            fontWeight: "bold",
                          }}
                        >
                          {s.member4ps || "N"}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span
                          style={{
                            color: previousSbfp ? "#16a34a" : "#dc2626",
                            fontWeight: "bold",
                          }}
                        >
                          {previousSbfp ? "Y" : "N"}
                        </span>
                      </td>
                      <td
                        style={{ textAlign: "center" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!readOnly &&
                          (s.hasUnsavedChanges ? (
                            <button
                              className="sdo-btn-save"
                              onClick={() => saveStudentChanges(s)}
                            >
                              Save
                            </button>
                          ) : (
                            <button
                              className="sdo-btn-delete"
                              onClick={() => deleteStudent(s)}
                            >
                              Delete
                            </button>
                          ))}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {addOpen && (
        <Modal title="Add New Student" onClose={() => setAddOpen(false)}>
          <div className="sdo-form-grid-2">
            <div className="sdo-form-group sdo-full-span">
              <label className="sdo-form-label">
                Full Name (Last, First M.)
              </label>
              <input
                className="sdo-form-input"
                placeholder="e.g. Reyes, Maria A."
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="sdo-form-group">
              <label className="sdo-form-label">LRN</label>
              <input
                className="sdo-form-input"
                placeholder="12-digit LRN"
                value={form.lrn}
                onChange={(e) =>
                  setForm((f) => ({ ...f, lrn: e.target.value }))
                }
              />
            </div>
            <div className="sdo-form-group">
              <label className="sdo-form-label">Age</label>
              <input
                type="number"
                className="sdo-form-input"
                value={form.age}
                onChange={(e) =>
                  setForm((f) => ({ ...f, age: e.target.value }))
                }
              />
            </div>
            <div className="sdo-form-group">
              <label className="sdo-form-label">Sex</label>
              <select
                className="sdo-form-select"
                value={form.sex}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sex: e.target.value }))
                }
              >
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>
            <div className="sdo-form-group">
              <label className="sdo-form-label">Section</label>
              <select
                className="sdo-form-select"
                value={form.section}
                onChange={(e) =>
                  setForm((f) => ({ ...f, section: e.target.value }))
                }
              >
                {SECTIONS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="sdo-modal-footer">
            <button
              className="sdo-btn sdo-btn-secondary"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </button>
            <button className="sdo-btn sdo-btn-primary" onClick={handleAdd}>
              Add Student
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
