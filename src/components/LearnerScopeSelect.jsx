import React from "react";

// "All Learners" / "SBFP Beneficiaries" filter used across the app's pages.
export default function LearnerScopeSelect({ value, onChange, className, style, label }) {
  const select = (
    <select
      className={className}
      style={style}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Learners"
      title="SBFP Beneficiaries are the learners who qualified at this school year's Baseline."
    >
      <option value="all">All Learners</option>
      <option value="sbfp">SBFP Beneficiaries</option>
    </select>
  );
  if (!label) return select;
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {select}
    </div>
  );
}
