import React, { useState, useMemo } from "react";
import "./Database.css";
import {
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  formatHeightMeters,
  SECTIONS,
  GRADE_LEVELS,
  SCHOOL_YEARS,
} from "../utils/bmi";
import Badge from "./Badge";
import Modal from "./Modal";
import {
  queueStudentForDelete,
  queueStudentForSync,
} from "../utils/syncService";
import { getStudentIdentifier } from "../utils/registry";
import { getCurrentSchoolYear } from "../utils/bmi";
import { filterByLearnerScope, useSbfpConfig } from "../utils/sbfpBeneficiary";
import LearnerScopeSelect from "./LearnerScopeSelect";
import {
  applyClassEdit,
  classAdviser,
  normalizeClassName,
  sectionWithAdviser,
} from "../utils/classEdit";
import { advisersForGrade, useSchoolAdvisers } from "../utils/schoolAdvisers";
import { useSchoolScope } from "../context/SchoolContext";

const PERIODS = ["Baseline", "Midline", "Endline"];

function hasPreviousYearData(student, currentSy) {
  if (!student?.records?.length) {
    return false;
  }

  const [startYear] = currentSy.split("–");
  const previousSy = `${parseInt(startYear) - 1}–${startYear}`;

  return student.records.some((record) => record.sy === previousSy);
}

// Formats a birthdate string to MM/DD/YYYY for display.
// Parses "YYYY-MM-DD" manually (rather than `new Date(str)`) to avoid the
// UTC-midnight timezone shift bug where a bare date string can render as
// the previous day depending on the user's local timezone.
function formatBirthdate(birthdate) {
  if (!birthdate) return "";

  const match = String(birthdate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${month}/${day}/${year}`;
  }

  // Fallback for any other format (e.g. already a Date object or a
  // differently-formatted string) — let the Date parser take a shot.
  const parsed = new Date(birthdate);
  if (isNaN(parsed.getTime())) return String(birthdate);

  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  const yyyy = parsed.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
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
  const [learnerScope, setLearnerScope] = useState("all");
  const sbfpConfig = useSbfpConfig();
  const [addOpen, setAddOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState({
    visible: false,
    name: "",
  });
  const [deleteClassOpen, setDeleteClassOpen] = useState(false);
  // { from, section, adviser, originalAdviser } while the Edit Class dialog is open.
  const [classEdit, setClassEdit] = useState(null);
  const [classEditMessage, setClassEditMessage] = useState("");
  const { school } = useSchoolScope();
  // IECES: Project Rising org chart. Other schools: their Class Advisers tab.
  const { advisers: schoolAdvisers } = useSchoolAdvisers(school?.school_id);
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

  // Display-only filter: edits and class deletes below still use `students`.
  const scopedStudents = useMemo(
    () =>
      filterByLearnerScope(
        students,
        learnerScope,
        filterSy === "All" ? getCurrentSchoolYear() : filterSy,
        sbfpConfig,
      ),
    [students, learnerScope, filterSy, sbfpConfig],
  );

  const availableSections = useMemo(() => {
    const counts = scopedStudents.reduce((acc, student) => {
      acc[student.section] = (acc[student.section] || 0) + 1;
      return acc;
    }, {});

    let list = [...new Set(scopedStudents.map((s) => s.section).filter(Boolean))];

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
  }, [scopedStudents, filterGrade]);

  const filtered = useMemo(() => {
    return scopedStudents.filter((s) => {
      const matchGrade =
        filterGrade === "All" ||
        String(s.section || "").startsWith(filterGrade);

      const matchSec = filterSection === "All" || s.section === filterSection;

      const matchQ =
        searchQ === "" ||
        String(s.name || "")
          .toLowerCase()
          .includes(searchQ.toLowerCase()) ||
        String(getStudentIdentifier(s)).toLowerCase().includes(searchQ.toLowerCase());

      return matchGrade && matchSec && matchQ;
    });
  }, [scopedStudents, filterGrade, filterSection, searchQ]);

  // Always show Male learners first, then Female, alphabetical by name
  // within each — regardless of which filters are active.
  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const sexRank = (s) => {
        const code = String(s.sex || "").trim().toUpperCase().charAt(0);
        return code === "M" ? 0 : code === "F" ? 1 : 2;
      };
      return (
        sexRank(a) - sexRank(b) ||
        String(a.name || "").localeCompare(String(b.name || ""))
      );
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
      if (window.sqlite?.saveStudents) {
        await window.sqlite.saveStudents(
          students.map((s) =>
            s.id === student.id
              ? { ...s, hasUnsavedChanges: false }
              : s,
          ),
          true,
        );
      }

      queueStudentForSync(student.id);

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

  // The class's grade advisers, as "Juan D. Eliot".
  const classEditGrade = String(classEdit?.from || "").split(" - ")[0].trim();
  const classAdviserOptions = useMemo(
    () =>
      advisersForGrade(schoolAdvisers, classEditGrade).map((adviser) => ({
        name: adviser.displayName,
        familyName: adviser.family,
      })),
    [schoolAdvisers, classEditGrade],
  );
  // Compared and filtered by the name as it will be saved (first-letter capitals).
  const classEditName = classEdit ? normalizeClassName(classEdit.section) : "";
  const classEditMerges =
    !!classEdit &&
    classEditName !== classEdit.from &&
    students.some((s) => s.section === classEditName);

  const classEditCount = classEdit
    ? students.filter((s) => s.section === classEdit.from).length
    : 0;

  function openClassEdit(section = filterSection) {
    if (!section || section === "All") return;
    const adviser = classAdviser(students, section);
    setClassEdit({
      from: section,
      section,
      adviser,
      originalAdviser: adviser,
    });
  }

  function changeClassEditAdviser(value) {
    // Picking an org chart adviser also corrects the name in the class label.
    const picked = classAdviserOptions.find((option) => option.name === value);
    setClassEdit((edit) => ({
      ...edit,
      adviser: value,
      section: picked
        ? sectionWithAdviser(edit.section, picked.familyName)
        : edit.section,
    }));
  }

  function saveClassEdit() {
    if (!classEdit || !classEditName) return;
    const changes = { section: classEditName };
    if (classEdit.adviser.trim() !== classEdit.originalAdviser.trim()) {
      changes.adviser = classEdit.adviser;
    }
    // Nothing changed: don't re-save (and re-upload) every learner in the class.
    if (classEditName === classEdit.from && !("adviser" in changes)) {
      setClassEdit(null);
      return;
    }
    const count = classEditCount;
    setStudents((prev) => applyClassEdit(prev, classEdit.from, changes));
    setFilterSection(classEditName);
    setClassEdit(null);
    setClassEditMessage(
      `${count} learner${count === 1 ? "" : "s"} updated in ${classEditName}.`,
    );
    setTimeout(() => setClassEditMessage(""), 3000);
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
        dewormed: "Y",
        parentConsent: "Y",
        member4ps: "N",
        records: [],
      },
    ]);
    setAddOpen(false);
    setForm({ lrn: "", name: "", age: "", sex: "M", section: "Grade 6" });
  }

  return (
    <div className="students-page-container page">
      <div className="page-header database-page-header">
        <div>
          <div className="database-eyebrow">Student records</div>
          <h1 className="page-title">Learner Database</h1>
          <p className="page-sub">Search, review, and update learner records.</p>
        </div>
        <div className="database-header-actions">
          <div className="database-counts" aria-label="Learner counts">
            <span><strong>{students.length}</strong> Total</span>
            <span><strong>{sortedFiltered.length}</strong> Shown</span>
          </div>
          {!readOnly && (
            <button
              className="btn btn-primary database-add-button"
              onClick={() => setAddOpen(true)}
            >
              + Add Student
            </button>
          )}
        </div>
      </div>

      <>
        {/* Controls Filters */}
        <div className="filter-row database-filter-panel">
          <input
            className="form-input search-input"
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
            }}
            placeholder="Search by name, LRN, or registry number…"
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

          <LearnerScopeSelect
            className="form-select"
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#fff",
            }}
            value={learnerScope}
            onChange={(value) => {
              setLearnerScope(value);
              setFilterSection("All");
            }}
          />

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

          {!readOnly && (
            <button
              type="button"
              className="btn-edit-class"
              onClick={() => openClassEdit()}
              disabled={filterSection === "All"}
              title={
                filterSection === "All"
                  ? "Select a grade level and section, or use the pencil in the Section column"
                  : `Edit ${filterSection}`
              }
            >
              ✎ Edit Class
            </button>
          )}
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

        {classEditMessage && (
          <div className="success-toast">
            <div className="toast-icon">✓</div>
            <div>
              <div className="toast-title">Class Updated</div>
              <div className="toast-text">{classEditMessage}</div>
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
                <col style={{ width: "110px" }} />
                <col style={{ width: "70px" }} />
                <col style={{ width: "70px" }} />
                <col style={{ width: "240px" }} />
                <col style={{ width: "80px" }} />
                <col style={{ width: "80px" }} />
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
                  <th>Birthdate</th>
                  <th>Age</th>
                  <th>Sex</th>
                  <th>Section</th>
                  <th>Weight</th>
                  <th>Height (m)</th>
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
                      colSpan={15}
                      className="muted"
                      style={{ textAlign: "center", padding: "2rem" }}
                    >
                      No students found.
                    </td>
                  </tr>
                ) : (
                  sortedFiltered.map((s) => {
                    const records = Array.isArray(s.records) ? s.records : [];
                    const matchingRecords = records.filter(
                      (r) =>
                        (filterSy === "All" || r.sy === filterSy) &&
                        (filterPeriod === "All" || r.q === filterPeriod),
                    );
                    const rec = matchingRecords.length
                      ? matchingRecords[matchingRecords.length - 1]
                      : null;

                    const bmi = rec ? calcBMI(rec.weight, rec.height) : null;
                    const status = bmi
                      ? getBMIStatus(bmi, s.sex, s.birthdate, rec.date)
                      : null;
                    const hfa = rec
                      ? getHAZStatus(rec.height, s.sex, s.birthdate, rec.date)
                      : null;
                    const previousSbfp = hasPreviousYearData(
                      s,
                      filterSy === "All" ? "2026–2027" : filterSy,
                    );

                    const previousSbfpValue =
                      s.previousSbfpBeneficiary === "Y" ||
                      s.previousSbfpBeneficiary === "N"
                        ? s.previousSbfpBeneficiary
                        : previousSbfp
                          ? "Y"
                          : "N";

                    return (
                      <tr
                        key={s.id}
                        onClick={() => onViewProfile(s)}
                        className="clickable-row"
                      >
                        <td>
                          <div
                            className={`cell-truncate${String(s.lrn ?? '').trim() && String(s.lrn).trim() !== '—' ? '' : ' muted'}`}
                            title={getStudentIdentifier(s)}
                          >
                            {getStudentIdentifier(s)}
                          </div>
                        </td>
                        <td className="name-cell">
                          <div className="cell-truncate" title={s.name}>
                            {s.name}
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {s.birthdate ? (
                            formatBirthdate(s.birthdate)
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>{s.age}</td>
                        <td style={{ textAlign: "center" }}>{s.sex}</td>
                        <td style={{ textAlign: "center" }}>
                          <div className="section-cell">
                            <div className="cell-truncate" title={s.section}>
                              {s.section}
                            </div>
                            {!readOnly && s.section && (
                              <button
                                type="button"
                                className="section-edit-button"
                                onClick={() => openClassEdit(s.section)}
                                title={`Edit class name or adviser for ${s.section}`}
                                aria-label={`Edit ${s.section}`}
                              >
                                ✎
                              </button>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {rec && rec.weight != null ? (
                            `${rec.weight} kg`
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {rec && rec.height != null ? (
                            `${formatHeightMeters(rec.height)} m`
                          ) : (
                            <span className="muted">—</span>
                          )}
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
                            value={s.parentConsent || "Y"}
                            disabled={readOnly}
                            className={`yn-select ${(s.parentConsent || "Y") === "Y" ? "is-yes" : "is-no"}`}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              updateStudentField(
                                s.id,
                                "parentConsent",
                                e.target.value,
                              )
                            }
                          >
                            <option value="Y">Y</option>
                            <option value="N">N</option>
                          </select>
                        </td>
                        <td>
                          <select
                            value={s.member4ps || "N"}
                            disabled={readOnly}
                            className={`yn-select ${(s.member4ps || "N") === "Y" ? "is-yes" : "is-no"}`}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              updateStudentField(
                                s.id,
                                "member4ps",
                                e.target.value,
                              )
                            }
                          >
                            <option value="Y">Y</option>
                            <option value="N">N</option>
                          </select>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <select
                            value={previousSbfpValue}
                            disabled={readOnly}
                            className={`yn-select ${previousSbfpValue === "Y" ? "is-yes" : "is-no"}`}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              updateStudentField(
                                s.id,
                                "previousSbfpBeneficiary",
                                e.target.value,
                              )
                            }
                          >
                            <option value="Y">Y</option>
                            <option value="N">N</option>
                          </select>
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

      {classEdit && (
        <Modal title="Edit Class" onClose={() => setClassEdit(null)}>
          <div className="class-edit-form">
            <div className="form-group">
              <label className="form-label" htmlFor="class-edit-adviser">
                Class Adviser
              </label>
              {classAdviserOptions.length > 0 ? (
                <select
                  id="class-edit-adviser"
                  className="form-select"
                  value={classEdit.adviser}
                  onChange={(e) => changeClassEditAdviser(e.target.value)}
                  autoFocus
                >
                  {!classAdviserOptions.some(
                    (option) => option.name === classEdit.adviser,
                  ) && (
                    <option value={classEdit.adviser}>
                      {classEdit.adviser || "Select adviser"}
                    </option>
                  )}
                  {classAdviserOptions.map((option) => (
                    <option key={option.name} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="class-edit-adviser"
                  className="form-input"
                  placeholder="e.g. Juan D. Dela Cruz"
                  value={classEdit.adviser}
                  onChange={(e) => changeClassEditAdviser(e.target.value)}
                  autoFocus
                />
              )}
              <span className="class-edit-hint">
                {classAdviserOptions.length
                  ? `${classEditGrade} advisers from your adviser list. Choosing one also corrects the class name.`
                  : "Printed under Prepared by on the NS Report."}
              </span>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="class-edit-name">
                Class Name
              </label>
              <input
                id="class-edit-name"
                className="form-input"
                value={classEdit.section}
                onChange={(e) =>
                  setClassEdit((edit) => ({ ...edit, section: e.target.value }))
                }
              />
              <span className="class-edit-hint">
                Applies to {classEditCount} learner
                {classEditCount === 1 ? "" : "s"} and their measurements
                taken in {classEdit.from}.
              </span>
            </div>
            {classEditMerges && (
              <p className="class-edit-warning" role="alert">
                {classEditName} already exists. Saving will merge these learners
                into it.
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button
              className="btn btn-secondary"
              onClick={() => setClassEdit(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!classEditName}
              onClick={saveClassEdit}
            >
              {classEditMerges ? "Merge Class" : "Save Changes"}
            </button>
          </div>
        </Modal>
      )}

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
