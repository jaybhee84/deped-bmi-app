import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  getSchoolYears,
  GRADE_LEVELS,
} from "../utils/bmi";
import Badge from "./Badge";
import "./Dashboard.css";
import { getSchoolLogoUrl } from "../utils/schoolLogoMap";
import { fetchSchoolForUser } from "../utils/syncService";

export default function Dashboard({ students, currentUser }) {
  const [filterSY, setFilterSY] = useState("2026–2027");
  const [filterPeriod, setFilterPeriod] = useState("Baseline");
  const [schoolLogo, setSchoolLogo] = useState(null);
  const [schoolName, setSchoolName] = useState("");

  const schoolYears = getSchoolYears();
  const incompleteDataRef = useRef(null);

  useEffect(() => {
    async function loadSchoolDb() {
      try {
        const schoolData = await window.sqlite.loadSchool();

        if (schoolData) {
          setSchoolName(schoolData.school_name || "");

          const logoUrl = getSchoolLogoUrl(schoolData.school_name);
          setSchoolLogo(logoUrl);

          const localLogo = await window.sqlite.loadSchoolLogo(
            schoolData.school_id,
          );

          if (localLogo) {
            setSchoolLogo(localLogo);
          }
          return;
        }

        if (currentUser?.id && navigator.onLine) {
          const boundSchool = await fetchSchoolForUser(currentUser.id);

          if (boundSchool) {
            setSchoolName(boundSchool.name || "");

            const logoUrl = getSchoolLogoUrl(boundSchool.name);
            setSchoolLogo(logoUrl);

            await window.sqlite.saveSchool({
              school_name: boundSchool.name,
              school_id: boundSchool.id,
              division: boundSchool.division,
              district: boundSchool.district,
              address: boundSchool.address,
            });
          }
        }
      } catch (e) {
        console.error(
          "[SQLite/Supabase] Failed to load school logo on Dashboard:",
          e,
        );
      }
    }

    loadSchoolDb();
  }, [currentUser]);

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

  const gradeTotals = useMemo(() => {
    const totals = {};

    GRADE_LEVELS.forEach((grade) => {
      totals[grade] =
        gradeSummary[grade].Male.Total + gradeSummary[grade].Female.Total;
    });

    return totals;
  }, [gradeSummary]);

  // Compute Grand Totals across all grades
  const grandTotals = useMemo(() => {
    const totals = {
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
      Overall: {
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

    GRADE_LEVELS.forEach((grade) => {
      ["Male", "Female"].forEach((sex) => {
        const metrics = [
          "Normal",
          "Wasted",
          "Severely Wasted",
          "Overweight",
          "Obese",
          "Normal Height",
          "Stunted",
          "Severely Stunted",
          "Tall",
          "Total",
        ];
        metrics.forEach((metric) => {
          totals[sex][metric] += gradeSummary[grade][sex][metric];
          totals.Overall[metric] += gradeSummary[grade][sex][metric];
        });
      });
    });

    return totals;
  }, [gradeSummary]);

  // Scoped Styling Object
  const getGradeBgColor = (grade) => {
    switch (grade) {
      case "Kinder":
        return "#FFF7ED";
      case "Grade 1":
        return "#EFF6FF";
      case "Grade 2":
        return "#F0FDF4";
      case "Grade 3":
        return "#FEFCE8";
      case "Grade 4":
        return "#FDF2F8";
      case "Grade 5":
        return "#F5F3FF";
      default:
        return "#ECFEFF";
    }
  };

  const scopedStyles = {
    table: {
      width: "100%",
      borderCollapse: "collapse",
      minWidth: "1100px",
      fontSize: "13px",
      fontFamily: "inherit",
    },
    th: {
      backgroundColor: "#55a630",
      color: "#ffffff",
      padding: "12px 8px",
      textAlign: "center",
      fontWeight: "bold",
      fontSize: "12px",
      textTransform: "uppercase",
    },
    tdGrade: (grade) => ({
      backgroundColor: getGradeBgColor(grade),
      fontWeight: "bold",
      padding: "12px 8px",
      verticalAlign: "middle",
      borderRight: "1px solid #d1d5db",
      borderBottom: "2px solid #d1d5db",
      whiteSpace: "nowrap",
      textAlign: "left",
    }),
    tdCell: (grade, isBottom = false) => ({
      padding: "10px 6px",
      textAlign: "center",
      backgroundColor: getGradeBgColor(grade),
      borderBottom: isBottom ? "2px solid #d1d5db" : "1px solid #e5e7eb",
    }),
    tdTotalCell: (grade, isBottom = false) => ({
      padding: "10px 6px",
      textAlign: "center",
      fontWeight: "bold",
      backgroundColor: getGradeBgColor(grade),
      borderLeft: "1px solid #e5e7eb",
      borderBottom: isBottom ? "2px solid #d1d5db" : "1px solid #e5e7eb",
    }),
  };

  return (
    <div className="page">
      <div className="page-header" style={{ alignItems: "center" }}>
        {/* Logo and Title Section */}
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          {schoolLogo && (
            <img
              src={schoolLogo}
              alt={`${schoolName} Logo`}
              style={{
                width: "120px",
                height: "120px",
                objectFit: "contain",
              }}
            />
          )}
          <div>
            {schoolName && (
              <h2
                style={{
                  fontSize: "1.8rem",
                  fontWeight: "bold",
                  color: "#1e3a8a",
                  margin: "0 0 4px 0",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {schoolName}
              </h2>
            )}
            <h1
              className="page-title"
              style={{ textTransform: "uppercase", margin: 0, lineHeight: 1.1 }}
            >
              Dashboard
            </h1>
            <p className="page-sub" style={{ margin: "4px 0 0 0" }}>
              Nutritional Status Overview — School Year {filterSY}
            </p>
          </div>
        </div>

        {/* Action Filters */}
        <div style={{ display: "flex", gap: "8px" }}>
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

        <div
          style={{
            overflowX: "auto",
            marginTop: "15px",
            borderRadius: "4px",
            border: "1px solid #e5e7eb",
          }}
        >
          <table style={scopedStyles.table}>
            <thead>
              <tr>
                <th
                  style={{
                    ...scopedStyles.th,
                    textAlign: "left",
                    width: "110px",
                  }}
                >
                  Grade
                </th>
                <th
                  style={{
                    ...scopedStyles.th,
                    textAlign: "left",
                    width: "80px",
                  }}
                >
                  Sex
                </th>
                <th style={scopedStyles.th}>Normal</th>
                <th style={scopedStyles.th}>Wasted</th>
                <th style={scopedStyles.th}>Severely Wasted</th>
                <th style={scopedStyles.th}>Overweight</th>
                <th style={scopedStyles.th}>Obese</th>
                <th style={scopedStyles.th}>Normal Height</th>
                <th style={scopedStyles.th}>Stunted</th>
                <th style={scopedStyles.th}>Severely Stunted</th>
                <th style={scopedStyles.th}>Tall</th>
                <th style={scopedStyles.th}>Total</th>
              </tr>
            </thead>

            <tbody>
              {GRADE_LEVELS.map((grade) => (
                <React.Fragment key={grade}>
                  {/* Male Row */}
                  <tr>
                    <td rowSpan={2} style={scopedStyles.tdGrade(grade)}>
                      {grade}
                    </td>
                    <td
                      style={{
                        ...scopedStyles.tdCell(grade),
                        textAlign: "left",
                        fontWeight: "500",
                        borderRight: "1px solid #d1d5db",
                      }}
                    >
                      Male
                    </td>
                    <td style={scopedStyles.tdCell(grade)}>
                      {gradeSummary[grade].Male.Normal}
                    </td>
                    <td style={scopedStyles.tdCell(grade)}>
                      {gradeSummary[grade].Male.Wasted}
                    </td>
                    <td style={scopedStyles.tdCell(grade)}>
                      {gradeSummary[grade].Male["Severely Wasted"]}
                    </td>
                    <td style={scopedStyles.tdCell(grade)}>
                      {gradeSummary[grade].Male.Overweight}
                    </td>
                    <td style={scopedStyles.tdCell(grade)}>
                      {gradeSummary[grade].Male.Obese}
                    </td>
                    <td style={scopedStyles.tdCell(grade)}>
                      {gradeSummary[grade].Male["Normal Height"]}
                    </td>
                    <td style={scopedStyles.tdCell(grade)}>
                      {gradeSummary[grade].Male.Stunted}
                    </td>
                    <td style={scopedStyles.tdCell(grade)}>
                      {gradeSummary[grade].Male["Severely Stunted"]}
                    </td>
                    <td style={scopedStyles.tdCell(grade)}>
                      {gradeSummary[grade].Male.Tall}
                    </td>
                    <td style={scopedStyles.tdTotalCell(grade)}>
                      {gradeSummary[grade].Male.Total}
                    </td>
                  </tr>

                  {/* Female Row */}
                  <tr>
                    <td
                      style={{
                        ...scopedStyles.tdCell(grade, true),
                        textAlign: "left",
                        fontWeight: "500",
                        borderRight: "1px solid #d1d5db",
                      }}
                    >
                      Female
                    </td>
                    <td style={scopedStyles.tdCell(grade, true)}>
                      {gradeSummary[grade].Female.Normal}
                    </td>
                    <td style={scopedStyles.tdCell(grade, true)}>
                      {gradeSummary[grade].Female.Wasted}
                    </td>
                    <td style={scopedStyles.tdCell(grade, true)}>
                      {gradeSummary[grade].Female["Severely Wasted"]}
                    </td>
                    <td style={scopedStyles.tdCell(grade, true)}>
                      {gradeSummary[grade].Female.Overweight}
                    </td>
                    <td style={scopedStyles.tdCell(grade, true)}>
                      {gradeSummary[grade].Female.Obese}
                    </td>
                    <td style={scopedStyles.tdCell(grade, true)}>
                      {gradeSummary[grade].Female["Normal Height"]}
                    </td>
                    <td style={scopedStyles.tdCell(grade, true)}>
                      {gradeSummary[grade].Female.Stunted}
                    </td>
                    <td style={scopedStyles.tdCell(grade, true)}>
                      {gradeSummary[grade].Female["Severely Stunted"]}
                    </td>
                    <td style={scopedStyles.tdCell(grade, true)}>
                      {gradeSummary[grade].Female.Tall}
                    </td>
                    <td style={scopedStyles.tdTotalCell(grade, true)}>
                      {gradeSummary[grade].Female.Total}
                    </td>
                  </tr>
                </React.Fragment>
              ))}

              {/* Total Row Header */}
              <tr style={{ borderTop: "3px solid #55a630" }}>
                <td
                  rowSpan={3}
                  style={{
                    ...scopedStyles.tdGrade("Total"),
                    backgroundColor: "#f3f4f6",
                    borderBottom: "none",
                  }}
                >
                  TOTALS
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    textAlign: "left",
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                    borderRight: "1px solid #d1d5db",
                  }}
                >
                  Total Male
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Male.Normal}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Male.Wasted}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Male["Severely Wasted"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Male.Overweight}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Male.Obese}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Male["Normal Height"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Male.Stunted}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Male["Severely Stunted"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Male.Tall}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdTotalCell("Total"),
                    backgroundColor: "#e2e8f0",
                  }}
                >
                  {grandTotals.Male.Total}
                </td>
              </tr>

              {/* Total Female Row */}
              <tr>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    textAlign: "left",
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                    borderRight: "1px solid #d1d5db",
                  }}
                >
                  Total Female
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Female.Normal}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Female.Wasted}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Female["Severely Wasted"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Female.Overweight}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Female.Obese}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Female["Normal Height"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Female.Stunted}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Female["Severely Stunted"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total"),
                    fontWeight: "bold",
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  {grandTotals.Female.Tall}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdTotalCell("Total"),
                    backgroundColor: "#e2e8f0",
                  }}
                >
                  {grandTotals.Female.Total}
                </td>
              </tr>

              {/* Overall Grand Total Row */}
              <tr style={{ borderBottom: "3px solid #55a630" }}>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total", true),
                    textAlign: "left",
                    fontWeight: "bold",
                    backgroundColor: "#e2e8f0",
                    borderRight: "1px solid #cbd5e1",
                  }}
                >
                  Grand Total
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total", true),
                    fontWeight: "bold",
                    backgroundColor: "#e2e8f0",
                  }}
                >
                  {grandTotals.Overall.Normal}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total", true),
                    fontWeight: "bold",
                    backgroundColor: "#e2e8f0",
                  }}
                >
                  {grandTotals.Overall.Wasted}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total", true),
                    fontWeight: "bold",
                    backgroundColor: "#e2e8f0",
                  }}
                >
                  {grandTotals.Overall["Severely Wasted"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total", true),
                    fontWeight: "bold",
                    backgroundColor: "#e2e8f0",
                  }}
                >
                  {grandTotals.Overall.Overweight}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total", true),
                    fontWeight: "bold",
                    backgroundColor: "#e2e8f0",
                  }}
                >
                  {grandTotals.Overall.Obese}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total", true),
                    fontWeight: "bold",
                    backgroundColor: "#e2e8f0",
                  }}
                >
                  {grandTotals.Overall["Normal Height"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total", true),
                    fontWeight: "bold",
                    backgroundColor: "#e2e8f0",
                  }}
                >
                  {grandTotals.Overall.Stunted}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total", true),
                    fontWeight: "bold",
                    backgroundColor: "#e2e8f0",
                  }}
                >
                  {grandTotals.Overall["Severely Stunted"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell("Total", true),
                    fontWeight: "bold",
                    backgroundColor: "#e2e8f0",
                  }}
                >
                  {grandTotals.Overall.Tall}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdTotalCell("Total", true),
                    backgroundColor: "#cbd5e1",
                    color: "#1e3a8a",
                    fontSize: "14px",
                  }}
                >
                  {grandTotals.Overall.Total}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

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
