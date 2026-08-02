import React from "react";
// ── Import images from src/images ──
import nsImg from "../images/ns.png";
import sbmiImg from "../images/sbmi.png";
import "./ReportsLanding.css";

export default function ReportsLanding({ onSelect }) {
  return (
    <div className="page reports-landing-page">
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Reports Dashboard</h1>
          <p className="page-sub">
            Select a report type to view and manage data
          </p>
        </div>
      </div>

      <div className="reports-landing-grid">
        {/* ── Nutritional Status ── */}
        <button
          type="button"
          className="report-type-card"
          onClick={() => onSelect && onSelect("nutritional")}
        >
          <img
            src={nsImg}
            alt="Nutritional Status"
            className="rtc-bg"
            draggable={false}
          />
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
          type="button"
          className="report-type-card"
          onClick={() => onSelect && onSelect("immunization")}
        >
          <img
            src={sbmiImg}
            alt="School Immunization"
            className="rtc-bg"
            draggable={false}
          />
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
