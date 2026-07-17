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
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPhotoDeleteConfirm, setShowPhotoDeleteConfirm] = useState(false);
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
    setShowConfirmModal(false);
    setRec({ sy: "2025–2026", q: "Q1", date: "", weight: "", height: "" });
  }

  function deletePhoto() {
    setStudents((prev) =>
      prev.map((s) => (s.id === student.id ? { ...s, photo: null } : s)),
    );
    setShowPhotoDeleteConfirm(false);
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

      <div
        className="profile-grid"
        style={{ display: "flex", alignItems: "stretch", gap: "24px" }}
      >
        {/* Info card (Left) */}
        <div
          className="card profile-info-card"
          style={{
            flex: "0 0 320px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "24px 16px",
            margin: "0",
          }}
        >
          {/* Enlarged photo container with right-click handler */}
          <div
            className="avatar avatar-clickable"
            style={{
              width: "200px",
              height: "200px",
              borderRadius: "12px",
              overflow: "hidden",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#f1f5f9",
              border: "2px dashed #cbd5e1",
              fontSize: "42px",
              fontWeight: "bold",
              cursor: "pointer",
              position: "relative",
            }}
            onClick={() => fileInputRef.current?.click()}
            onContextMenu={(e) => {
              e.preventDefault(); // Prevents standard system context menu
              if (student.photo) {
                setShowPhotoDeleteConfirm(true);
              }
            }}
            title={
              student.photo
                ? "Left-click to change photo. Right-click to delete photo."
                : "Left-click to upload photo."
            }
          >
            {student.photo ? (
              <img
                src={student.photo}
                alt={student.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
          <div
            className="profile-name"
            style={{
              fontSize: "18px",
              fontWeight: "700",
              marginBottom: "20px",
            }}
          >
            {student.name}
          </div>
          <div className="profile-meta-list" style={{ width: "100%" }}>
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

        {/* Records container (Right) */}
        <div
          className="profile-right"
          style={{ flex: "1", display: "flex", flexDirection: "column" }}
        >
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

          <div
            className="profile-table-scroll-container"
            style={{ flex: "1", display: "flex", flexDirection: "column" }}
          >
            {student.records.length === 0 ? (
              <div className="card empty-cell" style={{ flex: "1" }}>
                No records yet. Add a measurement above.
              </div>
            ) : (
              <div
                className="standalone-vertical-records-list"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "24px",
                  flex: "1",
                }}
              >
                {records.map((r, i) => {
                  const bmi = calcBMI(r.weight, r.height);
                  const status = bmi
                    ? getBMIStatus(bmi, student.sex, student.birthdate)
                    : null;
                  const haz = getHAZStatus(
                    r.height,
                    student.sex,
                    student.birthdate,
                  );

                  const verticalData = [
                    ["SCHOOL YEAR", r.sy],
                    ["QUARTER", r.q],
                    ["DATE", r.date],
                    ["WEIGHT", `${r.weight} kg`],
                    ["HEIGHT", `${r.height} cm`],
                    ["BMI", bmi ? bmi.toFixed(2) : "—"],
                    [
                      "NUTRITIONAL STATUS",
                      status ? (
                        <Badge
                          label={status.label}
                          color={status.color}
                          bg={status.bg}
                        />
                      ) : (
                        "—"
                      ),
                    ],
                    [
                      "HFA",
                      haz ? (
                        <Badge
                          label={haz.label}
                          color={haz.color}
                          bg={haz.bg}
                        />
                      ) : (
                        "—"
                      ),
                    ],
                  ];

                  return (
                    <div
                      className="card standalone-vertical-card"
                      key={i}
                      style={{
                        padding: "0",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                        borderRadius: "8px",
                        backgroundColor: "#ffffff",
                        border: "1px solid #e2e8f0",
                        overflow: "hidden",
                        maxWidth: "520px",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "12px 16px",
                          backgroundColor: "#f8fafc",
                          borderBottom: "1px solid #e2e8f0",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: "700",
                            color: "#334155",
                            fontSize: "14px",
                          }}
                        >
                          Registry No.{" "}
                          {student.registryNo || r.registryNo || "—"}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          flex: "1",
                        }}
                      >
                        {verticalData.map(([label, data], idx) => (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              flex: "1",
                              borderBottom:
                                idx === verticalData.length - 1
                                  ? "none"
                                  : "1px solid #e2e8f0",
                            }}
                          >
                            <div
                              style={{
                                backgroundColor: "#5cb85c",
                                color: "#ffffff",
                                fontSize: "11px",
                                fontWeight: "700",
                                letterSpacing: "0.5px",
                                textAlign: "left",
                                width: "180px",
                                padding: "12px 16px",
                                alignSelf: "stretch",
                                display: "flex",
                                alignItems: "center",
                                borderRight: "1px solid #4cae4c",
                              }}
                            >
                              {label}
                            </div>

                            <div
                              style={{
                                fontWeight: "600",
                                color: "#1e293b",
                                textAlign: "left",
                                flex: "1",
                                padding: "12px 16px",
                                fontSize: "14px",
                                display: "flex",
                                alignItems: "center",
                              }}
                            >
                              {data}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {!readOnly && student.records.length > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                width: "100%",
                maxWidth: "520px",
                marginTop: "16px",
              }}
            >
              <button
                className="btn btn-primary"
                style={{ padding: "10px 24px", fontWeight: "600" }}
                onClick={() => setShowConfirmModal(true)}
              >
                Save Changes
              </button>
            </div>
          )}

          {student.records.length > 1 && (
            <div className="card" style={{ marginTop: "24px" }}>
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
            <button
              className="btn btn-primary"
              onClick={() => setShowConfirmModal(true)}
            >
              Save Record
            </button>
          </div>
        </Modal>
      )}

      {/* Custom Safe Dialog for Saving Changes */}
      {showConfirmModal && (
        <Modal
          title="Confirm Save Operation"
          onClose={() => setShowConfirmModal(false)}
        >
          <p style={{ padding: "8px 0", color: "#334155", fontSize: "15px" }}>
            Are you sure you want to commit these changes to the registry?
          </p>
          <div className="modal-footer" style={{ marginTop: "16px" }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowConfirmModal(false)}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveRecord}>
              Confirm & Save
            </button>
          </div>
        </Modal>
      )}

      {/* Electron Safe Custom Dialog for Deleting Student Profile Picture */}
      {showPhotoDeleteConfirm && (
        <Modal
          title="Delete Student Image"
          onClose={() => setShowPhotoDeleteConfirm(false)}
        >
          <p style={{ padding: "8px 0", color: "#334155", fontSize: "15px" }}>
            Are you sure you want to completely remove this student's profile
            photo?
          </p>
          <div className="modal-footer" style={{ marginTop: "16px" }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowPhotoDeleteConfirm(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-danger"
              style={{ backgroundColor: "#dc2626", color: "#ffffff" }}
              onClick={deletePhoto}
            >
              Delete Photo
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
