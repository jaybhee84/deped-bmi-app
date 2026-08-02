import React from "react";
import "./ReportsLanding.css";

export default function ReportsLanding({ onSelect }) {
  return (
    <div className="page">
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-sub">Select a report type to continue</p>
        </div>
      </div>

      <div className="reports-landing-grid">
        {/* ── Nutritional Status ── */}
        <button
          className="report-type-card"
          onClick={() => onSelect("nutritional")}
        >
          <img src="/ns.png" alt="" className="rtc-bg" draggable={false} />
          <div className="rtc-overlay" />
          <div className="rtc-content">
            <div className="rtc-glass">
              <span className="report-type-icon">🥗</span>
              <span className="report-type-label">
                Nutritional Status Report
              </span>
              <span className="report-type-desc">
                BMI, height-for-age, and SBFP beneficiary summaries per section
                or grade level
              </span>
            </div>
          </div>
        </button>

        {/* ── School Immunization ── */}
        <button
          className="report-type-card"
          onClick={() => onSelect("immunization")}
        >
          <img src="/sbmi.png" alt="" className="rtc-bg" draggable={false} />
          <div className="rtc-overlay" />
          <div className="rtc-content">
            <div className="rtc-glass">
              <span className="report-type-icon">💉</span>
              <span className="report-type-label">
                School Immunization Program
              </span>
              <span className="report-type-desc">
                Recording form for routine immunizations — vaccines administered
                per learner across all grade levels
              </span>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
