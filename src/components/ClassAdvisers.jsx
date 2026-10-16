import React, { useMemo, useState } from "react";
import Modal from "./Modal";
import { GRADE_LEVELS } from "../utils/bmi";
import { titleCaseName } from "../utils/nameCase";
import { sortAdvisers, useSchoolAdvisers } from "../utils/schoolAdvisers";
import "./ClassAdvisers.css";

const EMPTY_FORM = { id: "", grade: "", family: "", first: "", middle: "" };

// Class advisers for schools without an org chart (IECES uses Project Rising's).
// NS Entries, Edit Class and the NS Report offer these as a dropdown.
export default function ClassAdvisers({ schoolId, readOnly = false }) {
  const { advisers, status, error, save, remove } = useSchoolAdvisers(schoolId);
  const [gradeFilter, setGradeFilter] = useState("All");
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const sorted = useMemo(() => sortAdvisers(advisers, GRADE_LEVELS), [advisers]);
  const shown = sorted.filter(
    (adviser) => gradeFilter === "All" || adviser.grade === gradeFilter,
  );
  const unsyncedCount = advisers.filter((adviser) => adviser.pending).length;

  const flash = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 3000);
  };

  const openForm = (adviser) => {
    setFormError("");
    setForm(
      adviser
        ? { id: adviser.id, grade: adviser.grade, family: adviser.family, first: adviser.first, middle: adviser.middle }
        : { ...EMPTY_FORM, grade: gradeFilter === "All" ? "" : gradeFilter },
    );
  };

  const updateForm = (field, value) =>
    setForm((current) => ({
      ...current,
      [field]: field === "grade" ? value : titleCaseName(value),
    }));

  async function submit(event) {
    event.preventDefault();
    const input = {
      ...form,
      family: form.family.trim(),
      first: form.first.trim(),
      middle: form.middle.trim(),
    };
    if (!input.grade || !input.family || !input.first) {
      setFormError("Grade level, family name and first name are required.");
      return;
    }
    const duplicate = advisers.some(
      (adviser) =>
        adviser.id !== input.id &&
        adviser.grade === input.grade &&
        adviser.family.toLowerCase() === input.family.toLowerCase() &&
        adviser.first.toLowerCase() === input.first.toLowerCase(),
    );
    if (duplicate) {
      setFormError(`${input.first} ${input.family} is already a ${input.grade} adviser.`);
      return;
    }
    setSaving(true);
    const result = await save(input);
    setSaving(false);
    setForm(null);
    flash(
      result.synced
        ? `${input.first} ${input.family} saved.`
        : `${input.first} ${input.family} saved on this computer. It will upload to the cloud when the connection is back.`,
    );
  }

  async function confirmRemove(adviser) {
    if (!window.confirm(`Remove ${adviser.displayName} from the ${adviser.grade} advisers?\n\nClasses already saved keep their adviser name.`)) return;
    await remove(adviser.id);
    flash(`${adviser.displayName} removed.`);
    window.electronAPI?.forceRefocusWindow?.();
  }

  return (
    <div className="class-advisers-page page">
      <div className="class-advisers-header">
        <div>
          <div className="class-advisers-eyebrow">School setup</div>
          <h1 className="page-title">Class Advisers</h1>
          <p className="page-sub">
            Advisers listed here appear as choices in NS Entries, Edit Class and the NS Report.
          </p>
        </div>
        {!readOnly && (
          <button className="btn btn-primary" onClick={() => openForm(null)}>
            + Add Adviser
          </button>
        )}
      </div>

      <div className="class-advisers-toolbar">
        <select
          className="form-select"
          value={gradeFilter}
          onChange={(event) => setGradeFilter(event.target.value)}
          aria-label="Filter by grade level"
        >
          <option value="All">All Grade Levels</option>
          {GRADE_LEVELS.map((grade) => (
            <option key={grade}>{grade}</option>
          ))}
        </select>
        <span className="class-advisers-count">
          {shown.length} adviser{shown.length === 1 ? "" : "s"}
        </span>
        <span className={`class-advisers-sync is-${unsyncedCount ? "offline" : status}`} role="status">
          {status === "loading"
            ? "Syncing…"
            : unsyncedCount
              ? `${unsyncedCount} not yet uploaded`
              : status === "synced"
                ? "Saved to cloud"
                : "Offline: showing saved copy"}
        </span>
      </div>
      {status === "offline" && error && (
        <p className="class-advisers-error">
          Could not reach the cloud ({error.message || "connection failed"}). Changes are kept on this computer and will upload on the next sync.
        </p>
      )}

      {message && (
        <p className="class-advisers-message" role="status">
          ✓ {message}
        </p>
      )}

      <div className="card class-advisers-table-wrap">
        <table className="class-advisers-table">
          <thead>
            <tr>
              <th>Grade Level</th>
              <th>Family Name</th>
              <th>First Name</th>
              <th>Middle Name</th>
              <th>Shown As</th>
              {!readOnly && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 5 : 6} className="class-advisers-empty">
                  {gradeFilter === "All"
                    ? "No class advisers yet. Add the advisers of each grade so NS Entries can list them."
                    : `No ${gradeFilter} advisers yet.`}
                </td>
              </tr>
            ) : (
              shown.map((adviser) => (
                <tr key={adviser.id}>
                  <td>{adviser.grade}</td>
                  <td>{adviser.family}</td>
                  <td>{adviser.first}</td>
                  <td>{adviser.middle || "—"}</td>
                  <td>
                    <strong>{adviser.displayName}</strong>
                    {adviser.pending && <span className="class-advisers-pending">Not uploaded</span>}
                  </td>
                  {!readOnly && (
                    <td className="class-advisers-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => openForm(adviser)}>
                        Edit
                      </button>
                      <button type="button" className="class-advisers-remove" onClick={() => confirmRemove(adviser)}>
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={form.id ? "Edit Adviser" : "Add Adviser"} onClose={() => setForm(null)}>
          <form className="class-advisers-form" onSubmit={submit}>
            <div className="form-group">
              <label className="form-label" htmlFor="adviser-grade">Grade Level</label>
              <select
                id="adviser-grade"
                className="form-select"
                value={form.grade}
                onChange={(event) => updateForm("grade", event.target.value)}
                autoFocus
              >
                <option value="" disabled>Select grade level</option>
                {GRADE_LEVELS.map((grade) => (
                  <option key={grade}>{grade}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="adviser-family">Family Name</label>
              <input id="adviser-family" className="form-input" placeholder="e.g. Santos"
                value={form.family} onChange={(event) => updateForm("family", event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="adviser-first">First Name</label>
              <input id="adviser-first" className="form-input" placeholder="e.g. Maria"
                value={form.first} onChange={(event) => updateForm("first", event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="adviser-middle">Middle Name</label>
              <input id="adviser-middle" className="form-input" placeholder="e.g. Cruz (optional)"
                value={form.middle} onChange={(event) => updateForm("middle", event.target.value)} />
            </div>
            <p className="class-advisers-preview">
              Shown as{" "}
              <strong>
                {[form.first.trim(), form.middle.trim() ? `${form.middle.trim().charAt(0).toUpperCase()}.` : "", form.family.trim()]
                  .filter(Boolean)
                  .join(" ") || "—"}
              </strong>
              {form.grade && form.family.trim() && (
                <> · class name <strong>{form.grade} - {form.family.trim()}</strong></>
              )}
            </p>
            {formError && <p className="class-advisers-error" role="alert">{formError}</p>}
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save Adviser"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
