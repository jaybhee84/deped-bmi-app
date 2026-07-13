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
import "./Students.css";
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

export default function Students({
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
  const [saveMessage, setSaveMessage] = useState({
    visible: false,
    name: "",
  });
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

  function updateStudentField(id, field, value) {
    setStudents((prev) =>
      prev.map((student) =>
        student.id === id
          ? {
              ...student,
              [field]: value,
              hasUnsavedChanges: true,
            }
          : student,
      ),
    );
  }
  async function saveStudentChanges(student) {
    try {
      // update local state
      setStudents((prev) =>
        prev.map((s) =>
          s.id === student.id
            ? {
                ...s,
                hasUnsavedChanges: false,
              }
            : s,
        ),
      );

      // TODO:
      // update Supabase here

      console.log("Saved student:", student);
      setSaveMessage({
        name: student.name,
        visible: true,
      });

      setTimeout(() => {
        setSaveMessage({
          name: "",
          visible: false,
        });
      }, 3000);
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
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">SDO Students</h1>
          <p className="page-sub">Manage student profiles and health records</p>
        </div>
        {!readOnly && (
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
            + Add Student
          </button>
        )}
      </div>

      <div className="filter-row">
        <input
          className="form-input search-input"
          placeholder="Search by name or LRN…"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
        />
        <select
          className="form-select"
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
          className="form-select"
          value={filterPeriod}
          onChange={(e) => setFilterPeriod(e.target.value)}
        >
          <option value="Baseline">Baseline</option>
          <option value="Midline">Midline</option>
          <option value="Endline">Endline</option>
        </select>

        <select
          className="form-select"
          value={filterSy}
          onChange={(e) => {
            setFilterSy(e.target.value);
            setFilterGrade("All");
            setFilterSection("All");
          }}
        >
          <option value="All"></option>

          {SCHOOL_YEARS.map((sy) => (
            <option key={sy} value={sy}>
              {sy}
            </option>
          ))}
        </select>
        <select
          className="form-select"
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
          className="form-select"
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
        <div className="success-toast">
          <div className="toast-icon">✓</div>

          <div>
            <div className="toast-title">Saved Successfully</div>

            <div className="toast-text">{saveMessage.name} was updated.</div>
          </div>
        </div>
      )}
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>LRN</th>
              <th>Name</th>
              <th>Age</th>
              <th>Sex</th>
              <th>Section</th>
              <th>Latest BMI</th>
              <th>Nutritional Status</th>
              <th>HFA Status</th>
              <th>Consent</th>
              <th>4Ps</th>
              <th>Prev SBFP</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="empty-cell">
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
                    className="clickable-row"
                    onClick={() => onViewProfile(s)}
                  >
                    <td>{s.lrn}</td>
                    <td className="name-cell">{s.name}</td>
                    <td>{s.age}</td>
                    <td>{s.sex}</td>
                    <td>{s.section}</td>
                    <td>
                      {bmi ? bmi.toFixed(1) : <span className="muted">—</span>}
                    </td>
                    <td>
                      {status ? (
                        <Badge
                          label={status.label}
                          color={status.color}
                          bg={status.bg}
                        />
                      ) : (
                        <span className="no-data-tag">No data</span>
                      )}
                    </td>
                    <td>
                      {hfa ? (
                        <Badge
                          label={hfa.label}
                          color={hfa.color}
                          bg={hfa.bg}
                        />
                      ) : (
                        <span className="no-data-tag">No data</span>
                      )}
                    </td>

                    <td>
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

                    <td>
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

                    <td>
                      <span
                        style={{
                          color: previousSbfp ? "#16a34a" : "#dc2626",
                          fontWeight: "bold",
                        }}
                      >
                        {previousSbfp ? "Y" : "N"}
                      </span>
                    </td>
                    <td>
                      {!readOnly &&
                        (s.hasUnsavedChanges ? (
                          <button
                            className="btn-save"
                            onClick={(e) => {
                              e.stopPropagation();
                              saveStudentChanges(s);
                            }}
                          >
                            Save
                          </button>
                        ) : (
                          <button
                            className="btn-delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteStudent(s);
                            }}
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

      {addOpen && (
        <Modal title="Add New Student" onClose={() => setAddOpen(false)}>
          <div className="form-grid-2">
            <div className="form-group full-span">
              <label className="form-label">Full Name (Last, First M.)</label>
              <input
                className="form-input"
                placeholder="e.g. Reyes, Maria A."
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">LRN</label>
              <input
                className="form-input"
                placeholder="12-digit LRN"
                value={form.lrn}
                onChange={(e) =>
                  setForm((f) => ({ ...f, lrn: e.target.value }))
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Age</label>
              <input
                type="number"
                className="form-input"
                value={form.age}
                onChange={(e) =>
                  setForm((f) => ({ ...f, age: e.target.value }))
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Sex</label>
              <select
                className="form-select full-width"
                value={form.sex}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sex: e.target.value }))
                }
              >
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Section</label>
              <select
                className="form-select full-width"
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
          <div className="modal-footer">
            <button
              className="btn btn-secondary"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleAdd}>
              Add Student
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
