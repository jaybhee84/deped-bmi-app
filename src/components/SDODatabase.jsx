import React, { useState, useMemo } from "react";
import {
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  SECTIONS,
  GRADE_LEVELS,
} from "../utils/bmi";
import Badge from "./Badge";
import Modal from "./Modal";
import "./SDODatabase.css";
import { queueStudentForDelete } from "../utils/syncService";
import { SCHOOL_OPTIONS } from "../constants/schools";

<<<<<<< HEAD
const GRADE_ORDER = [
  "Kinder",
  "Kindergarten",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "SPED",
];

function getGradeRank(sectionStr) {
  if (!sectionStr) return 999;
  const str = String(sectionStr).trim().toLowerCase();
  const index = GRADE_ORDER.findIndex((g) => str.startsWith(g.toLowerCase()));
  return index !== -1 ? index : 998;
}

=======
>>>>>>> 3492e0e17071ff1ffc19b4d75d43e6ecc25deb13
function hasPreviousYearData(student, currentSy) {
  if (!student?.records?.length || !currentSy) {
    return false;
  }
  try {
    const [startYear] = currentSy.split("-");
    if (!startYear) return false;
    const previousSy = `${parseInt(startYear) - 1}-${startYear}`;
    return student.records.some((record) => record?.sy === previousSy);
  } catch (e) {
    console.error("SBFP calculation error fallback applied:", e);
    return false;
  }
}

export default function SDOStudents({
  students = [],
  setStudents,
  onViewProfile,
  readOnly,
}) {
<<<<<<< HEAD
=======
  // FIXED: Removed old dynamic utility dependency and added 2026–2027 through 2029–2030 manually[cite: 3]
>>>>>>> 3492e0e17071ff1ffc19b4d75d43e6ecc25deb13
  const FUTURE_SCHOOL_YEARS = [
    "2026–2027",
    "2027–2028",
    "2028–2029",
    "2029–2030",
  ];

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
<<<<<<< HEAD
    if (filterGrade === "All") return [];

=======
>>>>>>> 3492e0e17071ff1ffc19b4d75d43e6ecc25deb13
    const targetStudents = Array.isArray(students) ? students : [];
    const filteredStudents = targetStudents.filter((student) => {
      if (!student) return false;
      return filterSy === "All"
        ? true
        : student.records?.some((r) => r?.sy === filterSy);
    });

    let list = [
      ...new Set(filteredStudents.map((s) => s?.section).filter(Boolean)),
    ];
<<<<<<< HEAD
    list = list.filter((section) => section.startsWith(filterGrade));
=======
    if (filterGrade !== "All") {
      list = list.filter((section) => section.startsWith(filterGrade));
    }
>>>>>>> 3492e0e17071ff1ffc19b4d75d43e6ecc25deb13
    return list.sort();
  }, [students, filterSy, filterGrade]);

  const filtered = useMemo(() => {
    const targetStudents = Array.isArray(students) ? students : [];
<<<<<<< HEAD
    return targetStudents
      .filter((s) => {
        if (!s) return false;

        const matchSy =
          filterSy === "All" || s.records?.some((r) => r?.sy === filterSy);

        const matchPeriod =
          filterPeriod === "All" ||
          s.records?.some((r) => r?.sy === filterSy && r?.q === filterPeriod);

        const matchSchool =
          filterSchool === "ALL SCHOOLS" || s.schoolName === filterSchool;

        const matchGrade =
          filterGrade === "All" ||
          (s.section && s.section.startsWith(filterGrade));

        const matchSec = filterSection === "All" || s.section === filterSection;

        const sName = s.name || "";
        const sLrn = s.lrn || "";
        const matchSearch =
          searchQ === "" ||
          sName.toLowerCase().includes(searchQ.toLowerCase()) ||
          sLrn.includes(searchQ);

        return (
          matchSchool &&
          matchSy &&
          matchPeriod &&
          matchGrade &&
          matchSec &&
          matchSearch
        );
      })
      .sort((a, b) => {
        // 1. Sort by Grade Level Rank (Kinder -> Grade 1..6 -> SPED)
        const rankA = getGradeRank(a?.section);
        const rankB = getGradeRank(b?.section);
        if (rankA !== rankB) {
          return rankA - rankB;
        }

        // 2. Group by Sex: Males ('M') first, then Females ('F')
        const sexA = (a?.sex || "").toUpperCase();
        const sexB = (b?.sex || "").toUpperCase();
        if (sexA !== sexB) {
          if (sexA === "M") return -1;
          if (sexB === "M") return 1;
          return sexA.localeCompare(sexB);
        }

        // 3. Alphabetical by Name within the same grade & sex
        const nameA = a?.name || "";
        const nameB = b?.name || "";
        return nameA.localeCompare(nameB);
      });
=======
    return targetStudents.filter((s) => {
      if (!s) return false;

      const matchSy =
        filterSy === "All" || s.records?.some((r) => r?.sy === filterSy);

      const matchPeriod =
        filterPeriod === "All" ||
        s.records?.some((r) => r?.sy === filterSy && r?.q === filterPeriod);

      const matchSchool =
        filterSchool === "ALL SCHOOLS" || s.schoolName === filterSchool;

      const matchGrade =
        filterGrade === "All" ||
        (s.section && s.section.startsWith(filterGrade));

      const matchSec = filterSection === "All" || s.section === filterSection;

      const sName = s.name || "";
      const sLrn = s.lrn || "";
      const matchSearch =
        searchQ === "" ||
        sName.toLowerCase().includes(searchQ.toLowerCase()) ||
        sLrn.includes(searchQ);

      return (
        matchSchool &&
        matchSy &&
        matchPeriod &&
        matchGrade &&
        matchSec &&
        matchSearch
      );
    });
>>>>>>> 3492e0e17071ff1ffc19b4d75d43e6ecc25deb13
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
    if (!setStudents) return;
    try {
      setStudents((prev) =>
        (Array.isArray(prev) ? prev : []).map((s) =>
          s.id === student.id ? { ...s, hasUnsavedChanges: false } : s,
        ),
      );
      setSaveMessage({ name: student.name || "Learner", visible: true });
      setTimeout(() => setSaveMessage({ name: "", visible: false }), 3000);
    } catch (error) {
      console.error(error);
      alert("Failed to save changes.");
    }
  }

  function deleteStudent(student) {
    if (!setStudents) return;
    const confirmed = window.confirm(
      `Delete ${student.name || "this record"}?\n\nThis will remove the learner and all health records.`,
    );
    if (!confirmed) return;
    if (queueStudentForDelete) {
      queueStudentForDelete(student.id);
    }
    setStudents((prev) =>
      (Array.isArray(prev) ? prev : []).filter((s) => s.id !== student.id),
    );
  }

  function handleAdd() {
    if (!form.name.trim() || !setStudents) return;
    setStudents((prev) => [
      ...(Array.isArray(prev) ? prev : []),
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
<<<<<<< HEAD
<<<<<<<< HEAD:src/components/SDODatabase.jsx
          <h1 className="sdo-page-title">SDO Database</h1>
========
          <h1 className="sdo-page-title">Database</h1>
>>>>>>>> 3492e0e17071ff1ffc19b4d75d43e6ecc25deb13:src/components/SDOStudents.jsx
=======
          {/* FIXED: Changed title from SDO Students to SDODatabase */}
          <h1 className="sdo-page-title">SDO Database</h1>
>>>>>>> 3492e0e17071ff1ffc19b4d75d43e6ecc25deb13
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
<<<<<<< HEAD
=======
          {/* FIXED: Replaced SCHOOL_YEARS with FUTURE_SCHOOL_YEARS loop[cite: 3] */}
>>>>>>> 3492e0e17071ff1ffc19b4d75d43e6ecc25deb13
          {FUTURE_SCHOOL_YEARS.map((sy) => (
            <option key={sy} value={sy}>
              {sy}
            </option>
          ))}
        </select>
<<<<<<< HEAD

=======
>>>>>>> 3492e0e17071ff1ffc19b4d75d43e6ecc25deb13
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
<<<<<<< HEAD
          disabled={filterGrade === "All"}
        >
          <option value="All">
            {filterGrade === "All" ? "Select Grade First" : "All Sections"}
          </option>
=======
        >
          <option value="All">All Sections</option>
>>>>>>> 3492e0e17071ff1ffc19b4d75d43e6ecc25deb13
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
                  if (!s) return null;
                  const recordsList = Array.isArray(s.records) ? s.records : [];
                  const rec = recordsList.length
                    ? recordsList[recordsList.length - 1]
                    : null;

                  let bmi = null;
                  let status = null;
                  let hfa = null;

                  if (rec) {
                    try {
                      bmi = calcBMI(rec.weight, rec.height);
                      status = bmi
                        ? getBMIStatus(bmi, s.sex, s.birthdate)
                        : null;
                      hfa = getHAZStatus(rec.height, s.sex, s.birthdate);
                    } catch (err) {
                      console.error(
                        "Error calculating nutritional status row parameters:",
                        err,
                      );
                    }
                  }

<<<<<<< HEAD
                  const previousSbfp = hasPreviousYearData(
                    s,
<<<<<<<< HEAD:src/components/SDODatabase.jsx
                    filterSy === "All" ? "2026–2027" : filterSy,
========
                    filterSy === "All"
                      ? SCHOOL_YEARS[0] || "2026-2027"
                      : filterSy,
>>>>>>>> 3492e0e17071ff1ffc19b4d75d43e6ecc25deb13:src/components/SDOStudents.jsx
=======
                  // FIXED: Modified fallback query mapping parameter to point to FUTURE_SCHOOL_YEARS[0]
                  const previousSbfp = hasPreviousYearData(
                    s,
                    filterSy === "All" ? "2026–2027" : filterSy,
>>>>>>> 3492e0e17071ff1ffc19b4d75d43e6ecc25deb13
                  );

                  return (
                    <tr
                      key={s.id}
                      onClick={() => onViewProfile && onViewProfile(s)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{s.lrn || <span className="sdo-muted">—</span>}</td>
                      <td className="sdo-name-cell">{s.name}</td>
                      <td style={{ textAlign: "center" }}>{s.age}</td>
                      <td style={{ textAlign: "center" }}>{s.sex}</td>
                      <td>{s.section || "—"}</td>
                      <td style={{ textAlign: "center" }}>
                        {typeof bmi === "number" ? (
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
<<<<<<< HEAD
                              className="sdo-btn sdo-btn-primary"
=======
                              className="sdo-btn-save"
>>>>>>> 3492e0e17071ff1ffc19b4d75d43e6ecc25deb13
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
