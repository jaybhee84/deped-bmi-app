import React, { useState, useEffect } from "react";
import { GRADE_LEVELS } from "../utils/bmi";
import {
  loadSbfpConfig,
  saveSbfpConfig,
  DEFAULT_SBFP_CONFIG,
} from "../utils/sbfpConfig";
import "./SDOSettings.css";

const BMI_CRITERIA = ["Wasted", "Severely Wasted", "Overweight", "Obese"];
const HAZ_CRITERIA = ["Stunted", "Severely Stunted"];

function sortByGradeOrder(grades) {
  return [...grades].sort(
    (a, b) => GRADE_LEVELS.indexOf(a) - GRADE_LEVELS.indexOf(b),
  );
}

export default function SDOSettings({ currentUser }) {
  const [config, setConfig] = useState(DEFAULT_SBFP_CONFIG);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSbfpConfig().then((cfg) => {
      setConfig(cfg);
      setLoading(false);
    });
  }, []);

  function toggleGrade(grade) {
    setConfig((prev) => {
      const isAdding = !prev.grades.includes(grade);
      const nextGrades = sortByGradeOrder(
        isAdding
          ? [...prev.grades, grade]
          : prev.grades.filter((g) => g !== grade),
      );

      // If a grade is added to "Grade Levels to Include", it's redundant
      // as a per-criterion restriction, so strip it from any restrictions.
      let nextRestrictions = prev.criterionGradeRestrictions;
      if (isAdding && nextRestrictions) {
        nextRestrictions = Object.fromEntries(
          Object.entries(nextRestrictions).map(([criterion, grades]) => [
            criterion,
            grades.filter((g) => g !== grade),
          ]),
        );
      }

      return {
        ...prev,
        grades: nextGrades,
        criterionGradeRestrictions: nextRestrictions,
      };
    });
  }

  function toggleCriterion(criterion) {
    setConfig((prev) => ({
      ...prev,
      criteria: prev.criteria.includes(criterion)
        ? prev.criteria.filter((c) => c !== criterion)
        : [...prev.criteria, criterion],
    }));
  }

  function toggleCriterionRestriction(criterion) {
    setConfig((prev) => {
      const updated = { ...(prev.criterionGradeRestrictions || {}) };

      if (updated[criterion]) {
        delete updated[criterion];
      } else {
        updated[criterion] = [];
      }

      return {
        ...prev,
        criterionGradeRestrictions: updated,
      };
    });
  }

  function toggleRestrictedGrade(criterion, grade) {
    setConfig((prev) => {
      const grades = prev.criterionGradeRestrictions?.[criterion] || [];

      const updatedGrades = sortByGradeOrder(
        grades.includes(grade)
          ? grades.filter((g) => g !== grade)
          : [...grades, grade],
      );

      return {
        ...prev,
        criterionGradeRestrictions: {
          ...prev.criterionGradeRestrictions,
          [criterion]: updatedGrades,
        },
      };
    });
  }

  function selectAllGrades() {
    setConfig((prev) => {
      let nextRestrictions = prev.criterionGradeRestrictions;
      if (nextRestrictions) {
        // All grades are now covered on the left, so no restriction list
        // has anything left to offer.
        nextRestrictions = Object.fromEntries(
          Object.entries(nextRestrictions).map(([criterion]) => [
            criterion,
            [],
          ]),
        );
      }
      return {
        ...prev,
        grades: [...GRADE_LEVELS],
        criterionGradeRestrictions: nextRestrictions,
      };
    });
  }

  function clearGrades() {
    setConfig((prev) => ({ ...prev, grades: [] }));
  }

  async function handleSave() {
    const confirmed = window.confirm(
      "Save and Apply Configuration?\n\n" +
        "This will overwrite the currently active SBFP beneficiary criteria for all schools.",
    );

    if (!confirmed) return;

    const updated = {
      ...config,
      setBy: currentUser?.username || "SDO",
      setAt: new Date().toISOString(),
    };

    setError("");

    const ok = await saveSbfpConfig(updated);

    if (ok) {
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setError("Failed to save configuration. Please try again.");
    }
  }

  const totalSelected = config.grades.length + config.criteria.length;

  function describeCriterionScope(criterion) {
    const restriction = config.criterionGradeRestrictions?.[criterion];
    if (restriction === undefined) return "All grades";
    if (restriction.length === 0)
      return "No grades (restriction active, none selected)";
    return restriction.join(", ");
  }

  function renderCriterionOption(c) {
    const isSelected = config.criteria.includes(c);
    const isRestricted = config.criterionGradeRestrictions?.[c] !== undefined;
    const availableGrades = GRADE_LEVELS.filter(
      (grade) => !config.grades.includes(grade),
    );

    return (
      <div key={c} style={{ marginBottom: "12px" }}>
        <label className={`sbfp-option ${isSelected ? "selected" : ""}`}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleCriterion(c)}
          />
          <span>{c}</span>
          {isSelected && <span className="sbfp-check">✓</span>}
        </label>

        {isSelected && (
          <div style={{ marginLeft: "24px", marginTop: "6px" }}>
            <label>
              <input
                type="checkbox"
                checked={isRestricted}
                onChange={() => toggleCriterionRestriction(c)}
              />{" "}
              Restrict by Grade Level
            </label>

            {isRestricted && (
              <div style={{ marginTop: "8px", marginLeft: "16px" }}>
                {availableGrades.length === 0 ? (
                  <div style={{ color: "#888", fontSize: "12px" }}>
                    All grade levels are already included.
                  </div>
                ) : (
                  availableGrades.map((grade) => (
                    <label key={grade} style={{ display: "block" }}>
                      <input
                        type="checkbox"
                        checked={
                          config.criterionGradeRestrictions?.[c]?.includes(
                            grade,
                          ) || false
                        }
                        onChange={() => toggleRestrictedGrade(c, grade)}
                      />{" "}
                      {grade}
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">SDO Settings</h1>
        <p className="page-sub">Loading configuration…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">SDO Settings</h1>
      <p className="page-sub">
        Configure official SBFP beneficiary criteria for all schools
      </p>

      <div className="sdo-settings-grid">
        {/* ── SBFP Config Card ── */}
        <div className="card">
          <div className="sdo-settings-header">
            <h3 className="card-title">Official SBFP Beneficiary Criteria</h3>
            {config.setBy && (
              <div className="sdo-last-saved">
                Last set by <strong>{config.setBy}</strong> on{" "}
                {new Date(config.setAt).toLocaleDateString("en-PH", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </div>
            )}
          </div>

          <div className="sdo-notice">
            <span className="sdo-notice-icon">ℹ️</span>
            <span>
              Once saved, <strong>all schools</strong> will automatically see
              the official SBFP beneficiaries in their Students and Reports
              pages — from Baseline through Endline.
            </span>
          </div>

          <div className="sbfp-config-grid">
            {/* Grade Levels */}
            <div className="sbfp-config-section">
              <div className="sbfp-section-header">
                <h4 className="sbfp-section-title">Grade Levels to Include</h4>
                <div className="sbfp-quick-btns">
                  <button className="sbfp-quick-btn" onClick={selectAllGrades}>
                    All
                  </button>
                  <button className="sbfp-quick-btn" onClick={clearGrades}>
                    Clear
                  </button>
                </div>
              </div>
              <p className="sbfp-section-sub">
                All learners in selected grades are automatic beneficiaries.
              </p>
              <div className="sbfp-options-list">
                {GRADE_LEVELS.map((grade) => (
                  <label
                    key={grade}
                    className={`sbfp-option ${config.grades.includes(grade) ? "selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={config.grades.includes(grade)}
                      onChange={() => toggleGrade(grade)}
                    />
                    <span>{grade}</span>
                    {config.grades.includes(grade) && (
                      <span className="sbfp-check">✓</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Nutritional Status Criteria */}
            <div className="sbfp-config-section">
              <div className="sbfp-section-header">
                <h4 className="sbfp-section-title">
                  Nutritional Status Criteria
                </h4>
              </div>
              <p className="sbfp-section-sub">
                Learners with these statuses are beneficiaries regardless of
                grade, unless restricted to specific grades below.
              </p>

              <div className="sbfp-criteria-group">
                <div className="sbfp-criteria-label">BMI-for-Age</div>
                {BMI_CRITERIA.map((c) => renderCriterionOption(c))}
              </div>

              <div className="sbfp-criteria-group" style={{ marginTop: 12 }}>
                <div className="sbfp-criteria-label">Height-for-Age</div>
                {HAZ_CRITERIA.map((c) => renderCriterionOption(c))}
              </div>
            </div>
          </div>

          {/* Summary + Save */}
          <div className="sdo-save-row">
            <div className="sdo-summary">
              {totalSelected === 0 ? (
                <span className="sdo-summary-empty">
                  No criteria selected — no official beneficiaries will be
                  designated.
                </span>
              ) : (
                <span className="sdo-summary-text">
                  <strong>{config.grades.length}</strong> grade level
                  {config.grades.length !== 1 ? "s" : ""} +{" "}
                  <strong>{config.criteria.length}</strong> nutritional status
                  {config.criteria.length !== 1 ? "es" : ""} selected
                </span>
              )}
            </div>
            <button className="btn btn-primary" onClick={handleSave}>
              💾 Save & Apply to All Schools
            </button>
            {saved && (
              <span className="save-confirm">
                ✓ Saved! All schools will now reflect this configuration.
              </span>
            )}
            {error && (
              <span style={{ color: "var(--red)", fontSize: 13 }}>{error}</span>
            )}
          </div>
        </div>

        {/* ── Preview card ── */}
        <div className="card">
          <h3 className="card-title">Current Configuration Preview</h3>

          {totalSelected === 0 ? (
            <div className="sdo-preview-empty">
              <div style={{ fontSize: 36 }}>📋</div>
              <p>No beneficiary criteria set yet.</p>
              <p style={{ fontSize: 12 }}>
                Select grades and/or nutritional status criteria on the left and
                click Save.
              </p>
            </div>
          ) : (
            <>
              {config.grades.length > 0 && (
                <div className="sdo-preview-group">
                  <div className="sdo-preview-label">Included Grade Levels</div>
                  <div className="sdo-preview-tags">
                    {config.grades.map((g) => (
                      <span key={g} className="sdo-preview-tag grade">
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {config.criteria.length > 0 && (
                <div className="sdo-preview-group">
                  <div className="sdo-preview-label">
                    Nutritional Status Criteria
                  </div>
                  <ul className="sdo-preview-rule-list">
                    {config.criteria.map((c) => (
                      <li key={c}>
                        <strong>{c}</strong> — {describeCriterionScope(c)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="sdo-preview-rule">
                <div className="sdo-preview-rule-title">
                  Who qualifies as an official beneficiary?
                </div>
                <ul className="sdo-preview-rule-list">
                  {config.grades.length > 0 && (
                    <li>
                      ALL learners in:{" "}
                      <strong>{config.grades.join(", ")}</strong>
                    </li>
                  )}
                  {config.criteria.map((c) => (
                    <li key={c}>
                      Learners with status <strong>{c}</strong> —{" "}
                      <strong>{describeCriterionScope(c)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
