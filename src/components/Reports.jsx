import React, { useState, useEffect } from "react";
import {
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  SCHOOL_YEARS,
  GRADE_LEVELS,
  QUARTERS,
} from "../utils/bmi";
import Badge from "./Badge";
import "./Reports.css";
import {
  loadSbfpConfig,
  isOfficialBeneficiary,
  DEFAULT_SBFP_CONFIG,
} from "../utils/sbfpConfig";

function getSbfpKey(sy) {
  return "sbfp_settings_" + sy;
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
  const [sy, setSy] = useState(getDefaultSchoolYear);
  const [period, setPeriod] = useState("Baseline");
  const [section, setSection] = useState("All");
  const [gradeLevel, setGradeLevel] = useState("All");
  const [nutritionFilter, setNutritionFilter] = useState("All");
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
        const studentGrade = s.section?.split(" - ")[0] || "";
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
      const status = getBMIStatus(bmi, s.sex, s.birthdate);
      const haz = getHAZStatus(selectedRecord.height, s.sex, s.birthdate);

      return {
        ...s,
        bmi,
        status,
        haz,
        grade: s.section?.split(" - ")[0] || "",
        lastRec: selectedRecord,
      };
    })
    .filter(Boolean);

  const displayRows = rows.filter((s) => {
    if (nutritionFilter === "All") return true;
    if (nutritionFilter === "SBFP") {
      return isOfficialBeneficiary(s, s.status, s.haz, sbfpConfig);
    }
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
  };

  const sortedDisplayRows = [...displayRows].sort((a, b) => {
    const gradeDiff =
      (gradeOrder[a.grade] ?? 999) - (gradeOrder[b.grade] ?? 999);
    if (gradeDiff !== 0) return gradeDiff;

    const nameA = a?.name || "";
    const nameB = b?.name || "";
    return nameA.localeCompare(nameB);
  });

  const counts = {
    Normal: 0,
    Wasted: 0,
    "Severely Wasted": 0,
    Overweight: 0,
    Obese: 0,
  };

  sortedDisplayRows.forEach((r) => {
    if (r.status?.label && counts[r.status.label] !== undefined) {
      counts[r.status.label]++;
    }
  });

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
      reportType: "portrait",
      title: "School-Based Feeding Program (SBFP) Nutritional Report",
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
        height: r.lastRec?.height ?? "—",
        bmi: r.bmi ? parseFloat(r.bmi).toFixed(2) : "—",
        wfa: r.status?.label || "Normal",
        hfa: r.haz?.label || "Normal",
        section: r.section || "Unassigned",
      })),
    };

    if (window.electronAPI?.generatePrintPreview) {
      window.electronAPI.generatePrintPreview(payload);
    } else {
      alert("Electron API preview channel not detected.");
    }
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
            <option value="SBFP">SBFP Beneficiaries</option>
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
              alignItems: "center",
            }}
          >
            <h3 style={{ margin: 0 }}>
              Learner Log Summary ({sortedDisplayRows.length} total)
            </h3>
            <div style={{ display: "flex", gap: "15px", fontSize: "13px" }}>
              <span>
                🟢 Normal: <strong>{counts.Normal}</strong>
              </span>
              <span>
                🟡 Wasted: <strong>{counts.Wasted}</strong>
              </span>
              <span>
                🔴 Severely Wasted: <strong>{counts["Severely Wasted"]}</strong>
              </span>
              <span>
                🟠 Overweight: <strong>{counts.Overweight}</strong>
              </span>
              <span>
                🟤 Obese: <strong>{counts.Obese}</strong>
              </span>
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
                <th style={{ padding: "10px" }}>Age</th>
                <th style={{ padding: "10px" }}>Weight (kg)</th>
                <th style={{ padding: "10px" }}>Height (cm)</th>
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
                  <td style={{ padding: "10px" }}>{student.age}</td>
                  <td style={{ padding: "10px" }}>{student.lastRec?.weight}</td>
                  <td style={{ padding: "10px" }}>{student.lastRec?.height}</td>
                  <td style={{ padding: "10px" }}>
                    {student.bmi ? parseFloat(student.bmi).toFixed(2) : "—"}
                  </td>
                  <td style={{ padding: "10px" }}>
                    <Badge label={student.status?.label || "Normal"} />
                  </td>
                  <td style={{ padding: "10px" }}>
                    <Badge label={student.haz?.label || "Normal"} />
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
