import React, { useState, useRef } from "react";
import {
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  SCHOOL_YEARS,
  QUARTERS,
} from "../utils/bmi";
import Badge from "./Badge";
import Modal from "./Modal";
import "./Profile.css";

export default function Profile({
  studentId,
  students,
  setStudents,
  onBack,
  readOnly,
}) {
  const student = students.find((s) => s.id === studentId);
  const [addOpen, setAddOpen] = useState(false);
  const fileInputRef = useRef(null);
  const [rec, setRec] = useState({
    sy: "2025–2026",
    q: "Q1",
    date: "",
    weight: "",
    height: "",
  });

  if (!student) return null;

  const initials =
    (student.name.split(",")[1]?.trim()[0] || "?") + student.name[0];

  function saveRecord() {
    if (!rec.date || !rec.weight || !rec.height) return;
    const newRec = {
      ...rec,
      weight: parseFloat(rec.weight),
      height: parseFloat(rec.height),
    };
    setStudents((prev) =>
      prev.map((s) =>
        s.id === student.id ? { ...s, records: [...s.records, newRec] } : s,
      ),
    );
    setAddOpen(false);
    setRec({ sy: "2025–2026", q: "Q1", date: "", weight: "", height: "" });
  }
  function deleteRecord(recordIndex) {
    if (
      !window.confirm("Are you sure you want to delete this health record?")
    ) {
      return;
    }

    setStudents((prev) =>
      prev.map((s) => {
        if (s.id !== student.id) return s;

        return {
          ...s,
          records: s.records.filter((_, index) => index !== recordIndex),
        };
      }),
    );
  }

  const previewBMI =
    rec.weight && rec.height ? calcBMI(rec.weight, rec.height) : null;
  const previewStatus = previewBMI ? getBMIStatus(previewBMI) : null;

  const records = [...student.records].reverse();

  return (
    <div className="page">
      <div className="profile-back-row">
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back to Students
        </button>
      </div>

      <div className="profile-grid">
        {/* Info card */}
        <div className="card profile-info-card">
          <div
            className="avatar avatar-clickable"
            onClick={() => fileInputRef.current?.click()}
          >
            {student.photo ? (
              <img
                src={student.photo}
                alt={student.name}
                className="profile-photo"
              />
            ) : (
              initials
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];

              if (!file) return;

              const reader = new FileReader();

              reader.onload = () => {
                setStudents((prev) =>
                  prev.map((s) =>
                    s.id === student.id ? { ...s, photo: reader.result } : s,
                  ),
                );
              };

              reader.readAsDataURL(file);
            }}
          />
          <div className="profile-name">{student.name}</div>
          <div className="profile-meta-list">
            {[
              ["LRN", student.lrn],
              ["Age", student.age],
              ["Sex", student.sex === "M" ? "Male" : "Female"],
              ["Section", student.section],
              ["Total Records", student.records.length],
            ].map(([k, v]) => (
              <div key={k} className="meta-row">
                <span className="meta-key">{k}</span>
                <span className="meta-val">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Records */}
        <div className="profile-right">
          <div className="records-header">
            <h2 className="section-title">Health Records</h2>
            {!readOnly && (
              <button
                className="btn btn-primary"
                onClick={() => setAddOpen(true)}
              >
                + Add Record
              </button>
            )}
          </div>

          <div className="card">
            {student.records.length === 0 ? (
              <div className="empty-cell">
                No records yet. Add a measurement above.
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>School Year</th>
                    <th>Quarter</th>
                    <th>Date</th>
                    <th>Weight (kg)</th>
                    <th>Height (cm)</th>
                    <th>BMI</th>
                    <th>Nutritional Status</th>
                    <th>HFA</th>
                    {!readOnly && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => {
                    const bmi = calcBMI(r.weight, r.height);
                    const status = bmi
                      ? getBMIStatus(bmi, student.sex, student.birthdate)
                      : null;
                    return (
                      <tr key={i}>
                        <td>{r.sy}</td>
                        <td>{r.q}</td>
                        <td>{r.date}</td>
                        <td>{r.weight}</td>
                        <td>{r.height}</td>
                        <td>{bmi ? bmi.toFixed(2) : "—"}</td>
                        <td>
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
                        <td>
                          {(() => {
                            const haz = getHAZStatus(
                              r.height,
                              student.sex,
                              student.birthdate,
                            );
                            return haz ? (
                              <Badge
                                label={haz.label}
                                color={haz.color}
                                bg={haz.bg}
                              />
                            ) : (
                              "—"
                            );
                          })()}
                        </td>
                        {!readOnly && (
                          <td>
                            <button
                              className="btn-danger"
                              onClick={() =>
                                deleteRecord(student.records.length - 1 - i)
                              }
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* BMI Trend */}
          {student.records.length > 1 && (
            <div className="card">
              <h3 className="card-title">BMI Trend</h3>
              <div className="trend-chart">
                {student.records.map((r, i) => {
                  const bmi = calcBMI(r.weight, r.height);
                  if (!bmi) return null;
                  const barH = Math.max(10, Math.min(80, (bmi / 40) * 80));
                  const status = getBMIStatus(
                    bmi,
                    student.sex,
                    student.birthdate,
                  );
                  return (
                    <div key={i} className="trend-bar-group">
                      <div className="trend-bmi-label">{bmi.toFixed(1)}</div>
                      <div
                        className="trend-bar"
                        style={{ height: barH, background: status.color }}
                        title={`${r.sy} ${r.q}: BMI ${bmi.toFixed(1)} — ${status.label}`}
                      />
                      <div className="trend-quarter-label">{r.q}</div>
                      <div className="trend-sy-label">{r.sy.split("–")[0]}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {addOpen && (
        <Modal title="Add Health Record" onClose={() => setAddOpen(false)}>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">School Year</label>
              <select
                className="form-select full-width"
                value={rec.sy}
                onChange={(e) => setRec((r) => ({ ...r, sy: e.target.value }))}
              >
                {SCHOOL_YEARS.map((sy) => (
                  <option key={sy}>{sy}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Quarter</label>
              <select
                className="form-select full-width"
                value={rec.q}
                onChange={(e) => setRec((r) => ({ ...r, q: e.target.value }))}
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
                value={rec.date}
                onChange={(e) =>
                  setRec((r) => ({ ...r, date: e.target.value }))
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Weight (kg)</label>
              <input
                type="number"
                className="form-input"
                placeholder="e.g. 38.5"
                value={rec.weight}
                onChange={(e) =>
                  setRec((r) => ({ ...r, weight: e.target.value }))
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Height (cm)</label>
              <input
                type="number"
                className="form-input"
                placeholder="e.g. 145"
                value={rec.height}
                onChange={(e) =>
                  setRec((r) => ({ ...r, height: e.target.value }))
                }
              />
            </div>
          </div>

          {previewBMI && previewStatus && (
            <div className="bmi-preview">
              <strong>BMI Preview:</strong> {previewBMI.toFixed(1)} —{" "}
              <span style={{ color: previewStatus.color, fontWeight: 600 }}>
                {previewStatus.label}
              </span>
            </div>
          )}

          <div className="modal-footer">
            <button
              className="btn btn-secondary"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveRecord}>
              Save Record
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
