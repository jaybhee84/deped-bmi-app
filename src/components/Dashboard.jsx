import React, { useMemo, useState, useRef } from "react";
import {
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  getSchoolYears,
  GRADE_LEVELS,
} from "../utils/bmi";
import Badge from "./Badge";
import "./Dashboard.css";

export default function Dashboard({ students }) {
  const [filterSY, setFilterSY] = useState("2026–2027");
  const [filterPeriod, setFilterPeriod] = useState("Baseline");
  const schoolYears = getSchoolYears();
  const incompleteDataRef = useRef(null);
  const syStudents = students.filter((s) =>
    s.records.some((r) => r.sy === filterSY),
  );
  const allLatestBMI = useMemo(() => {
    return students
      .map((s) => {
        const recs = s.records.filter(
          (r) => r.sy === filterSY && r.q === filterPeriod,
        );
        if (!recs.length) return null;
        const last = recs[recs.length - 1];
        const bmi = calcBMI(last.weight, last.height);
        return bmi
          ? { bmi, status: getBMIStatus(bmi, s.sex, s.birthdate), student: s }
          : null;
      })
      .filter(Boolean);
  }, [students, filterSY, filterPeriod]);

  const incompleteLearners = students.filter((s) => {
    const recs = s.records.filter(
      (r) => r.sy === filterSY && r.q === filterPeriod,
    );

    if (!recs.length) return true;

    const last = recs[recs.length - 1];

    return !last.weight || !last.height;
  });

  const hfaStatusCounts = useMemo(() => {
    const counts = {
      "Normal Height": 0,
      Stunted: 0,
      "Severely Stunted": 0,
      Tall: 0,
    };

    syStudents.forEach((s) => {
      const recs = s.records.filter(
        (r) => r.sy === filterSY && r.q === filterPeriod,
      );

      if (!recs.length) return;

      const last = recs[recs.length - 1];

      const haz = getHAZStatus(last.height, s.sex, s.birthdate);

      if (haz?.label === "Normal") {
        counts["Normal Height"]++;
      } else if (haz?.label) {
        counts[haz.label]++;
      }
    });

    return counts;
  }, [students, filterSY, filterPeriod]);

  const statusCounts = useMemo(() => {
    const c = {
      "Severely Wasted": 0,
      Wasted: 0,
      Normal: 0,
      Overweight: 0,
      Obese: 0,
      "No Data": 0,
    };
    syStudents.forEach((s) => {
      const recs = s.records.filter(
        (r) => r.sy === filterSY && r.q === filterPeriod,
      );
      if (!recs.length) {
        c["No Data"]++;
        return;
      }
      const last = recs[recs.length - 1];
      const bmi = calcBMI(last.weight, last.height);
      if (!bmi) {
        c["No Data"]++;
        return;
      }
      c[getBMIStatus(bmi, s.sex, s.birthdate).label]++;
    });
    return c;
  }, [students, filterSY, filterPeriod]);

  const barItems = [
    { label: "Normal", color: "#3B6D11" },
    { label: "Wasted", color: "#BA7517" },
    { label: "Overweight", color: "#BA7517" },
    { label: "Severely Wasted", color: "#A32D2D" },
    { label: "Obese", color: "#A32D2D" },
  ];

  const hfaCounts = useMemo(() => {
    const counts = {
      "Normal Height": 0,
      Stunted: 0,
      "Severely Stunted": 0,
      Tall: 0,
    };

    syStudents.forEach((s) => {
      const recs = s.records.filter(
        (r) => r.sy === filterSY && r.q === filterPeriod,
      );

      if (!recs.length) return;

      const last = recs[recs.length - 1];

      const haz = getHAZStatus(last.height, s.sex, s.birthdate);

      if (haz?.label === "Normal") {
        counts["Normal Height"]++;
      } else if (haz?.label) {
        counts[haz.label]++;
      }
    });

    return counts;
  }, [students, filterSY, filterPeriod]);

  const hfaBarItems = [
    {
      label: "Normal Height",
      color: "#3B6D11",
    },
    {
      label: "Stunted",
      color: "#BA7517",
    },
    {
      label: "Severely Stunted",
      color: "#A32D2D",
    },
    {
      label: "Tall",
      color: "#2563EB",
    },
  ];

  const gradeSummary = useMemo(() => {
    const summary = {};

    GRADE_LEVELS.forEach((grade) => {
      summary[grade] = {
        Male: {
          Normal: 0,
          Wasted: 0,
          "Severely Wasted": 0,
          Overweight: 0,
          Obese: 0,
          "Normal Height": 0,
          Stunted: 0,
          "Severely Stunted": 0,
          Tall: 0,
          Total: 0,
        },

        Female: {
          Normal: 0,
          Wasted: 0,
          "Severely Wasted": 0,
          Overweight: 0,
          Obese: 0,
          "Normal Height": 0,
          Stunted: 0,
          "Severely Stunted": 0,
          Tall: 0,
          Total: 0,
        },
      };
    });

    allLatestBMI.forEach((item) => {
      const grade = item.student.section?.split(" - ")[0];

      if (!grade || !summary[grade]) return;

      const sex = item.student.sex === "F" ? "Female" : "Male";

      summary[grade][sex].Total++;

      if (item.status?.label) {
        summary[grade][sex][item.status.label]++;
      }

      const haz = getHAZStatus(
        item.student.records[item.student.records.length - 1]?.height,
        item.student.sex,
        item.student.birthdate,
      );

      if (haz?.label === "Normal") {
        summary[grade][sex]["Normal Height"]++;
      } else if (haz?.label) {
        summary[grade][sex][haz.label]++;
      }
    });

    return summary;
  }, [allLatestBMI]);

  const gradeClassMap = {
    Kinder: "grade-kinder",
    "Grade 1": "grade-1",
    "Grade 2": "grade-2",
    "Grade 3": "grade-3",
    "Grade 4": "grade-4",
    "Grade 5": "grade-5",
    "Grade 6": "grade-6",
  };

  const gradeTotals = useMemo(() => {
    const totals = {};

    GRADE_LEVELS.forEach((grade) => {
      totals[grade] =
        gradeSummary[grade].Male.Total + gradeSummary[grade].Female.Total;
    });

    return totals;
  }, [gradeSummary]);

  const totalStudentsForPeriod = students.filter((s) =>
    s.records.some((r) => r.sy === filterSY && r.q === filterPeriod),
  ).length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">
            Nutritional status overview — School Year {filterSY}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: "8px",
          }}
        >
          <select
            className="form-select"
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
          >
            <option value="Baseline">Baseline</option>
            <option value="Midline">Midline</option>
            <option value="Endline">Endline</option>
          </select>

          <select
            className="form-select"
            value={filterSY}
            onChange={(e) => setFilterSY(e.target.value)}
          >
            {schoolYears.map((sy) => (
              <option key={sy}>{sy}</option>
            ))}
          </select>
        </div>
      </div>
      {/* Stat cards */}
      <div className="stat-grid">
        {[
          { label: "Total Students", val: syStudents.length, bg: "#EFF6FF" },
          { label: "With Records", val: allLatestBMI.length, bg: "#EAF3DE" },
          { label: "Normal", val: statusCounts["Normal"], bg: "#EAF3DE" },
          { label: "Wasted", val: statusCounts["Wasted"], bg: "#FAEEDA" },
          {
            label: "Severely Wasted",
            val: statusCounts["Severely Wasted"],
            bg: "#FCEBEB",
          },
          {
            label: "Overweight",
            val: statusCounts["Overweight"],
            bg: "#FAEEDA",
          },
          {
            label: "Obese",
            val: statusCounts["Obese"],
            bg: "#FCEBEB",
          },

          {
            label: "Normal Height",
            val: hfaStatusCounts["Normal Height"],
            bg: "#EAF3DE",
          },
          {
            label: "Stunted",
            val: hfaStatusCounts["Stunted"],
            bg: "#FAEEDA",
          },
          {
            label: "Severely Stunted",
            val: hfaStatusCounts["Severely Stunted"],
            bg: "#FCEBEB",
          },
          {
            label: "Tall",
            val: hfaStatusCounts["Tall"],
            bg: "#DBEAFE",
          },

          { label: "No Data", val: statusCounts["No Data"], bg: "#f198a7" },
        ].map((s) => (
          <div
            key={s.label}
            className="stat-card"
            style={{
              background: s.bg,
              cursor: s.label === "No Data" ? "pointer" : "default",
            }}
            onClick={() => {
              if (s.label === "No Data") {
                incompleteDataRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }
            }}
          >
            <div className="stat-num">{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>
      {/* Bar chart */}
      <div className="card">
        <h3 className="card-title">Nutritional Status Distribution</h3>
        {barItems.map((b) => {
          const pct = students.length
            ? (statusCounts[b.label] / students.length) * 100
            : 0;
          return (
            <div key={b.label} className="bar-row">
              <div className="bar-labels">
                <span>{b.label}</span>
                <span>
                  {statusCounts[b.label]} students ({pct.toFixed(1)}%)
                </span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${pct}%`, background: b.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="card">
        <h3 className="card-title">Height-for-Age Distribution</h3>

        {hfaBarItems.map((b) => {
          const pct = students.length
            ? (hfaCounts[b.label] / students.length) * 100
            : 0;

          return (
            <div key={b.label} className="bar-row">
              <div className="bar-labels">
                <span>{b.label}</span>

                <span>
                  {hfaCounts[b.label]} students ({pct.toFixed(1)}%)
                </span>
              </div>

              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${pct}%`,
                    background: b.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="card" ref={incompleteDataRef}>
        <h3 className="card-title">
          Learners with Incomplete Data ({incompleteLearners.length})
        </h3>

        <table className="data-table">
          <thead>
            <tr>
              <th>LRN</th>
              <th>Name</th>

              <th>Age</th>
              <th>Gender</th>
              <th>Grade Level - Section</th>
              <th>Remarks</th>
            </tr>
          </thead>

          <tbody>
            {incompleteLearners.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  All learners have complete data.
                </td>
              </tr>
            ) : (
              incompleteLearners.map((s) => {
                const recs = s.records.filter(
                  (r) => r.sy === filterSY && r.q === filterPeriod,
                );

                const missing = [];

                if (!s.birthdate) missing.push("Birthdate");

                if (!s.sex) missing.push("Sex");

                if (!s.age || s.age === 0) missing.push("Age");

                if (!recs.length) {
                  missing.push(`No ${filterSY} Record`);
                } else {
                  const last = recs[recs.length - 1];

                  if (!last.weight) missing.push("Weight");

                  if (!last.height) missing.push("Height");
                }

                const issue = missing.join(", ");

                return (
                  <tr key={s.id}>
                    <td>{s.lrn}</td>
                    <td>{s.name}</td>
                    <td>{s.age}</td>
                    <td>{s.sex}</td>
                    <td>{s.section}</td>
                    <td>
                      <span
                        style={{
                          color: "#dc2626",
                          fontWeight: 600,
                        }}
                      >
                        {issue}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3 className="card-title">
          Nutritional Status Distribution by Grade Level
        </h3>

        <table className="data-table">
          <thead>
            <tr>
              <th>Grade</th>
              <th>Sex</th>

              <th>Normal</th>
              <th>Wasted</th>
              <th>Severely Wasted</th>
              <th>Overweight</th>
              <th>Obese</th>

              <th>Normal Height</th>
              <th>Stunted</th>
              <th>Severely Stunted</th>
              <th>Tall</th>

              <th>Total</th>
            </tr>
          </thead>

          <tbody>
            {GRADE_LEVELS.map((grade) => (
              <React.Fragment key={grade}>
                <tr
                  className={`grade-row-${grade.replace(/\s+/g, "").toLowerCase()}`}
                >
                  <td
                    rowSpan={2}
                    style={{
                      backgroundColor:
                        grade === "Kinder"
                          ? "#FFF7ED"
                          : grade === "Grade 1"
                            ? "#EFF6FF"
                            : grade === "Grade 2"
                              ? "#F0FDF4"
                              : grade === "Grade 3"
                                ? "#FEFCE8"
                                : grade === "Grade 4"
                                  ? "#FDF2F8"
                                  : grade === "Grade 5"
                                    ? "#F5F3FF"
                                    : "#ECFEFF",
                      fontWeight: "bold",
                    }}
                  >
                    {grade}
                  </td>

                  <td>Male</td>

                  <td>{gradeSummary[grade].Male.Normal}</td>
                  <td>{gradeSummary[grade].Male.Wasted}</td>
                  <td>{gradeSummary[grade].Male["Severely Wasted"]}</td>
                  <td>{gradeSummary[grade].Male.Overweight}</td>
                  <td>{gradeSummary[grade].Male.Obese}</td>

                  <td>{gradeSummary[grade].Male["Normal Height"]}</td>
                  <td>{gradeSummary[grade].Male.Stunted}</td>
                  <td>{gradeSummary[grade].Male["Severely Stunted"]}</td>
                  <td>{gradeSummary[grade].Male.Tall}</td>

                  <td>{gradeSummary[grade].Male.Total}</td>
                </tr>

                <tr
                  className={`grade-row-${grade.replace(/\s+/g, "").toLowerCase()}`}
                >
                  <td>Female</td>

                  <td>{gradeSummary[grade].Female.Normal}</td>
                  <td>{gradeSummary[grade].Female.Wasted}</td>
                  <td>{gradeSummary[grade].Female["Severely Wasted"]}</td>
                  <td>{gradeSummary[grade].Female.Overweight}</td>
                  <td>{gradeSummary[grade].Female.Obese}</td>

                  <td>{gradeSummary[grade].Female["Normal Height"]}</td>
                  <td>{gradeSummary[grade].Female.Stunted}</td>
                  <td>{gradeSummary[grade].Female["Severely Stunted"]}</td>
                  <td>{gradeSummary[grade].Female.Tall}</td>

                  <td>{gradeSummary[grade].Female.Total}</td>
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
        <div
          style={{
            marginTop: "15px",
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          {GRADE_LEVELS.map((grade) => (
            <div
              key={grade}
              style={{
                padding: "8px 12px",
                borderRadius: "20px",
                background: "#f3f4f6",
                fontSize: "12px",
                fontWeight: "600",
              }}
            >
              {grade} - {gradeTotals[grade]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
