import React, { useState, useMemo } from "react";
import "./Database.css";
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
import { queueStudentForDelete } from "../utils/syncService";
import { getStudentIdentifier } from "../utils/registry";

const PERIODS = ["Baseline", "Midline", "Endline"];

function hasPreviousYearData(student, currentSy) {
  if (!student?.records?.length) {
    return false;
  }

  const [startYear] = currentSy.split("–");
  const previousSy = `${parseInt(startYear) - 1}–${startYear}`;

  return student.records.some((record) => record.sy === previousSy);
}

export default function Database({
  students,
  setStudents,
  onViewProfile,
  readOnly,
  currentUser,
}) {
  const [filterSy, setFilterSy] = useState("2026–2027");
  const [filterPeriod, setFilterPeriod] = useState("All");
  const [filterGrade, setFilterGrade] = useState("All");
  const [filterSection, setFilterSection] = useState("All");
  const [searchQ, setSearchQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState({
    visible: false,
    name: "",
  });
  const [deleteClassOpen, setDeleteClassOpen] = useState(false);
  const [classDeleteMessage, setClassDeleteMessage] = useState({
    visible: false,
    section: "",
    count: 0,
  });
  const [form, setForm] = useState({
    lrn: "",
    name: "",
    age: "",
    sex: "M",
    section: "Grade 6",
  });

  const availableSections = useMemo(() => {
    const filteredStudents = students.filter((student) => {
      const matchSy =
        filterSy === "All" || student.records?.some((r) => r.sy === filterSy);
      const matchPeriod =
        filterPeriod === "All" ||
        student.records?.some((r) => r.q === filterPeriod);
      return matchSy && matchPeriod;
    });

    const counts = filteredStudents.reduce((acc, student) => {
      acc[student.section] = (acc[student.section] || 0) + 1;
      return acc;
    }, {});

    let list = [...new Set(filteredStudents.map((s) => s.section))];

    if (filterGrade !== "All") {
      list = list.filter((section) => section.startsWith(filterGrade));
    }

    // Order sections by grade level (Kinder → Grade 6), not by whatever
    // order they happened to be entered in during batch entry. Sections
    // sharing the same grade fall back to alphabetical order.
    function gradeRank(sectionName) {
      const idx = GRADE_LEVELS.findIndex((g) => sectionName.startsWith(g));
      return idx === -1 ? GRADE_LEVELS.length : idx;
    }

    return list
      .sort((a, b) => {
        const rankDiff = gradeRank(a) - gradeRank(b);
        if (rankDiff !== 0) return rankDiff;
        return a.localeCompare(b);
      })
      .map((sectionName) => ({
        name: sectionName,
        count: counts[sectionName] || 0,
      }));
  }, [students, filterSy, filterPeriod, filterGrade]);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const matchSy =
        filterSy === "All" || s.records?.some((r) => r.sy === filterSy);

      const matchPeriod =
        filterPeriod === "All" || s.records?.some((r) => r.q === filterPeriod);

      const matchGrade =
        filterGrade === "All" || s.section.startsWith(filterGrade);

      const matchSec = filterSection === "All" || s.section === filterSection;

      const matchQ =
        searchQ === "" ||
        s.name.toLowerCase().includes(searchQ.toLowerCase()) ||
        s.lrn.includes(searchQ);

      return matchSy && matchPeriod && matchGrade && matchSec && matchQ;
    });
  }, [students, filterSy, filterPeriod, filterGrade, filterSection, searchQ]);

  // Always show Male learners first, then Female, alphabetical by name
  // within each — regardless of which filters are active.
  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.sex !== b.sex) {
        return a.sex === "M" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [filtered]);

  const classDeleteTargetCount = useMemo(() => {
    if (filterSection === "All") return 0;
    return students.filter((s) => s.section === filterSection).length;
  }, [students, filterSection]);

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
      if (window.sqlite?.updateStudentWorkspaceMeta) {
        await window.sqlite.updateStudentWorkspaceMeta(
          student.id,
          {
            parentConsent: student.parentConsent,
            member4ps: student.member4ps,
          },
          currentUser?.id,
        );
      }

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

    queueStudentForDelete(student.id, currentUser?.id);
    setStudents((prev) => prev.filter((s) => s.id !== student.id));

    // Electron sometimes leaves dropdowns/selects unresponsive after a
    // dialog closes and a row is removed from underneath the pointer.
    // Forcing a refocus of the window resolves it.
    if (window.electronAPI?.forceRefocusWindow) {
      window.electronAPI.forceRefocusWindow();
    }
  }

  function confirmDeleteClass() {
    if (filterSection === "All") return;

    const targets = students.filter((s) => s.section === filterSection);
    const deletedSection = filterSection;
    const deletedCount = targets.length;

    targets.forEach((s) => queueStudentForDelete(s.id, currentUser?.id));
    setStudents((prev) => prev.filter((s) => s.section !== deletedSection));

    setDeleteClassOpen(false);
    setFilterSection("All");

    setClassDeleteMessage({
      visible: true,
      section: deletedSection,
      count: deletedCount,
    });

    setTimeout(() => {
      setClassDeleteMessage({ visible: false, section: "", count: 0 });
    }, 3000);

    // Same Electron dropdown-freeze issue as single-row delete — refocus
    // the window after the dialog closes so filters remain responsive.
    if (window.electronAPI?.forceRefocusWindow) {
      window.electronAPI.forceRefocusWindow();
    }
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
    <div className="students-page-container page" style={{ padding: "20px" }}>
      <div
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <div>
          <h1
            className="page-title"
            style={{ fontSize: "24px", fontWeight: "bold", margin: 0 }}
          >
            Learner Database
          </h1>
          <p
            className="page-sub"
            style={{ fontSize: "14px", color: "#64748b", margin: "4px 0 0 0" }}
          >
            Manage student profiles and health records
          </p>
        </div>
        {!readOnly && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              className="btn btn-primary"
              onClick={() => setAddOpen(true)}
              style={{
                background: "#0f172a",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              + Add Student
            </button>
          </div>
        )}
      </div>

      <>
        {/* Controls Filters */}
        <div className="filter-row">
          <input
            className="form-input search-input"
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
            }}
            placeholder="Search by name or LRN…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />

          <select
            className="form-select"
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#fff",
            }}
            value={filterSy}
            onChange={(e) => {
              setFilterSy(e.target.value);
              setFilterGrade("All");
              setFilterSection("All");
            }}
          >
            <option value="All">All School Years</option>
            {SCHOOL_YEARS.map((sy) => (
              <option key={sy} value={sy}>
                {sy}
              </option>
            ))}
          </select>

          <select
            className="form-select"
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#fff",
            }}
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
          >
            <option value="All">All Periods</option>
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            className="form-select"
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#fff",
            }}
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
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#fff",
            }}
            value={filterSection}
            onChange={(e) => setFilterSection(e.target.value)}
            disabled={filterGrade === "All"}
            title={
              filterGrade === "All" ? "Select a grade level first" : undefined
            }
          >
            <option value="All">All Sections</option>
            {availableSections.map((sec) => (
              <option key={sec.name} value={sec.name}>
                {sec.name} ({sec.count})
              </option>
            ))}
          </select>

          {!readOnly && filterGrade !== "All" && filterSection !== "All" && (
            <button
              type="button"
              className="btn-delete-class"
              onClick={() => setDeleteClassOpen(true)}
            >
              🗑 Delete Entire Class
            </button>
          )}
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

        {classDeleteMessage.visible && (
          <div className="success-toast">
            <div className="toast-icon">✓</div>
            <div>
              <div className="toast-title">Class Deleted Successfully</div>
              <div className="toast-text">
                {classDeleteMessage.count} learner
                {classDeleteMessage.count === 1 ? "" : "s"} removed from{" "}
                {classDeleteMessage.section}.
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Table Container Card - Fixed Scrollbar Location */}
        <div
          className="card scrollable-table-container"
          style={{ width: "100%", marginBottom: "20px" }}
        >
          <div
            className="table-scroll-track"
            style={{ minWidth: "max-content" }}
          >
            <table
              className="data-table"
              style={{ width: "100%", tableLayout: "fixed" }}
            >
              <colgroup>
                <col style={{ width: "190px" }} />
                <col style={{ width: "230px" }} />
                <col style={{ width: "70px" }} />
                <col style={{ width: "70px" }} />
                <col style={{ width: "240px" }} />
                <col style={{ width: "110px" }} />
                <col style={{ width: "170px" }} />
                <col style={{ width: "150px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "100px" }} />
                <col style={{ width: "110px" }} />
              </colgroup>
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
                {sortedFiltered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={12}
                      className="muted"
                      style={{ textAlign: "center", padding: "2rem" }}
                    >
                      No students found.
                    </td>
                  </tr>
                ) : (
                  sortedFiltered.map((s) => {
                    const rec =
                      s.records.find(
                        (r) =>
                          (filterSy === "All" || r.sy === filterSy) &&
                          (filterPeriod === "All" || r.q === filterPeriod),
                      ) ||
                      (s.records.length
                        ? s.records[s.records.length - 1]
                        : null);

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
                        className="clickable-row"
                      >
                        <td>
                          <div className="cell-truncate">
                            {s.lrn && s.lrn !== "—" ? (
                              s.lrn
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </div>
                          {s.registryNo && (
                            <div
                              className="registry-number-sub"
                              title={s.registryNo}
                            >
                              🔖 {s.registryNo}
                            </div>
                          )}
                        </td>
                        <td className="name-cell">
                          <div className="cell-truncate" title={s.name}>
                            {s.name}
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>{s.age}</td>
                        <td style={{ textAlign: "center" }}>{s.sex}</td>
                        <td style={{ textAlign: "center" }}>
                          <div className="cell-truncate" title={s.section}>
                            {s.section}
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {bmi ? (
                            bmi.toFixed(1)
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "center",
                            }}
                          >
                            {status ? (
                              <Badge
                                label={status.label}
                                color={status.color}
                                bg={status.bg}
                              />
                            ) : (
                              <span className="no-data-tag">No data</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "center",
                            }}
                          >
                            {hfa ? (
                              <Badge
                                label={hfa.label}
                                color={hfa.color}
                                bg={hfa.bg}
                              />
                            ) : (
                              <span className="no-data-tag">No data</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <select
                            value={s.parentConsent || "N"}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              updateStudentField(
                                s.id,
                                "parentConsent",
                                e.target.value,
                              )
                            }
                            style={{
                              maxWidth: "60px",
                              margin: "0 auto",
                              display: "block",
                            }}
                          >
                            <option value="Y">Y</option>
                            <option value="N">N</option>
                          </select>
                        </td>
                        <td>
                          <select
                            value={s.member4ps || "N"}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              updateStudentField(
                                s.id,
                                "member4ps",
                                e.target.value,
                              )
                            }
                            style={{
                              maxWidth: "60px",
                              margin: "0 auto",
                              display: "block",
                            }}
                          >
                            <option value="Y">Y</option>
                            <option value="N">N</option>
                          </select>
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
        </div>
      </>

      {deleteClassOpen && (
        <Modal
          title="Delete Entire Class"
          onClose={() => setDeleteClassOpen(false)}
        >
          <p style={{ fontSize: "14px", color: "#334155", lineHeight: 1.6 }}>
            You're about to permanently delete <strong>{filterSection}</strong>{" "}
            — this will remove <strong>{classDeleteTargetCount}</strong> learner
            {classDeleteTargetCount === 1 ? "" : "s"} and all of their health
            records. This cannot be undone.
          </p>
          <div className="modal-footer">
            <button
              className="btn btn-secondary"
              onClick={() => setDeleteClassOpen(false)}
            >
              Cancel
            </button>
            <button
              className="btn-delete"
              style={{ width: "auto", padding: "8px 18px" }}
              onClick={confirmDeleteClass}
            >
              Delete Class
            </button>
          </div>
        </Modal>
      )}

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
