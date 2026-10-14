import React, { useState, useEffect } from "react";
import {
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  formatHeightMeters,
  SCHOOL_YEARS,
  GRADE_LEVELS,
  QUARTERS,
} from "../utils/bmi";
import Badge from "./Badge";
import "./Reports.css";
import LearnerScopeSelect from "./LearnerScopeSelect";
import { isSbfpBeneficiary } from "../utils/sbfpBeneficiary";
import { usePrintPreview } from "./PrintPreview/PrintPreviewContext";
import { learnerListDocument } from "../utils/printDocuments";
import {
  loadSbfpConfig,
  DEFAULT_SBFP_CONFIG,
} from "../utils/sbfpConfig";

function getSbfpKey(sy) {
  return "sbfp_settings_" + sy;
}

// Formats a birthdate string to MM/DD/YYYY for display.
// Parses "YYYY-MM-DD" manually (rather than `new Date(str)`) to avoid the
// UTC-midnight timezone shift bug where a bare date string can render as
// the previous day depending on the user's local timezone.
function formatBirthdate(birthdate) {
  if (!birthdate) return "";

  const match = String(birthdate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${month}/${day}/${year}`;
  }

  const parsed = new Date(birthdate);
  if (isNaN(parsed.getTime())) return String(birthdate);

  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  const yyyy = parsed.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function loadSbfpSettings(sy) {
  try {
    const raw = localStorage.getItem(getSbfpKey(sy));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Flexible helper function to detect current school year
function getDefaultSchoolYear() {
  if (!SCHOOL_YEARS || SCHOOL_YEARS.length === 0) return "";

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const targetStartYear = month >= 5 ? year : year - 1;

  const matched =
    SCHOOL_YEARS.find((sy) => sy.includes(String(targetStartYear))) ||
    SCHOOL_YEARS.find((sy) => sy.includes(String(year))) ||
    SCHOOL_YEARS[0];

  return matched || "";
}

export default function Reports({ students = [] }) {
  const { requestPrint } = usePrintPreview();
  const [sy, setSy] = useState(getDefaultSchoolYear);
  const [period, setPeriod] = useState("Baseline");
  const [section, setSection] = useState("All");
  const [gradeLevel, setGradeLevel] = useState("All");
  const [nutritionFilter, setNutritionFilter] = useState("All");
  const [learnerScope, setLearnerScope] = useState("all");
  const [beneficiaryGrades, setBeneficiaryGrades] = useState([]);
  const [beneficiaryCriteria, setBeneficiaryCriteria] = useState([]);

  // Initialize state with cached local data if available for instant offline loading
  const [sbfpConfig, setSbfpConfig] = useState(() => {
    try {
      const cached = localStorage.getItem("sbfp_cached_config");
      return cached ? JSON.parse(cached) : DEFAULT_SBFP_CONFIG;
    } catch {
      return DEFAULT_SBFP_CONFIG;
    }
  });

  // Fetch the latest config from Supabase. Cache it if successful, fallback to local cache if offline.
  useEffect(() => {
    loadSbfpConfig().then((resolvedConfig) => {
      if (resolvedConfig) {
        setSbfpConfig(resolvedConfig);
        try {
          // Save a copy locally so it's available next time the user is offline
          localStorage.setItem(
            "sbfp_cached_config",
            JSON.stringify(resolvedConfig),
          );
        } catch (e) {
          console.error("Failed to save offline sbfp config cache", e);
        }
      }
    });
  }, []);

  useEffect(() => {
    const saved = loadSbfpSettings(sy);
    if (saved) {
      setBeneficiaryGrades(saved.grades || []);
      setBeneficiaryCriteria(saved.criteria || []);
    } else {
      setBeneficiaryGrades([]);
      setBeneficiaryCriteria([]);
    }
  }, [sy]);

  const filtered = !sy
    ? []
    : students.filter((s) => {
        const studentGrade = String(s.section || s.grade || "")
          .split(" - ")[0]
          .trim();
        const matchGrade = gradeLevel === "All" || studentGrade === gradeLevel;
        const matchSection = section === "All" || s.section === section;
        const hasRecordForSelectedPeriod = s.records?.some(
          (r) => r.sy === sy && r.q === period,
        );
        return matchGrade && matchSection && hasRecordForSelectedPeriod;
      });

  const rows = filtered
    .map((s) => {
      const selectedRecord = (s.records || []).find(
        (r) => r.sy === sy && r.q === period,
      );
      if (!selectedRecord) return null;

      const bmi = calcBMI(selectedRecord.weight, selectedRecord.height);
      const status = getBMIStatus(
        bmi,
        s.sex,
        s.birthdate,
        selectedRecord.date,
      );
      const haz = getHAZStatus(
        selectedRecord.height,
        s.sex,
        s.birthdate,
        selectedRecord.date,
      );

      return {
        ...s,
        bmi,
        status,
        haz,
        grade: String(s.section || s.grade || "")
          .split(" - ")[0]
          .trim(),
        lastRec: selectedRecord,
      };
    })
    .filter(Boolean);

  const displayRows = rows.filter((s) => {
    if (learnerScope === "sbfp" && !isSbfpBeneficiary(s, sy, sbfpConfig)) return false;
    if (nutritionFilter === "All") return true;
    return s.status?.label === nutritionFilter;
  });

  const gradeOrder = {
    Kinder: 0,
    "Grade 1": 1,
    "Grade 2": 2,
    "Grade 3": 3,
    "Grade 4": 4,
    "Grade 5": 5,
    "Grade 6": 6,
    SNED: 7,
    SPED: 8,
  };

  const sortedDisplayRows = [...displayRows].sort((a, b) => {
    const gradeDiff =
      (gradeOrder[a.grade] ?? 999) - (gradeOrder[b.grade] ?? 999);
    if (gradeDiff !== 0) return gradeDiff;

    const sectionDiff = String(a?.section || "").localeCompare(
      String(b?.section || ""),
    );
    if (sectionDiff !== 0) return sectionDiff;

    // Boys first, then girls, alphabetical within each.
    const sexRank = (r) => {
      const code = String(r?.sex || "").trim().toUpperCase().charAt(0);
      return code === "M" ? 0 : code === "F" ? 1 : 2;
    };
    const sexDiff = sexRank(a) - sexRank(b);
    if (sexDiff !== 0) return sexDiff;

    const nameA = a?.name || "";
    const nameB = b?.name || "";
    return nameA.localeCompare(nameB);
  });

  // Every learner lands in exactly one BMI and one HFA bucket ("No data" when
  // a status could not be computed), so each row of counts adds up to the total.
  const BMI_COUNT_ORDER = ["Normal", "Wasted", "Severely Wasted", "Overweight", "Obese"];
  const HFA_COUNT_ORDER = ["Normal", "Stunted", "Severely Stunted", "Tall"];
  const tallyBy = (labels, labelOf) => {
    const tally = Object.fromEntries([...labels, "No data"].map((label) => [label, 0]));
    sortedDisplayRows.forEach((r) => {
      const label = labelOf(r);
      tally[label in tally ? label : "No data"]++;
    });
    return tally;
  };
  const counts = tallyBy(BMI_COUNT_ORDER, (r) => r.status?.label);
  const hfaCounts = tallyBy(HFA_COUNT_ORDER, (r) => r.haz?.label);
  const sexOf = (r) => String(r.sex || "").toUpperCase().charAt(0);
  const maleCount = sortedDisplayRows.filter((r) => sexOf(r) === "M").length;
  const femaleCount = sortedDisplayRows.filter((r) => sexOf(r) === "F").length;
  const COUNT_DOTS = {
    Normal: "🟢", Wasted: "🟡", "Severely Wasted": "🔴", Overweight: "🟠", Obese: "🟤",
    Stunted: "🟡", "Severely Stunted": "🔴", Tall: "🔵", "No data": "⚪",
  };
  const countRow = (title, tally) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 15px", fontSize: "13px", justifyContent: "flex-end" }}>
      <span style={{ color: "#64748b", fontWeight: 700 }}>{title}</span>
      {Object.entries(tally)
        .filter(([label, count]) => label !== "No data" || count > 0)
        .map(([label, count]) => (
          <span key={label}>
            {COUNT_DOTS[label]} {label}: <strong>{count}</strong>
          </span>
        ))}
    </div>
  );

  function handlePdfPreview() {
    if (!sy) {
      alert("Please select a School Year to generate the report preview.");
      return;
    }
    if (sortedDisplayRows.length === 0) {
      alert("No student records found matching the chosen filter parameters.");
      return;
    }

    const firstStudent = sortedDisplayRows[0];
    const extractedSchoolName =
      firstStudent?.schoolName || students[0]?.schoolName || "Unknown School";
    const extractedSchoolId =
      firstStudent?.schoolId || students[0]?.schoolId || "N/A";

    const uniqueSections = [
      ...new Set(sortedDisplayRows.map((r) => r.section).filter(Boolean)),
    ];
    const dynamicSectionLabel =
      section === "All"
        ? uniqueSections.length > 1
          ? "Multiple Sections (" + gradeLevel + ")"
          : uniqueSections[0] || "All " + gradeLevel
        : section;

    const payload = {
      meta: {
        schoolName: extractedSchoolName.toUpperCase().trim(),
        schoolId: extractedSchoolId,
        section: dynamicSectionLabel,
        sy: sy,
        period: period,
        date: new Date().toLocaleDateString("en-PH"),
      },
      learners: sortedDisplayRows.map((r) => ({
        lrn: r.lrn || "—",
        name: r.name,
        sex: r.sex,
        age: r.age ?? "N/A",
        weight: r.lastRec?.weight ?? "—",
        height: r.lastRec?.height != null ? formatHeightMeters(r.lastRec.height) : "—",
        bmi: r.bmi ? parseFloat(r.bmi).toFixed(2) : "—",
        wfa: r.status?.label || "—",
        hfa: r.haz?.label || "—",
        section: r.section || "Unassigned",
      })),
    };

    requestPrint(learnerListDocument(payload));
  }

  return (
    <div className="page">
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-sub">
            Generate BMI and nutritional status summaries
          </p>
        </div>
        <button className="btn btn-secondary" onClick={handlePdfPreview}>
          👁 Preview Report
        </button>
      </div>

      <div className="filter-row no-print">
        <div className="form-group">
          <label className="form-label">School Year</label>
          <select
            className="form-select"
            value={sy}
            onChange={(e) => setSy(e.target.value)}
          >
            {SCHOOL_YEARS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Period</label>
          <select
            className="form-select"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {QUARTERS.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Grade Level</label>
          <select
            className="form-select"
            value={gradeLevel}
            onChange={(e) => {
              setGradeLevel(e.target.value);
              setSection("All");
            }}
          >
            <option value="All">All Grade Levels</option>
            {GRADE_LEVELS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Section</label>
          <select
            className="form-select"
            value={section}
            onChange={(e) => setSection(e.target.value)}
            disabled={gradeLevel === "All"}
          >
            <option value="All">All Sections</option>
            {[
              ...new Set(
                students
                  .filter(
                    (st) =>
                      gradeLevel === "All" ||
                      st.section?.startsWith(gradeLevel),
                  )
                  .map((st) => st.section),
              ),
            ]
              .sort()
              .map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
          </select>
        </div>

        <LearnerScopeSelect
          label="Learners"
          className="form-select"
          value={learnerScope}
          onChange={setLearnerScope}
        />

        <div className="form-group">
          <label className="form-label">Nutritional Status</label>
          <select
            className="form-select"
            value={nutritionFilter}
            onChange={(e) => setNutritionFilter(e.target.value)}
          >
            <option value="All">All</option>
            <option value="Normal">Normal</option>
            <option value="Wasted">Wasted</option>
            <option value="Severely Wasted">Severely Wasted</option>
            <option value="Overweight">Overweight</option>
            <option value="Obese">Obese</option>
          </select>
        </div>
      </div>

      {sortedDisplayRows.length === 0 ? (
        <div
          className="card empty-state center"
          style={{ padding: "40px", marginTop: "20px" }}
        >
          <p style={{ color: "#666" }}>
            No records found matching the active selection filters.
          </p>
        </div>
      ) : (
        <div className="card" style={{ marginTop: "20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "15px",
              alignItems: "flex-start",
              gap: "16px",
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>
                Learner Log Summary ({sortedDisplayRows.length} total)
              </h3>
              <div style={{ marginTop: "4px", fontSize: "13px", color: "#475569" }}>
                Male: <strong>{maleCount}</strong> &nbsp;·&nbsp; Female: <strong>{femaleCount}</strong>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {countRow("BMI", counts)}
              {countRow("HFA", hfaCounts)}
            </div>
          </div>

          <table
            className="reports-table"
            style={{ width: "100%", borderCollapse: "collapse" }}
          >
            <thead>
              <tr
                style={{
                  background: "#f8f9fa",
                  textAlign: "left",
                  borderBottom: "2px solid #dee2e6",
                }}
              >
                <th style={{ padding: "10px" }}>No.</th>
                <th style={{ padding: "10px" }}>Name</th>
                <th style={{ padding: "10px" }}>Sex</th>
                <th style={{ padding: "10px" }}>Birthdate</th>
                <th style={{ padding: "10px" }}>Age</th>
                <th style={{ padding: "10px" }}>Weight (kg)</th>
                <th style={{ padding: "10px" }}>Height (m)</th>
                <th style={{ padding: "10px" }}>BMI</th>
                <th style={{ padding: "10px" }}>BMI Status</th>
                <th style={{ padding: "10px" }}>HFA Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedDisplayRows.map((student, idx) => (
                <tr
                  key={student.id || idx}
                  style={{ borderBottom: "1px solid #dee2e6" }}
                >
                  <td style={{ padding: "10px" }}>{idx + 1}</td>
                  <td style={{ padding: "10px" }}>
                    <strong>{student.name}</strong>
                  </td>
                  <td style={{ padding: "10px" }}>{student.sex}</td>
                  <td style={{ padding: "10px" }}>
                    {student.birthdate
                      ? formatBirthdate(student.birthdate)
                      : "—"}
                  </td>
                  <td style={{ padding: "10px" }}>{student.age}</td>
                  <td style={{ padding: "10px" }}>{student.lastRec?.weight}</td>
                  <td style={{ padding: "10px" }}>{formatHeightMeters(student.lastRec?.height)}</td>
                  <td style={{ padding: "10px" }}>
                    {student.bmi ? parseFloat(student.bmi).toFixed(2) : "—"}
                  </td>
                  <td style={{ padding: "10px" }}>
                    {student.status?.label ? <Badge label={student.status.label} /> : "—"}
                  </td>
                  <td style={{ padding: "10px" }}>
                    {student.haz?.label ? <Badge label={student.haz.label} /> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
