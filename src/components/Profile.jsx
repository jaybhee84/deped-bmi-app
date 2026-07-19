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
import MobileCaptureModal from "./MobileCaptureModal";
import "./Profile.css";

function MetricRow({ label, value }) {
  return (
    <div className="metric-item-row">
      <span className="metric-label-modern">{label}</span>
      <span className="metric-value-modern">{value}</span>
    </div>
  );
}

function HealthRecordCard({ record, student }) {
  const bmi = calcBMI(record.weight, record.height);
  const status = bmi ? getBMIStatus(bmi, student.sex, student.birthdate) : null;
  const haz = getHAZStatus(record.height, student.sex, student.birthdate);

  return (
    <div className="modern-record-card">
      <div className="card-header-modern">
        <span className="period-badge-label">{record.q}</span>
        <span className="registry-text">
          Registry No. {student.registryNo || record.registryNo || "—"}
        </span>
      </div>

      <div className="card-body-modern">
        <MetricRow label="School Year" value={record.sy} />
        <MetricRow label="Date Measured" value={record.date} />
        <MetricRow label="Weight" value={`${record.weight} kg`} />
        <MetricRow label="Height" value={`${record.height} cm`} />
        <MetricRow label="BMI" value={bmi ? bmi.toFixed(2) : "—"} />
        <MetricRow
          label="Nutritional Status"
          value={
            status ? (
              <Badge label={status.label} color={status.color} bg={status.bg} />
            ) : (
              "—"
            )
          }
        />
        <MetricRow
          label="HFA Status"
          value={
            haz ? (
              <Badge label={haz.label} color={haz.color} bg={haz.bg} />
            ) : (
              "—"
            )
          }
        />
      </div>
    </div>
  );
}

export default function Profile({
  studentId,
  students,
  setStudents,
  onBack,
  readOnly,
  supabase,
}) {
  const student = students.find((s) => s.id === studentId);
  const [addOpen, setAddOpen] = useState(false);
  const [mobileSyncOpen, setMobileSyncOpen] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [showPhotoDeleteConfirm, setShowPhotoDeleteConfirm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [saveStatusMessage, setSaveStatusMessage] = useState(null);
  const [isInlineSaving, setIsInlineSaving] = useState(false);
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

  const safeRegistryName = student.registryNo
    ? student.registryNo.replace(/[^a-zA-Z0-9-_]/g, "_")
    : `student_${student.id}`;

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
    triggerStatusFeedback("Measurement added locally.");
  }

  function triggerStatusFeedback(msg) {
    setSaveStatusMessage(msg);
    setTimeout(() => {
      setSaveStatusMessage(null);
    }, 4000);
  }

  async function handleManualPhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result;

      setStudents((prev) =>
        prev.map((s) =>
          s.id === student.id
            ? { ...s, photo: base64Data, sync_status: "pending_sync" }
            : s,
        ),
      );

      if (window.electronAPI?.saveToSQLite) {
        await window.electronAPI.saveToSQLite({
          id: student.id,
          photo: base64Data,
          sync_status: "pending_sync",
        });
      }

      if (supabase && navigator.onLine) {
        try {
          setIsUploading(true);
          const fileExt = file.name.split(".").pop() || "jpg";
          const fileName = `${safeRegistryName}.${fileExt}`;
          const filePath = `avatars/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("profiles")
            .upload(filePath, file, {
              upsert: true,
              contentType: `image/${fileExt}`,
            });

          if (uploadError) throw uploadError;

          const {
            data: { publicUrl },
          } = supabase.storage.from("profiles").getPublicUrl(filePath);

          setStudents((prev) =>
            prev.map((s) =>
              s.id === student.id
                ? { ...s, photo: publicUrl, sync_status: "synced" }
                : s,
            ),
          );

          if (window.electronAPI?.saveToSQLite) {
            await window.electronAPI.saveToSQLite({
              id: student.id,
              photo: publicUrl,
              sync_status: "synced",
            });
          }
        } catch (err) {
          console.warn("Supabase bucket unreachable. Kept local base64.", err);
        } finally {
          setIsUploading(false);
        }
      }
    };
    reader.readAsDataURL(file);
  }

  async function handlePersistRegistryChanges() {
    try {
      setIsInlineSaving(true);
      setShowConfirmModal(false);

      if (window.electronAPI?.saveStudentRecords) {
        await window.electronAPI.saveStudentRecords(
          student.id,
          student.records,
          student.photo,
        );
      }

      if (supabase && navigator.onLine) {
        // FIXED: Removed the non-existent 'photo' key column to match remote table structural layout
        const { error } = await supabase
          .from("students")
          .update({
            records: student.records,
          })
          .eq("id", student.id);

        if (error) throw error;
        triggerStatusFeedback("✓ Registry saved to Local Database & Cloud!");
      } else {
        triggerStatusFeedback(
          "✓ Saved to SQLite! Changes queued for online sync.",
        );
      }

      setIsSavingChanges(false);
    } catch (err) {
      console.error("Critical persistence failure:", err);
      triggerStatusFeedback("⚠ Error preserving structural modifications.");
    } finally {
      setIsInlineSaving(false);
    }
  }

  function handleMainSaveClick() {
    setIsSavingChanges(true);
    setShowConfirmModal(true);
  }

  function handleModalSaveClick() {
    setIsSavingChanges(false);
    setShowConfirmModal(true);
  }

  function deletePhoto() {
    setStudents((prev) =>
      prev.map((s) =>
        s.id === student.id
          ? { ...s, photo: null, sync_status: "pending_sync" }
          : s,
      ),
    );
    if (window.electronAPI?.saveToSQLite) {
      window.electronAPI.saveToSQLite({
        id: student.id,
        photo: null,
        sync_status: "pending_sync",
      });
    }
    setShowPhotoDeleteConfirm(false);
    triggerStatusFeedback("Photo removed from card.");
  }

  const previewBMI =
    rec.weight && rec.height ? calcBMI(rec.weight, rec.height) : null;
  const previewStatus = previewBMI ? getBMIStatus(previewBMI) : null;

  const baselineRec = student.records.find((r) => r.q === "Baseline");
  const midlineRec = student.records.find((r) => r.q === "Midline");
  const endlineRec = student.records.find((r) => r.q === "Endline");

  const fallbackRecords = [...student.records].reverse();
  const hasNamedQuarters = baselineRec || midlineRec || endlineRec;

  return (
    <div className="page">
      <div className="profile-back-row">
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back to Students
        </button>
      </div>

      <div className="profile-grid">
        <div className="card profile-info-card">
          <div
            className={`avatar avatar-clickable ${isUploading ? "loading-shimmer" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onContextMenu={(e) => {
              e.preventDefault();
              if (student.photo) {
                setShowPhotoDeleteConfirm(true);
              }
            }}
            title={
              student.photo
                ? "Left-click to change photo. Right-click to delete photo."
                : "Left-click to upload photo manually."
            }
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
            onChange={handleManualPhotoUpload}
          />
          <div className="profile-name">{student.name}</div>

          <button
            className="btn btn-secondary"
            style={{
              marginBottom: "20px",
              fontSize: "12px",
              width: "100%",
              fontWeight: "600",
            }}
            onClick={() => setMobileSyncOpen(true)}
          >
            📸 Take Photo via Phone
          </button>

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

          <div className="profile-table-scroll-container">
            {student.records.length === 0 ? (
              <div className="card empty-cell" style={{ flex: "1" }}>
                No records yet. Add a measurement above.
              </div>
            ) : hasNamedQuarters ? (
              <div className="health-records-container">
                <div className="records-grid-row">
                  {baselineRec ? (
                    <HealthRecordCard record={baselineRec} student={student} />
                  ) : (
                    <div className="empty-period-card">
                      No Baseline record filled.
                    </div>
                  )}

                  {midlineRec ? (
                    <HealthRecordCard record={midlineRec} student={student} />
                  ) : (
                    <div className="empty-period-card">
                      No Midline record filled.
                    </div>
                  )}
                </div>

                <div className="records-grid-row endline-row">
                  {endlineRec ? (
                    <HealthRecordCard record={endlineRec} student={student} />
                  ) : (
                    <div className="empty-period-card full-width-empty">
                      No Endline record filled yet.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="health-records-container regular-list">
                {fallbackRecords.map((r, i) => (
                  <HealthRecordCard key={i} record={r} student={student} />
                ))}
              </div>
            )}
          </div>

          {!readOnly && student.records.length > 0 && (
            <div
              className="save-actions-container"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "8px",
              }}
            >
              <button
                className="btn btn-primary"
                style={{ padding: "10px 24px", fontWeight: "600" }}
                disabled={isInlineSaving}
                onClick={handleMainSaveClick}
              >
                {isInlineSaving ? "Saving..." : "Save Changes"}
              </button>

              {saveStatusMessage && (
                <div
                  className="save-status-inline-message"
                  style={{
                    fontSize: "13px",
                    fontWeight: "500",
                    color: saveStatusMessage.includes("⚠")
                      ? "#dc2626"
                      : "#16a34a",
                    transition: "all 0.3s ease",
                    paddingRight: "4px",
                  }}
                >
                  {saveStatusMessage}
                </div>
              )}
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
            <button className="btn btn-primary" onClick={handleModalSaveClick}>
              Save Record
            </button>
          </div>
        </Modal>
      )}

      {mobileSyncOpen && (
        <MobileCaptureModal
          student={student}
          supabaseClient={supabase}
          fileName={`${safeRegistryName}.jpg`}
          onClose={() => setMobileSyncOpen(false)}
          onPhotoSynced={async (updatedPhotoData) => {
            setStudents((prev) =>
              prev.map((s) =>
                s.id === student.id ? { ...s, photo: updatedPhotoData } : s,
              ),
            );
            if (window.electronAPI?.saveToSQLite) {
              await window.electronAPI.saveToSQLite({
                id: student.id,
                photo: updatedPhotoData,
              });
            }
            triggerStatusFeedback(
              "Photo successfully received from phone camera!",
            );
          }}
        />
      )}

      {showConfirmModal && (
        <Modal
          title="Confirm Save Operation"
          onClose={() => {
            setShowConfirmModal(false);
            setIsSavingChanges(false);
          }}
        >
          <p style={{ padding: "8px 0", color: "#334155", fontSize: "15px" }}>
            Are you sure you want to commit these changes to the registry?
          </p>
          <div className="modal-footer" style={{ marginTop: "16px" }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowConfirmModal(false);
                setIsSavingChanges(false);
              }}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={
                isSavingChanges ? handlePersistRegistryChanges : saveRecord
              }
            >
              Confirm & Save
            </button>
          </div>
        </Modal>
      )}

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
