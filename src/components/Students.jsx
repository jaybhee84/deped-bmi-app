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
import { queueStudentForDelete } from "../utils/syncService";
import { getStudentIdentifier } from "../utils/registry";
import CSVUpload from "./CSVUpload";

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
  const [filterGrade, setFilterGrade] = useState("All");
  const [filterSection, setFilterSection] = useState("All");
  const [searchQ, setSearchQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
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

    const counts = filteredStudents.reduce((acc, student) => {
      acc[student.section] = (acc[student.section] || 0) + 1;
      return acc;
    }, {});

    let list = [...new Set(filteredStudents.map((s) => s.section))];

    if (filterGrade !== "All") {
      list = list.filter((section) => section.startsWith(filterGrade));
    }

    return list.sort().map((sectionName) => ({
      name: sectionName,
      count: counts[sectionName] || 0,
    }));
  }, [students, filterSy, filterGrade]);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const matchSy =
        filterSy === "All" || s.records?.some((r) => r.sy === filterSy);

      const matchGrade =
        filterGrade === "All" || s.section.startsWith(filterGrade);

      const matchSec = filterSection === "All" || s.section === filterSection;

      const matchQ =
        searchQ === "" ||
        s.name.toLowerCase().includes(searchQ.toLowerCase()) ||
        s.lrn.includes(searchQ);

      return matchSy && matchGrade && matchSec && matchQ;
    });
  }, [students, filterSy, filterGrade, filterSection, searchQ]);

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
            Students
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
            <CSVUpload
              students={students}
              setStudents={setStudents}
              open={csvOpen}
              setOpen={setCsvOpen}
            />
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

      {!csvOpen && (
        <>
          {/* Controls Filters */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              marginBottom: "24px",
              flexWrap: "wrap",
            }}
          >
            <input
              className="form-input"
              style={{
                width: "260px",
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
            >
              <option value="All">All Sections</option>
              {availableSections.map((sec) => (
                <option key={sec.name} value={sec.name}>
                  {sec.name} ({sec.count})
                </option>
              ))}
            </select>
          </div>

          {saveMessage.visible && (
            <div
              style={{
                position: "fixed",
                top: "24px",
                right: "24px",
                background: "#16a34a",
                color: "#ffffff",
                padding: "14px 22px",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: "600",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
                zIndex: 99999,
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div style={{ fontSize: "18px" }}>✓</div>
              <div>
                <div style={{ fontWeight: "700" }}>Saved Successfully</div>
                <div
                  style={{ fontWeight: "400", fontSize: "12px", opacity: 0.9 }}
                >
                  {saveMessage.name} was updated.
                </div>
              </div>
            </div>
          )}

          {/* Optimized responsive container wrapper */}
          <div
            style={{
              width: "100%",
              maxHeight: "calc(100vh - 220px)",
              overflow: "auto",
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <table
              style={{
                width: "1550px",
                minWidth: "1550px",
                tableLayout: "fixed",
                borderCollapse: "collapse",
                margin: 0,
              }}
            >
              <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                <tr style={{ background: "#5D9C32" }}>
                  <th
                    style={{
                      width: "150px",
                      minWidth: "150px",
                      padding: "12px 14px",
                      color: "#ffffff",
                      fontWeight: "600",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      textAlign: "left",
                    }}
                  >
                    LRN
                  </th>
                  <th
                    style={{
                      width: "240px",
                      minWidth: "240px",
                      padding: "12px 14px",
                      color: "#ffffff",
                      fontWeight: "600",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      textAlign: "left",
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      width: "80px",
                      minWidth: "80px",
                      padding: "12px 14px",
                      color: "#ffffff",
                      fontWeight: "600",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      textAlign: "center",
                    }}
                  >
                    Age
                  </th>
                  <th
                    style={{
                      width: "80px",
                      minWidth: "80px",
                      padding: "12px 14px",
                      color: "#ffffff",
                      fontWeight: "600",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      textAlign: "center",
                    }}
                  >
                    Sex
                  </th>
                  <th
                    style={{
                      width: "180px",
                      minWidth: "180px",
                      padding: "12px 14px",
                      color: "#ffffff",
                      fontWeight: "600",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      textAlign: "left",
                    }}
                  >
                    Section
                  </th>
                  <th
                    style={{
                      width: "110px",
                      minWidth: "110px",
                      padding: "12px 14px",
                      color: "#ffffff",
                      fontWeight: "600",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      textAlign: "center",
                    }}
                  >
                    Latest BMI
                  </th>
                  <th
                    style={{
                      width: "180px",
                      minWidth: "180px",
                      padding: "12px 14px",
                      color: "#ffffff",
                      fontWeight: "600",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      textAlign: "center",
                    }}
                  >
                    Nutritional Status
                  </th>
                  <th
                    style={{
                      width: "140px",
                      minWidth: "140px",
                      padding: "12px 14px",
                      color: "#ffffff",
                      fontWeight: "600",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      textAlign: "center",
                    }}
                  >
                    HFA Status
                  </th>
                  <th
                    style={{
                      width: "100px",
                      minWidth: "100px",
                      padding: "12px 14px",
                      color: "#ffffff",
                      fontWeight: "600",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      textAlign: "center",
                    }}
                  >
                    Consent
                  </th>
                  <th
                    style={{
                      width: "100px",
                      minWidth: "100px",
                      padding: "12px 14px",
                      color: "#ffffff",
                      fontWeight: "600",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      textAlign: "center",
                    }}
                  >
                    4Ps
                  </th>
                  <th
                    style={{
                      width: "90px",
                      minWidth: "90px",
                      padding: "12px 14px",
                      color: "#ffffff",
                      fontWeight: "600",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      textAlign: "center",
                    }}
                  >
                    Prev SBFP
                  </th>
                  <th
                    style={{
                      width: "100px",
                      minWidth: "100px",
                      padding: "12px 14px",
                      color: "#ffffff",
                      fontWeight: "600",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      textAlign: "center",
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={12}
                      style={{
                        textAlign: "center",
                        padding: "2rem",
                        color: "#94a3b8",
                        fontSize: "14px",
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
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          cursor: "pointer",
                        }}
                      >
                        <td
                          style={{
                            width: "150px",
                            minWidth: "150px",
                            padding: "12px 14px",
                            textAlign: "left",
                          }}
                        >
                          <div
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {s.lrn && s.lrn !== "—" ? (
                              s.lrn
                            ) : (
                              <span style={{ color: "#94a3b8" }}>—</span>
                            )}
                          </div>
                          {s.registryNo && (
                            <div
                              style={{
                                fontSize: "10px",
                                color: "#94a3b8",
                                marginTop: "2px",
                              }}
                            >
                              🔖 {s.registryNo}
                            </div>
                          )}
                        </td>
                        <td
                          style={{
                            width: "240px",
                            minWidth: "240px",
                            padding: "12px 14px",
                            fontWeight: "600",
                            textAlign: "left",
                          }}
                        >
                          <div
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {s.name}
                          </div>
                        </td>
                        <td
                          style={{
                            width: "80px",
                            minWidth: "80px",
                            padding: "12px 14px",
                            textAlign: "center",
                          }}
                        >
                          {s.age}
                        </td>
                        <td
                          style={{
                            width: "80px",
                            minWidth: "80px",
                            padding: "12px 14px",
                            textAlign: "center",
                          }}
                        >
                          {s.sex}
                        </td>
                        <td
                          style={{
                            width: "180px",
                            minWidth: "180px",
                            padding: "12px 14px",
                            textAlign: "left",
                          }}
                        >
                          <div
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {s.section}
                          </div>
                        </td>
                        <td
                          style={{
                            width: "110px",
                            minWidth: "110px",
                            padding: "12px 14px",
                            textAlign: "center",
                          }}
                        >
                          {bmi ? (
                            bmi.toFixed(1)
                          ) : (
                            <span style={{ color: "#94a3b8" }}>—</span>
                          )}
                        </td>
                        <td
                          style={{
                            width: "180px",
                            minWidth: "180px",
                            padding: "12px 14px",
                            textAlign: "center",
                          }}
                        >
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
                              <span
                                style={{
                                  fontSize: "12px",
                                  color: "#94a3b8",
                                  fontStyle: "italic",
                                }}
                              >
                                No data
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          style={{
                            width: "140px",
                            minWidth: "140px",
                            padding: "12px 14px",
                            textAlign: "center",
                          }}
                        >
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
                              <span
                                style={{
                                  fontSize: "12px",
                                  color: "#94a3b8",
                                  fontStyle: "italic",
                                }}
                              >
                                No data
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          style={{
                            width: "100px",
                            minWidth: "100px",
                            padding: "12px 14px",
                            textAlign: "center",
                          }}
                        >
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
                              width: "60px",
                              height: "30px",
                              border: "1px solid #cbd5e1",
                              borderRadius: "4px",
                              margin: "0 auto",
                              display: "block",
                              textAlign: "center",
                              textAlignLast: "center",
                            }}
                          >
                            <option value="Y">Y</option>
                            <option value="N">N</option>
                          </select>
                        </td>
                        <td
                          style={{
                            width: "100px",
                            minWidth: "100px",
                            padding: "12px 14px",
                            textAlign: "center",
                          }}
                        >
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
                              width: "60px",
                              height: "30px",
                              border: "1px solid #cbd5e1",
                              borderRadius: "4px",
                              margin: "0 auto",
                              display: "block",
                              textAlign: "center",
                              textAlignLast: "center",
                            }}
                          >
                            <option value="Y">Y</option>
                            <option value="N">N</option>
                          </select>
                        </td>
                        <td
                          style={{
                            width: "90px",
                            minWidth: "90px",
                            padding: "12px 14px",
                            textAlign: "center",
                          }}
                        >
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
                          style={{
                            width: "100px",
                            minWidth: "100px",
                            padding: "12px 14px",
                            textAlign: "center",
                          }}
                        >
                          {!readOnly &&
                            (s.hasUnsavedChanges ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  saveStudentChanges(s);
                                }}
                                style={{
                                  background: "#16a34a",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: "4px",
                                  padding: "4px 8px",
                                  cursor: "pointer",
                                  fontSize: "11px",
                                  fontWeight: "bold",
                                }}
                              >
                                Save
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteStudent(s);
                                }}
                                style={{
                                  background: "#dc2626",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: "4px",
                                  padding: "4px 8px",
                                  cursor: "pointer",
                                  fontSize: "11px",
                                  fontWeight: "bold",
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
        </>
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
