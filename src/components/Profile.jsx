import React, { useState, useRef, useEffect } from "react";
import {
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  normalizeHeightMeters,
  formatHeightMeters,
  ageInYears,
  SCHOOL_YEARS,
  QUARTERS,
  SECTIONS,
} from "../utils/bmi";
import Badge from "./Badge";
import Modal from "./Modal";
import MobileCaptureModal from "./MobileCaptureModal";
import "./Profile.css";

// Helper function to convert YYYY-MM-DD or standard dates to MM/DD/YYYY
function formatDateMMDDYYYY(dateStr) {
  if (!dateStr) return "—";

  const parts = dateStr.split("T")[0].split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year.length === 4) {
      return `${month.padStart(2, "0")}/${day.padStart(2, "0")}/${year}`;
    }
  }

  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) return dateStr;

  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  const year = dateObj.getFullYear();

  return `${month}/${day}/${year}`;
}

const HISTORY_GRADES = [
  "Kinder",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
];

function normalizedHistoryGrade(value) {
  const text = String(value || "").trim();
  if (/^kinder/i.test(text)) return "Kinder";
  const match = text.match(/^grade\s*([1-6])/i);
  return match ? `Grade ${match[1]}` : null;
}

function schoolYearStart(value) {
  const match = String(value || "").match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

function buildNutritionalHistory(student) {
  const records = student.records || [];
  const currentGrade = normalizedHistoryGrade(student.section || student.grade);
  const currentGradeIndex = HISTORY_GRADES.indexOf(currentGrade);
  const latestYear = Math.max(
    ...records.map((record) => schoolYearStart(record.sy) || 0),
  );
  const grouped = new Map();

  records.forEach((record) => {
    let grade = normalizedHistoryGrade(record.section || record.grade);
    const recordYear = schoolYearStart(record.sy);
    if (!grade && currentGradeIndex >= 0 && recordYear && latestYear) {
      const inferredIndex = currentGradeIndex - (latestYear - recordYear);
      if (inferredIndex >= 0 && inferredIndex < HISTORY_GRADES.length) {
        grade = HISTORY_GRADES[inferredIndex];
      }
    }
    if (!grade || !["Baseline", "Midline", "Endline"].includes(record.q))
      return;
    const bmi = calcBMI(record.weight, record.height);
    if (!bmi) return;
    const status = getBMIStatus(
      bmi,
      student.sex,
      student.birthdate,
      record.date,
    );
    if (!status) return;
    if (!grouped.has(grade)) grouped.set(grade, {});
    grouped.get(grade)[record.q] = status;
  });

  return HISTORY_GRADES.filter((grade) => grouped.has(grade)).map((grade) => ({
    grade,
    periods: grouped.get(grade),
  }));
}

function MetricRow({ label, value }) {
  return (
    <div className="metric-item-row">
      <span className="metric-label-modern">{label}</span>
      <span className="metric-value-modern">{value}</span>
    </div>
  );
}

function HealthRecordCard({ record, student, onEdit, readOnly }) {
  const bmi = calcBMI(record.weight, record.height);
  const status = bmi
    ? getBMIStatus(bmi, student.sex, student.birthdate, record.date)
    : null;
  const haz = getHAZStatus(
    record.height,
    student.sex,
    student.birthdate,
    record.date,
  );

  return (
    <div className="modern-record-card">
      <div
        className="card-header-modern"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <span className="period-badge-label">{record.q}</span>
          <span className="registry-text" style={{ marginLeft: "8px" }}>
            Registry No. {student.registryNo || record.registryNo || "—"}
          </span>
        </div>
        {!readOnly && onEdit && (
          <button
            className="btn btn-secondary"
            style={{ padding: "2px 8px", fontSize: "11px" }}
            onClick={() => onEdit(record)}
          >
            ✏ Edit
          </button>
        )}
      </div>

      <div className="card-body-modern">
        <MetricRow label="School Year" value={record.sy} />
        <MetricRow
          label="Date Measured"
          value={formatDateMMDDYYYY(record.date)}
        />
        <MetricRow label="Weight" value={`${record.weight} kg`} />
        <MetricRow label="Height" value={`${formatHeightMeters(record.height)} m`} />
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
  currentUser,
  autoOpenAddRecord,
}) {
  const student = students.find((s) => s.id === studentId);
  const [addOpen, setAddOpen] = useState(!!autoOpenAddRecord);

  useEffect(() => {
    if (autoOpenAddRecord) setAddOpen(true);
  }, [studentId, autoOpenAddRecord]);

  const [mobileSyncOpen, setMobileSyncOpen] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [showPhotoDeleteConfirm, setShowPhotoDeleteConfirm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [saveStatusMessage, setSaveStatusMessage] = useState(null);
  const [isInlineSaving, setIsInlineSaving] = useState(false);

  // Profile Inline Edit States
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    lrn: "",
    birthdate: "",
    age: "",
    sex: "M",
    section: "",
  });

  const fileInputRef = useRef(null);
  const [rec, setRec] = useState({
    sy: "2026–2027",
    q: "Baseline",
    date: "",
    weight: "",
    height: "",
  });

  // Sync edit form when student data loads or changes
  useEffect(() => {
    if (student) {
      setProfileForm({
        name: student.name || "",
        lrn: student.lrn || "",
        birthdate: student.birthdate || "",
        age:
          student.age ??
          (student.birthdate ? ageInYears(student.birthdate) : ""),
        sex: student.sex || "M",
        section: student.section || "",
      });
    }
  }, [student]);

  if (!student) return null;

  const initials =
    (student.name.split(",")[1]?.trim()[0] || "?") + student.name[0];

  const safeRegistryName = student.registryNo
    ? student.registryNo.replace(/[^a-zA-Z0-9-_]/g, "_")
    : `student_${student.id}`;

  function triggerStatusFeedback(msg) {
    setSaveStatusMessage(msg);
    setTimeout(() => {
      setSaveStatusMessage(null);
    }, 4000);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPER FINDERS FOR EXISTING RECORD DATA
  // ══════════════════════════════════════════════════════════════════════════
  function findLatestByQuarter(records, q) {
    const matches = records.filter((r) => r.q === q);
    return matches.length ? matches[matches.length - 1] : null;
  }

  const baselineRec = findLatestByQuarter(student.records, "Baseline");
  const midlineRec = findLatestByQuarter(student.records, "Midline");
  const endlineRec = findLatestByQuarter(student.records, "Endline");

  const fallbackRecords = [...student.records].reverse();
  const hasNamedQuarters = baselineRec || midlineRec || endlineRec;
  const nutritionalHistory = buildNutritionalHistory(student);

  // Opens modal pre-populated with selected record, or defaults to Baseline/Latest record
  function handleOpenRecordModal(
    targetRecord = null,
    defaultQuarter = "Baseline",
  ) {
    const recordToLoad =
      targetRecord ||
      findLatestByQuarter(student.records, defaultQuarter) ||
      (student.records.length > 0
        ? student.records[student.records.length - 1]
        : null);

    if (recordToLoad) {
      setRec({
        sy: recordToLoad.sy || "2026–2027",
        q: recordToLoad.q || defaultQuarter,
        date: recordToLoad.date || "",
        weight: recordToLoad.weight ? String(recordToLoad.weight) : "",
        height: recordToLoad.height ? String(normalizeHeightMeters(recordToLoad.height)) : "",
      });
    } else {
      setRec({
        sy: "2026–2027",
        q: defaultQuarter,
        date: "",
        weight: "",
        height: "",
      });
    }
    setAddOpen(true);
  }

  // Automatically update form values if Quarter selection is switched inside Modal
  function handleQuarterSelectChange(selectedQuarter) {
    const existing = findLatestByQuarter(student.records, selectedQuarter);
    if (existing) {
      setRec({
        sy: existing.sy || "2026–2027",
        q: selectedQuarter,
        date: existing.date || "",
        weight: existing.weight ? String(existing.weight) : "",
        height: existing.height ? String(normalizeHeightMeters(existing.height)) : "",
      });
    } else {
      setRec((r) => ({
        ...r,
        q: selectedQuarter,
        date: "",
        weight: "",
        height: "",
      }));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROFILE EDIT & BIRTHDATE RECOMPUTATION HANDLERS
  // ══════════════════════════════════════════════════════════════════════════
  function handleBirthdateChange(e) {
    const newBirthdate = e.target.value;
    const computedAge = newBirthdate ? ageInYears(newBirthdate) : "";

    setProfileForm((prev) => ({
      ...prev,
      birthdate: newBirthdate,
      age: computedAge,
    }));
  }

  async function handleSaveProfileDetails() {
    setIsInlineSaving(true);

    const updatedData = {
      ...profileForm,
      age: profileForm.birthdate
        ? ageInYears(profileForm.birthdate)
        : profileForm.age,
      hasUnsavedChanges: true,
    };

    setStudents((prev) =>
      prev.map((s) => (s.id === student.id ? { ...s, ...updatedData } : s)),
    );

    try {
      if (window.sqlite?.updateStudentWorkspaceMeta) {
        await window.sqlite.updateStudentWorkspaceMeta(
          student.id,
          {
            name: updatedData.name,
            lrn: updatedData.lrn,
            birthdate: updatedData.birthdate,
            age: updatedData.age,
            sex: updatedData.sex,
            section: updatedData.section,
          },
          currentUser?.id,
        );
      } else if (window.electronAPI?.saveToSQLite) {
        await window.electronAPI.saveToSQLite({
          id: student.id,
          ...updatedData,
          sync_status: "pending_sync",
        });
      }

      if (supabase && navigator.onLine) {
        const { error } = await supabase
          .from("students")
          .update({
            name: updatedData.name,
            lrn: updatedData.lrn,
            birthdate: updatedData.birthdate,
            age: updatedData.age,
            sex: updatedData.sex,
            section: updatedData.section,
          })
          .eq("id", student.id);

        if (error) throw error;
        triggerStatusFeedback(
          "✓ Profile details updated in SQLite & Supabase!",
        );
      } else {
        triggerStatusFeedback(
          "✓ Saved to SQLite! Changes queued for online sync.",
        );
      }

      setIsEditingProfile(false);
    } catch (err) {
      console.error("Failed to persist updated profile:", err);
      triggerStatusFeedback("⚠ Saved locally, but failed to update Cloud.");
    } finally {
      setIsInlineSaving(false);
    }
  }

  function saveRecord() {
    if (!rec.date || !rec.weight || !rec.height) return;
    const newRec = {
      ...rec,
      section: student.section,
      weight: parseFloat(rec.weight),
      height: normalizeHeightMeters(rec.height),
    };
    setStudents((prev) =>
      prev.map((s) => {
        if (s.id !== student.id) return s;
        // Replaces existing quarter entry if it matches SY and Quarter
        const cleaned = s.records.filter(
          (r) => !(r.sy === newRec.sy && r.q === newRec.q),
        );
        return { ...s, records: [...cleaned, newRec] };
      }),
    );
    setAddOpen(false);
    setShowConfirmModal(false);
    setRec({
      sy: "2026–2027",
      q: "Baseline",
      date: "",
      weight: "",
      height: "",
    });
    triggerStatusFeedback("Measurement updated locally.");
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

      if (supabase) {
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

          const { error: photoColError } = await supabase
            .from("students")
            .update({ photo_url: publicUrl })
            .eq("id", student.id);

          if (photoColError) {
            console.error(
              "Photo uploaded to storage but failed to save URL to students table:",
              photoColError,
            );
            triggerStatusFeedback(
              "⚠ Photo uploaded but couldn't link it to the student record.",
            );
          }
        } catch (err) {
          console.error("Photo upload to Supabase failed:", err);
          triggerStatusFeedback(
            "⚠ Couldn't upload photo to the cloud. Saved locally — will retry when synced.",
          );
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
        const { error } = await supabase
          .from("students")
          .update({
            records: student.records,
            photo_url: student.photo || null,
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

  return (
    <div className="page">
      <div className="profile-back-row">
        <button className="btn btn-primary" onClick={onBack}>
          ← Back to Database
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

          {!isEditingProfile ? (
            <>
              <div className="profile-name">{student.name}</div>

              <button
                className="btn btn-secondary"
                style={{
                  marginBottom: "12px",
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
                  ["LRN", student.lrn || "—"],
                  ["Birthdate", formatDateMMDDYYYY(student.birthdate)],
                  ["Age", student.age ?? "—"],
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

              {!readOnly && (
                <button
                  className="btn btn-secondary"
                  style={{ marginTop: "16px", width: "100%" }}
                  onClick={() => setIsEditingProfile(true)}
                >
                  ✏ Edit Profile Details
                </button>
              )}
            </>
          ) : (
            /* EDIT PROFILE FORM MODE */
            <div
              className="profile-edit-form"
              style={{ width: "100%", marginTop: "12px" }}
            >
              <div className="form-group" style={{ marginBottom: "10px" }}>
                <label className="form-label">Full Name</label>
                <input
                  className="form-input"
                  value={profileForm.name}
                  onChange={(e) =>
                    setProfileForm((p) => ({ ...p, name: e.target.value }))
                  }
                />
              </div>

              <div className="form-group" style={{ marginBottom: "10px" }}>
                <label className="form-label">LRN</label>
                <input
                  className="form-input"
                  value={profileForm.lrn}
                  onChange={(e) =>
                    setProfileForm((p) => ({ ...p, lrn: e.target.value }))
                  }
                />
              </div>

              <div className="form-group" style={{ marginBottom: "10px" }}>
                <label className="form-label">Birthdate</label>
                <input
                  type="date"
                  className="form-input"
                  value={profileForm.birthdate}
                  onChange={handleBirthdateChange}
                />
              </div>

              <div className="form-group" style={{ marginBottom: "10px" }}>
                <label className="form-label">Age (Auto-calculated)</label>
                <input
                  type="number"
                  className="form-input"
                  value={profileForm.age}
                  readOnly
                  disabled
                  style={{ backgroundColor: "#f1f5f9", cursor: "not-allowed" }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: "10px" }}>
                <label className="form-label">Sex</label>
                <select
                  className="form-select full-width"
                  value={profileForm.sex}
                  onChange={(e) =>
                    setProfileForm((p) => ({ ...p, sex: e.target.value }))
                  }
                >
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label className="form-label">Section</label>
                <select
                  className="form-select full-width"
                  value={profileForm.section}
                  onChange={(e) =>
                    setProfileForm((p) => ({ ...p, section: e.target.value }))
                  }
                >
                  {SECTIONS.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setIsEditingProfile(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={handleSaveProfileDetails}
                  disabled={isInlineSaving}
                >
                  {isInlineSaving ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="profile-right">
          <div className="records-header">
            <h2 className="section-title">Health Records</h2>
            {!readOnly && (
              <button
                className="btn btn-primary"
                onClick={() => handleOpenRecordModal()}
              >
                ✏ Edit Health Records
              </button>
            )}
          </div>

          <div className="profile-table-scroll-container">
            {student.records.length === 0 ? (
              <div className="card empty-cell" style={{ flex: "1" }}>
                No records yet. Add or edit a measurement above.
              </div>
            ) : hasNamedQuarters ? (
              <div className="health-records-container">
                <div className="records-grid-row">
                  {baselineRec ? (
                    <HealthRecordCard
                      record={baselineRec}
                      student={student}
                      readOnly={readOnly}
                      onEdit={(r) => handleOpenRecordModal(r)}
                    />
                  ) : (
                    <div className="empty-period-card">
                      No Baseline record filled.
                    </div>
                  )}

                  {midlineRec ? (
                    <HealthRecordCard
                      record={midlineRec}
                      student={student}
                      readOnly={readOnly}
                      onEdit={(r) => handleOpenRecordModal(r)}
                    />
                  ) : (
                    <div className="empty-period-card">
                      No Midline record filled.
                    </div>
                  )}
                </div>

                <div className="records-grid-row endline-row">
                  {endlineRec ? (
                    <HealthRecordCard
                      record={endlineRec}
                      student={student}
                      readOnly={readOnly}
                      onEdit={(r) => handleOpenRecordModal(r)}
                    />
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
                  <HealthRecordCard
                    key={i}
                    record={r}
                    student={student}
                    readOnly={readOnly}
                    onEdit={(recToEdit) => handleOpenRecordModal(recToEdit)}
                  />
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
                    r.date,
                  );
                  if (!status) return null;
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

          {nutritionalHistory.length > 0 && (
            <div className="card learner-history-card">
              <h3 className="card-title">Learner Nutritional History</h3>
              <p className="learner-history-note">
                BMI-for-age status by grade level and assessment period.
              </p>
              <div className="learner-history-scroll">
                <table className="learner-history-table">
                  <thead>
                    <tr>
                      <th>Grade Level</th>
                      <th>Baseline</th>
                      <th>Midline</th>
                      <th>Endline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nutritionalHistory.map(({ grade, periods }) => (
                      <tr key={grade}>
                        <td>{grade}</td>
                        {["Baseline", "Midline", "Endline"].map(
                          (periodName) => {
                            const status = periods[periodName];
                            return (
                              <td key={periodName}>
                                {status ? (
                                  <span
                                    className="history-status"
                                    style={{
                                      color: status.color,
                                      backgroundColor: `${status.color}18`,
                                    }}
                                  >
                                    {status.label}
                                  </span>
                                ) : (
                                  <span className="history-empty">—</span>
                                )}
                              </td>
                            );
                          },
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {addOpen && (
        <Modal
          title="Edit / Add Health Record"
          onClose={() => setAddOpen(false)}
          closeOnOverlay={false}
        >
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
                onChange={(e) => handleQuarterSelectChange(e.target.value)}
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
              <label className="form-label">Height (m)</label>
              <input
                type="number"
                className="form-input"
                placeholder="e.g. 1.45"
                min="0.3"
                max="3"
                step="0.001"
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
