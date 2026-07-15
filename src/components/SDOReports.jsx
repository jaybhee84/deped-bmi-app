import React, { useState, useMemo, useEffect } from "react";
import {
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  SCHOOL_YEARS,
  QUARTERS,
} from "../utils/bmi";
import Badge from "./Badge";
import "./Reports.css";
import { SCHOOL_OPTIONS } from "../utils/schools.js";

// ── Grade x Sex summary helpers (DepEd consolidated report format) ────────
// Matches the shape expected by buildDepedReportHtml() in main.js:
// { rows: [{ grade, M, F, Total }], grand: { M, F, Total } }
// where each stats object is:
// { enrolment, weighed, bmi: {label: n}, hfa: {label: n}, takenHeight }

function emptyStats() {
  return {
    enrolment: 0,
    weighed: 0,
    bmi: {
      "Severely Wasted": 0,
      Wasted: 0,
      Normal: 0,
      Overweight: 0,
      Obese: 0,
    },
    hfa: {
      "Severely Stunted": 0,
      Stunted: 0,
      Normal: 0,
      Tall: 0,
    },
    takenHeight: 0,
  };
}

function mergeStats(a, b) {
  return {
    enrolment: a.enrolment + b.enrolment,
    weighed: a.weighed + b.weighed,
    bmi: Object.fromEntries(
      Object.keys(a.bmi).map((k) => [k, a.bmi[k] + b.bmi[k]]),
    ),
    hfa: Object.fromEntries(
      Object.keys(a.hfa).map((k) => [k, a.hfa[k] + b.hfa[k]]),
    ),
    takenHeight: a.takenHeight + b.takenHeight,
  };
}

function computeSexStats(students, sy, period) {
  const stats = emptyStats();
  stats.enrolment = students.length;

  students.forEach((s) => {
    const rec = s.records?.find((r) => r.sy === sy && r.q === period);

    function computeSexStats(students, sy, period) {
      const stats = emptyStats();
      stats.enrolment = students.length;

      students.forEach((s) => {
        const rec = s.records?.find((r) => r.sy === sy && r.q === period);

        console.log("Student:", s.name);
        console.log("Record:", rec);
        console.log("Weight:", rec?.weight);
        console.log("Height:", rec?.height);

        if (!rec) return;

        if (rec.weight && rec.height) {
          stats.weighed++;

          const bmi = calcBMI(rec.weight, rec.height);

          if (bmi) {
            const status = getBMIStatus(bmi, s.sex, s.birthdate);

            if (status?.label && stats.bmi[status.label] !== undefined) {
              stats.bmi[status.label]++;
            }
          }
        }

        if (rec.height) {
          stats.takenHeight++;

          const haz = getHAZStatus(rec.height, s.sex, s.birthdate);

          if (haz?.label && stats.hfa[haz.label] !== undefined) {
            stats.hfa[haz.label]++;
          }
        }
      });

      return stats;
    }
    if (!rec) return;

    if (rec.weight && rec.height) {
      stats.weighed++;
      const bmi = calcBMI(rec.weight, rec.height);
      if (bmi) {
        const status = getBMIStatus(bmi, s.sex, s.birthdate);
        if (status?.label && stats.bmi[status.label] !== undefined) {
          stats.bmi[status.label]++;
        }
      }
    }

    if (rec.height) {
      stats.takenHeight++;
      const haz = getHAZStatus(rec.height, s.sex, s.birthdate);
      if (haz?.label && stats.hfa[haz.label] !== undefined) {
        stats.hfa[haz.label]++;
      }
    }
  });

  return stats;
}

function computeGradeSummary(students, sy, period) {
  const grades = [
    "Kinder",
    "Grade 1",
    "Grade 2",
    "Grade 3",
    "Grade 4",
    "Grade 5",
    "Grade 6",
    "SPED",
  ];

  const rows = grades.map((grade) => {
    const gradeStudents = students.filter((s) => {
      const studentGrade = s.section?.split(" - ")[0] || "";
      return studentGrade === grade;
    });

    const M = computeSexStats(
      gradeStudents.filter((s) => s.sex === "M"),
      sy,
      period,
    );

    const F = computeSexStats(
      gradeStudents.filter((s) => s.sex === "F"),
      sy,
      period,
    );

    const Total = mergeStats(M, F);

    return {
      grade,
      M,
      F,
      Total,
    };
  });

  let grandM = emptyStats();
  let grandF = emptyStats();

  rows.forEach((row) => {
    grandM = mergeStats(grandM, row.M);
    grandF = mergeStats(grandF, row.F);
  });

  const grand = {
    M: grandM,
    F: grandF,
    Total: mergeStats(grandM, grandF),
  };

  return {
    rows,
    grand,
  };
}
function getGradeColor(grade) {
  switch (grade) {
    case "Kinder":
      return "#e0f2fe";

    case "Grade 1":
      return "#ecfccb";

    case "Grade 2":
      return "#fef3c7";

    case "Grade 3":
      return "#fde2e2";

    case "Grade 4":
      return "#ede9fe";

    case "Grade 5":
      return "#fce7f3";

    case "Grade 6":
      return "#cffafe";

    case "SPED":
      return "#e5e7eb";

    default:
      return "#ffffff";
  }
}

function pct(value, total) {
  if (!total) return "0.00%";
  return ((value / total) * 100).toFixed(2) + "%";
}

function computeSchoolSummary(allSchoolsData, sy, period) {
  const rows = Object.keys(allSchoolsData).map((school) => {
    const schoolStudents = allSchoolsData[school] || [];

    const M = computeSexStats(
      schoolStudents.filter((s) => s.sex === "M"),
      sy,
      period,
    );

    const F = computeSexStats(
      schoolStudents.filter((s) => s.sex === "F"),
      sy,
      period,
    );

    const Total = mergeStats(M, F);

    return {
      grade: school, // preserve existing print template field
      M,
      F,
      Total,
    };
  });

  let grandM = emptyStats();
  let grandF = emptyStats();

  rows.forEach((r) => {
    grandM = mergeStats(grandM, r.M);
    grandF = mergeStats(grandF, r.F);
  });

  const grand = {
    M: grandM,
    F: grandF,
    Total: mergeStats(grandM, grandF),
  };

  return { rows, grand };
}

export default function SDOReports({
  allSchoolsData = {},
  selectedSchool: selectedSchoolProp,
  setSelectedSchool: setSelectedSchoolProp,
}) {
  console.log("allSchoolsData =", allSchoolsData);
  // If the parent app lifts school-selection state (like it does for
  // SDODashboard), use that so the selection stays in sync across pages.
  // Otherwise fall back to local state so this component still works
  // standalone.
  const [localSelectedSchool, setLocalSelectedSchool] =
    useState("CONSOLIDATED");
  const selectedSchool = selectedSchoolProp ?? localSelectedSchool;
  const setSelectedSchool = setSelectedSchoolProp ?? setLocalSelectedSchool;

  const [sy, setSy] = useState("2026–2027");
  const [period, setPeriod] = useState("Baseline");
  const [nutritionFilter, setNutritionFilter] = useState("All");

  const students = useMemo(() => {
    if (selectedSchool === "CONSOLIDATED" || selectedSchool === "ALL SCHOOLS") {
      return Object.values(allSchoolsData).flat();
    }

    return allSchoolsData[selectedSchool] || [];
  }, [selectedSchool, allSchoolsData]);

  useEffect(() => {
    console.log("Selected School:", selectedSchool);

    console.log("Available School Keys:", Object.keys(allSchoolsData));

    console.log(
      "Students Found:",
      selectedSchool === "ALL SCHOOLS"
        ? Object.values(allSchoolsData).flat().length
        : (allSchoolsData[selectedSchool] || []).length,
    );

    console.log("Selected School Data:", allSchoolsData[selectedSchool]);
  }, [selectedSchool, allSchoolsData]);

  const filtered = students.filter((s) => {
    return (s.records || []).some((r) => r.sy === sy && r.q === period);
  });

  const rows = filtered
    .map((s) => {
      const rec = s.records.find((r) => r.sy === sy && r.q === period);
      if (!rec) return null;
      const bmi = calcBMI(rec.weight, rec.height);
      const status = bmi ? getBMIStatus(bmi, s.sex, s.birthdate) : null;
      const haz = getHAZStatus(rec.height, s.sex, s.birthdate);
      return {
        ...s,
        bmi,
        status,
        haz,
        grade: s.section?.split(" - ")[0] || "",
        lastRec: rec,
      };
    })
    .filter(Boolean);

  const displayRows = rows.filter((r) => {
    if (nutritionFilter === "All") return true;
    return r.status?.label === nutritionFilter;
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

  displayRows.sort((a, b) => {
    const gradeDiff =
      (gradeOrder[a.grade] ?? 999) - (gradeOrder[b.grade] ?? 999);
    if (gradeDiff !== 0) return gradeDiff;
    return a.name.localeCompare(b.name);
  });
  const summaryRows = useMemo(() => {
    return computeSchoolSummary(allSchoolsData, sy, period).rows;
  }, [allSchoolsData, sy, period]);

  const reportData = useMemo(() => {
    const reportStudents =
      selectedSchool === "CONSOLIDATED"
        ? Object.values(allSchoolsData).flat()
        : students;

    return computeGradeSummary(reportStudents, sy, period);
  }, [selectedSchool, allSchoolsData, students, sy, period]);

  const counts = {
    Normal: 0,
    Wasted: 0,
    "Severely Wasted": 0,
    Overweight: 0,
    Obese: 0,
    "No Data": 0,
  };
  displayRows.forEach((r) => {
    if (r.status) counts[r.status.label]++;
    else counts["No Data"]++;
  });

  // ── Print Summary (selected school only) ────────────────────────────────
  function handlePrintSummary() {
    if (selectedSchool === "ALL SCHOOLS") {
      alert(
        "Select a specific school first, or use 'Print Summary (All Schools)' for the consolidated report.",
      );
      return;
    }
    if (!students.length) {
      alert("No student records found for this school.");
      return;
    }

    const { rows: gradeRows, grand } = computeSchoolSummary(
      allSchoolsData,
      sy,
      period,
    );

    const payload = {
      meta: {
        schoolName: selectedSchool,
        period,
        sy,
        date: new Date().toLocaleDateString("en-PH"),
      },
      rows: gradeRows,
      grand,
    };

    if (window.electronAPI?.generatePrintPreviewSummary) {
      window.electronAPI.generatePrintPreviewSummary(payload);
    } else {
      alert("Electron API summary preview channel not detected.");
    }
  }

  // ── Print Summary (all schools consolidated) ────────────────────────────
  function handlePrintSummaryAllSchools() {
    const allStudents = Object.values(allSchoolsData).flat();

    if (!allStudents.length) {
      alert("No student records found across any school.");
      return;
    }

    const { rows: gradeRows, grand } = computeSchoolSummary(
      allStudents,
      sy,
      period,
    );

    const payload = {
      meta: {
        schoolName: "ALL SCHOOLS — Isabela City Schools Division Office",
        period,
        sy,
        date: new Date().toLocaleDateString("en-PH"),
      },
      rows: gradeRows,
      grand,
    };

    if (window.electronAPI?.generatePrintPreviewSummary) {
      window.electronAPI.generatePrintPreviewSummary(payload);
    } else {
      alert("Electron API summary preview channel not detected.");
    }
  }

  function handlePrintReport() {
    const payload = {
      reportType: "landscape",

      meta: {
        schoolName:
          selectedSchool === "CONSOLIDATED"
            ? "ISABELA CITY SCHOOLS DIVISION OFFICE"
            : selectedSchool,

        sy,
        period,
        date: new Date().toLocaleDateString("en-PH"),
      },

      rows: reportData.rows,
      grand: reportData.grand,
    };

    window.electronAPI.generatePrintPreview(payload);
  }

  return (
    <div className="page">
      <div className="filter-row no-print">
        {/* School */}
        <div className="form-group">
          <label className="form-label">School</label>
          <select
            className="form-select"
            value={selectedSchool}
            onChange={(e) => setSelectedSchool(e.target.value)}
          >
            <option value="CONSOLIDATED">Consolidated Report</option>

            <option value="ALL SCHOOLS">All Schools</option>

            {SCHOOL_OPTIONS.filter((school) => {
              const s = school.toLowerCase();

              return (
                !s.includes("high school") &&
                !s.includes("national high school") &&
                !s.includes("nhs") &&
                school !== "ALL SCHOOLS"
              );
            })
              .sort((a, b) => a.localeCompare(b))
              .map((school) => (
                <option key={school} value={school}>
                  {school}
                </option>
              ))}
          </select>
        </div>

        {/* School Year */}
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

        {/* Period */}
        <div className="form-group">
          <label className="form-label">Period</label>
          <select
            className="form-select"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {QUARTERS.map((q) => (
              <option key={q}>{q}</option>
            ))}
          </select>
        </div>

        {/* Section (grade-level dropdown removed; sections list across
            whichever school is currently selected) */}

        {/* Nutritional Status */}
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

      {/* Print header */}
      <div className="print-header">
        <p>
          School: {selectedSchool}
          {" | "}
          School Year: {sy}
          {" | "}
          Period: {period}
          {" | "}
          Status: {nutritionFilter}
        </p>
        <p>Total Learners: {displayRows.length}</p>
      </div>

      {/* Summary row */}
      <div className="report-summary no-print">
        {Object.entries(counts).map(([label, count]) => (
          <div key={label} className="summary-pill">
            <span className="summary-count">{count}</span>
            <span className="summary-label">{label}</span>
          </div>
        ))}

        <button className="btn btn-primary" onClick={handlePrintReport}>
          🖨 Print Report
        </button>
      </div>

      <div
        className="card"
        style={{
          display: "block",
          width: "calc(100vw - 280px)",
          maxWidth: "none",
          boxSizing: "border-box",
          border: "3px solid red",
        }}
      >
        <h2 style={{ textAlign: "center", marginBottom: 5 }}>
          DEPED NUTRITIONAL STATUS REPORT
        </h2>

        <div
          style={{
            textAlign: "center",
            marginBottom: 20,
            fontWeight: 600,
          }}
        >
          {selectedSchool === "CONSOLIDATED"
            ? "ISABELA CITY SCHOOLS DIVISION OFFICE"
            : selectedSchool}
          <br />
          {period} | {sy}
        </div>

        <div
          style={{
            overflowX: "auto",
            width: "100%",
          }}
        >
          <table
            className="data-table"
            style={{
              width: "100%",
              tableLayout: "auto",
            }}
          >
            <thead>
              <tr>
                <th rowSpan="3">Grade Levels</th>
                <th rowSpan="3">Sex</th>
                <th rowSpan="3">Enrolment</th>

                <th colSpan="2" rowSpan="2">
                  Pupils Weighed
                </th>

                <th colSpan="10">Body Mass Index (BMI)</th>

                <th colSpan="8">Height-for-Age (HFA)</th>

                <th colSpan="2" rowSpan="2">
                  Pupils Taken Height
                </th>
              </tr>

              <tr>
                <th colSpan="2">Severely Wasted</th>
                <th colSpan="2">Wasted</th>
                <th colSpan="2">Normal</th>
                <th colSpan="2">Overweight</th>
                <th colSpan="2">Obese</th>

                <th colSpan="2">Severely Stunted</th>
                <th colSpan="2">Stunted</th>
                <th colSpan="2">Normal</th>
                <th colSpan="2">Tall</th>
              </tr>

              <tr>
                <th>No.</th>
                <th>%</th>

                <th>No.</th>
                <th>%</th>

                <th>No.</th>
                <th>%</th>

                <th>No.</th>
                <th>%</th>

                <th>No.</th>
                <th>%</th>

                <th>No.</th>
                <th>%</th>

                <th>No.</th>
                <th>%</th>

                <th>No.</th>
                <th>%</th>

                <th>No.</th>
                <th>%</th>

                <th>No.</th>
                <th>%</th>

                <th>No.</th>
                <th>%</th>
              </tr>
            </thead>

            <tbody>
              {reportData.rows.map((row) => (
                <React.Fragment key={row.grade}>
                  <tr style={{ backgroundColor: getGradeColor(row.grade) }}>
                    <td rowSpan={3} style={{ fontWeight: "bold" }}>
                      {row.grade}
                    </td>

                    <td>M</td>
                    <td>{row.M.enrolment}</td>

                    <td>{row.M.weighed}</td>
                    <td>{pct(row.M.weighed, row.M.enrolment)}</td>

                    <td>{row.M.bmi["Severely Wasted"]}</td>
                    <td>{pct(row.M.bmi["Severely Wasted"], row.M.weighed)}</td>

                    <td>{row.M.bmi["Wasted"]}</td>
                    <td>{pct(row.M.bmi["Wasted"], row.M.weighed)}</td>

                    <td>{row.M.bmi["Normal"]}</td>
                    <td>{pct(row.M.bmi["Normal"], row.M.weighed)}</td>

                    <td>{row.M.bmi["Overweight"]}</td>
                    <td>{pct(row.M.bmi["Overweight"], row.M.weighed)}</td>

                    <td>{row.M.bmi["Obese"]}</td>
                    <td>{pct(row.M.bmi["Obese"], row.M.weighed)}</td>

                    <td>{row.M.hfa["Severely Stunted"]}</td>
                    <td>
                      {pct(row.M.hfa["Severely Stunted"], row.M.takenHeight)}
                    </td>

                    <td>{row.M.hfa["Stunted"]}</td>
                    <td>{pct(row.M.hfa["Stunted"], row.M.takenHeight)}</td>

                    <td>{row.M.hfa["Normal"]}</td>
                    <td>{pct(row.M.hfa["Normal"], row.M.takenHeight)}</td>

                    <td>{row.M.hfa["Tall"]}</td>
                    <td>{pct(row.M.hfa["Tall"], row.M.takenHeight)}</td>

                    <td>{row.M.takenHeight}</td>
                    <td>{pct(row.M.takenHeight, row.M.enrolment)}</td>
                  </tr>

                  <tr style={{ backgroundColor: getGradeColor(row.grade) }}>
                    <td>F</td>
                    <td>{row.F.enrolment}</td>

                    <td>{row.F.weighed}</td>
                    <td>{pct(row.F.weighed, row.F.enrolment)}</td>

                    <td>{row.F.bmi["Severely Wasted"]}</td>
                    <td>{pct(row.F.bmi["Severely Wasted"], row.F.weighed)}</td>

                    <td>{row.F.bmi["Wasted"]}</td>
                    <td>{pct(row.F.bmi["Wasted"], row.F.weighed)}</td>

                    <td>{row.F.bmi["Normal"]}</td>
                    <td>{pct(row.F.bmi["Normal"], row.F.weighed)}</td>

                    <td>{row.F.bmi["Overweight"]}</td>
                    <td>{pct(row.F.bmi["Overweight"], row.F.weighed)}</td>

                    <td>{row.F.bmi["Obese"]}</td>
                    <td>{pct(row.F.bmi["Obese"], row.F.weighed)}</td>

                    <td>{row.F.hfa["Severely Stunted"]}</td>
                    <td>
                      {pct(row.F.hfa["Severely Stunted"], row.F.takenHeight)}
                    </td>

                    <td>{row.F.hfa["Stunted"]}</td>
                    <td>{pct(row.F.hfa["Stunted"], row.F.takenHeight)}</td>

                    <td>{row.F.hfa["Normal"]}</td>
                    <td>{pct(row.F.hfa["Normal"], row.F.takenHeight)}</td>

                    <td>{row.F.hfa["Tall"]}</td>
                    <td>{pct(row.F.hfa["Tall"], row.F.takenHeight)}</td>

                    <td>{row.F.takenHeight}</td>
                    <td>{pct(row.F.takenHeight, row.F.enrolment)}</td>
                  </tr>

                  <tr
                    style={{
                      backgroundColor: getGradeColor(row.grade),
                      fontWeight: "bold",
                    }}
                  >
                    <td>Total</td>
                    <td>{row.Total.enrolment}</td>

                    <td>{row.Total.weighed}</td>
                    <td>{pct(row.Total.weighed, row.Total.enrolment)}</td>

                    <td>{row.Total.bmi["Severely Wasted"]}</td>
                    <td>
                      {pct(row.Total.bmi["Severely Wasted"], row.Total.weighed)}
                    </td>

                    <td>{row.Total.bmi["Wasted"]}</td>
                    <td>{pct(row.Total.bmi["Wasted"], row.Total.weighed)}</td>

                    <td>{row.Total.bmi["Normal"]}</td>
                    <td>{pct(row.Total.bmi["Normal"], row.Total.weighed)}</td>

                    <td>{row.Total.bmi["Overweight"]}</td>
                    <td>
                      {pct(row.Total.bmi["Overweight"], row.Total.weighed)}
                    </td>

                    <td>{row.Total.bmi["Obese"]}</td>
                    <td>{pct(row.Total.bmi["Obese"], row.Total.weighed)}</td>

                    <td>{row.Total.hfa["Severely Stunted"]}</td>
                    <td>
                      {pct(
                        row.Total.hfa["Severely Stunted"],
                        row.Total.takenHeight,
                      )}
                    </td>

                    <td>{row.Total.hfa["Stunted"]}</td>
                    <td>
                      {pct(row.Total.hfa["Stunted"], row.Total.takenHeight)}
                    </td>

                    <td>{row.Total.hfa["Normal"]}</td>
                    <td>
                      {pct(row.Total.hfa["Normal"], row.Total.takenHeight)}
                    </td>

                    <td>{row.Total.hfa["Tall"]}</td>
                    <td>{pct(row.Total.hfa["Tall"], row.Total.takenHeight)}</td>

                    <td>{row.Total.takenHeight}</td>
                    <td>{pct(row.Total.takenHeight, row.Total.enrolment)}</td>
                  </tr>
                </React.Fragment>
              ))}

              <tr
                style={{
                  backgroundColor: "#FFE69C",
                  color: "#5A4300",
                  fontWeight: "bold",
                }}
              >
                <td rowSpan={3}>GRAND TOTAL</td>

                <td>M</td>
                <td>{reportData.grand.M.enrolment}</td>

                <td>{reportData.grand.M.weighed}</td>
                <td>
                  {pct(
                    reportData.grand.M.weighed,
                    reportData.grand.M.enrolment,
                  )}
                </td>

                <td>{reportData.grand.M.bmi["Severely Wasted"]}</td>
                <td>
                  {pct(
                    reportData.grand.M.bmi["Severely Wasted"],
                    reportData.grand.M.weighed,
                  )}
                </td>

                <td>{reportData.grand.M.bmi["Wasted"]}</td>
                <td>
                  {pct(
                    reportData.grand.M.bmi["Wasted"],
                    reportData.grand.M.weighed,
                  )}
                </td>

                <td>{reportData.grand.M.bmi["Normal"]}</td>
                <td>
                  {pct(
                    reportData.grand.M.bmi["Normal"],
                    reportData.grand.M.weighed,
                  )}
                </td>

                <td>{reportData.grand.M.bmi["Overweight"]}</td>
                <td>
                  {pct(
                    reportData.grand.M.bmi["Overweight"],
                    reportData.grand.M.weighed,
                  )}
                </td>

                <td>{reportData.grand.M.bmi["Obese"]}</td>
                <td>
                  {pct(
                    reportData.grand.M.bmi["Obese"],
                    reportData.grand.M.weighed,
                  )}
                </td>

                <td>{reportData.grand.M.hfa["Severely Stunted"]}</td>
                <td>
                  {pct(
                    reportData.grand.M.hfa["Severely Stunted"],
                    reportData.grand.M.takenHeight,
                  )}
                </td>

                <td>{reportData.grand.M.hfa["Stunted"]}</td>
                <td>
                  {pct(
                    reportData.grand.M.hfa["Stunted"],
                    reportData.grand.M.takenHeight,
                  )}
                </td>

                <td>{reportData.grand.M.hfa["Normal"]}</td>
                <td>
                  {pct(
                    reportData.grand.M.hfa["Normal"],
                    reportData.grand.M.takenHeight,
                  )}
                </td>

                <td>{reportData.grand.M.hfa["Tall"]}</td>
                <td>
                  {pct(
                    reportData.grand.M.hfa["Tall"],
                    reportData.grand.M.takenHeight,
                  )}
                </td>

                <td>{reportData.grand.M.takenHeight}</td>
                <td>
                  {pct(
                    reportData.grand.M.takenHeight,
                    reportData.grand.M.enrolment,
                  )}
                </td>
              </tr>

              <tr
                style={{
                  backgroundColor: "#FFE69C",
                  color: "#5A4300",
                  fontWeight: "bold",
                }}
              >
                <td>F</td>

                <td>{reportData.grand.F.enrolment}</td>

                <td>{reportData.grand.F.weighed}</td>
                <td>
                  {pct(
                    reportData.grand.F.weighed,
                    reportData.grand.F.enrolment,
                  )}
                </td>

                <td>{reportData.grand.F.bmi["Severely Wasted"]}</td>
                <td>
                  {pct(
                    reportData.grand.F.bmi["Severely Wasted"],
                    reportData.grand.F.weighed,
                  )}
                </td>

                <td>{reportData.grand.F.bmi["Wasted"]}</td>
                <td>
                  {pct(
                    reportData.grand.F.bmi["Wasted"],
                    reportData.grand.F.weighed,
                  )}
                </td>

                <td>{reportData.grand.F.bmi["Normal"]}</td>
                <td>
                  {pct(
                    reportData.grand.F.bmi["Normal"],
                    reportData.grand.F.weighed,
                  )}
                </td>

                <td>{reportData.grand.F.bmi["Overweight"]}</td>
                <td>
                  {pct(
                    reportData.grand.F.bmi["Overweight"],
                    reportData.grand.F.weighed,
                  )}
                </td>

                <td>{reportData.grand.F.bmi["Obese"]}</td>
                <td>
                  {pct(
                    reportData.grand.F.bmi["Obese"],
                    reportData.grand.F.weighed,
                  )}
                </td>

                <td>{reportData.grand.F.hfa["Severely Stunted"]}</td>
                <td>
                  {pct(
                    reportData.grand.F.hfa["Severely Stunted"],
                    reportData.grand.F.takenHeight,
                  )}
                </td>

                <td>{reportData.grand.F.hfa["Stunted"]}</td>
                <td>
                  {pct(
                    reportData.grand.F.hfa["Stunted"],
                    reportData.grand.F.takenHeight,
                  )}
                </td>

                <td>{reportData.grand.F.hfa["Normal"]}</td>
                <td>
                  {pct(
                    reportData.grand.F.hfa["Normal"],
                    reportData.grand.F.takenHeight,
                  )}
                </td>

                <td>{reportData.grand.F.hfa["Tall"]}</td>
                <td>
                  {pct(
                    reportData.grand.F.hfa["Tall"],
                    reportData.grand.F.takenHeight,
                  )}
                </td>

                <td>{reportData.grand.F.takenHeight}</td>
                <td>
                  {pct(
                    reportData.grand.F.takenHeight,
                    reportData.grand.F.enrolment,
                  )}
                </td>
              </tr>

              <tr
                style={{
                  backgroundColor: "#FFE69C",
                  color: "#5A4300",
                  fontWeight: "bold",
                }}
              >
                <td>Total</td>

                <td>{reportData.grand.Total.enrolment}</td>

                <td>{reportData.grand.Total.weighed}</td>
                <td>
                  {pct(
                    reportData.grand.Total.weighed,
                    reportData.grand.Total.enrolment,
                  )}
                </td>

                <td>{reportData.grand.Total.bmi["Severely Wasted"]}</td>
                <td>
                  {pct(
                    reportData.grand.Total.bmi["Severely Wasted"],
                    reportData.grand.Total.weighed,
                  )}
                </td>

                <td>{reportData.grand.Total.bmi["Wasted"]}</td>
                <td>
                  {pct(
                    reportData.grand.Total.bmi["Wasted"],
                    reportData.grand.Total.weighed,
                  )}
                </td>

                <td>{reportData.grand.Total.bmi["Normal"]}</td>
                <td>
                  {pct(
                    reportData.grand.Total.bmi["Normal"],
                    reportData.grand.Total.weighed,
                  )}
                </td>

                <td>{reportData.grand.Total.bmi["Overweight"]}</td>
                <td>
                  {pct(
                    reportData.grand.Total.bmi["Overweight"],
                    reportData.grand.Total.weighed,
                  )}
                </td>

                <td>{reportData.grand.Total.bmi["Obese"]}</td>
                <td>
                  {pct(
                    reportData.grand.Total.bmi["Obese"],
                    reportData.grand.Total.weighed,
                  )}
                </td>

                <td>{reportData.grand.Total.hfa["Severely Stunted"]}</td>
                <td>
                  {pct(
                    reportData.grand.Total.hfa["Severely Stunted"],
                    reportData.grand.Total.takenHeight,
                  )}
                </td>

                <td>{reportData.grand.Total.hfa["Stunted"]}</td>
                <td>
                  {pct(
                    reportData.grand.Total.hfa["Stunted"],
                    reportData.grand.Total.takenHeight,
                  )}
                </td>

                <td>{reportData.grand.Total.hfa["Normal"]}</td>
                <td>
                  {pct(
                    reportData.grand.Total.hfa["Normal"],
                    reportData.grand.Total.takenHeight,
                  )}
                </td>

                <td>{reportData.grand.Total.hfa["Tall"]}</td>
                <td>
                  {pct(
                    reportData.grand.Total.hfa["Tall"],
                    reportData.grand.Total.takenHeight,
                  )}
                </td>

                <td>{reportData.grand.Total.takenHeight}</td>
                <td>
                  {pct(
                    reportData.grand.Total.takenHeight,
                    reportData.grand.Total.enrolment,
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
