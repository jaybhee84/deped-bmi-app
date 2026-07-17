import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  GRADE_LEVELS,
  SCHOOL_YEARS,
  QUARTERS,
} from "../utils/bmi";
import Badge from "./Badge";
import { fetchAllSchools } from "../utils/syncService";
import "./SDODashboard.css";
import { getSchoolLogoUrl } from "../utils/schoolLogoMap";

export default function SDODashboard({
  allSchoolsData,
  selectedSchool,
  setSelectedSchool,
}) {
  // allSchoolsData: { [schoolName]: students[] }

  // ── School registry now pulled from Supabase (source of truth) ─────────
  const [schools, setSchools] = useState([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [schoolsError, setSchoolsError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSchoolsFromSupabase() {
      setSchoolsLoading(true);
      setSchoolsError(null);
      try {
        const rows = await fetchAllSchools();
        if (!cancelled) setSchools(rows);
      } catch (e) {
        console.error("[SDODashboard] Failed to fetch schools:", e);
        if (!cancelled) setSchoolsError(e.message || "Failed to load schools.");
      } finally {
        if (!cancelled) setSchoolsLoading(false);
      }
    }

    loadSchoolsFromSupabase();

    return () => {
      cancelled = true;
    };
  }, []);

  // Filtered only to Elementary/Primary schools and alphabetically sorted
  const schoolNames = useMemo(() => {
    const rawSchools = [
      "Isabela East Central Elementary School",
      "Isabela Bliss Elementary School",
      "Bishop Querexeta Elementary School",
      "Kaumpurnah Elementary School",
      "Simeon & Josefa Obsequio Elementary School",
      "Begang Central Elementary School",
      "Busay Elementary School",
      "Tabiawan Elementary School",
      "Latuan Elementary School",
      "Panunsulan Elementary School",
      "Kawa-Kawa Elementary School",
      "Look-Jambangan Elementary School",
      "Kauman Ekka Elementary School",
      "Palasanan Primary School",
      "Spillway Elementary School",
      "Kapatagan Diutay Elementary School",
      "Hadji Camlani Elementary School",
      "Calvario Peak Elementary School",
      "Calvario Elementary School",
      "Masola Elementary School",
      "Lanote Elementary School",
      "Lunot Elementary School",
      "Cabunbata Elementary School",
      "Isabela Central Pilot Elementary School",
      "Isabela Central Pilot Elementary School - Night",
      "Westside Elementary School",
      "Ustadz Wahab Akbar Elementary School",
      "Sunset Elementary School",
      "Ajibon Elementary School",
      "Sumagdang Elementary School",
      "Kumalarang Elementary School",
      "Menzi Elementary School",
      "Balatanay Elementary School",
      "Balawatin Elementary School",
      "Makiri Elementary School",
      "Campo Barn Elementary School",
      "Hadji Maulana Primary School",
      "Caro Elementary School",
      "Malamawi Central Elementary School",
      "Tampalan Elementary School",
      "Diki Elementary School",
      "Marang Marang Elementary School",
      "Lukbuton Elementary School",
      "Hadji Amilhamja Lahaba Memorial Elementary School",
      "MS Bernardo Elementary School",
      "Lampinigan Elementary School",
      "Ismael Integrated School",
      "Panigayan Integrated School",
      "Badjao Floating Integrated School",
      "Geras Integrated School",
    ];

    // Alphabetize the list
    return [...rawSchools].sort((a, b) => a.localeCompare(b));
  }, []);

  const [filterSY, setFilterSY] = useState("2026–2027");
  const [filterPeriod, setFilterPeriod] = useState("Baseline");
  const incompleteRef = useRef(null);

  // Get students for the selected school
  const students = useMemo(() => {
    if (selectedSchool === "ALL SCHOOLS") {
      return Object.values(allSchoolsData).flat();
    }

    return allSchoolsData[selectedSchool] || [];
  }, [selectedSchool, allSchoolsData]);

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
  }, [syStudents, filterSY, filterPeriod]);

  const hfaCounts = useMemo(() => {
    const c = {
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
      if (haz?.label === "Normal") c["Normal Height"]++;
      else if (haz?.label) c[haz.label]++;
    });
    return c;
  }, [syStudents, filterSY, filterPeriod]);

  const incompleteLearners = students.filter((s) => {
    const recs = s.records.filter(
      (r) => r.sy === filterSY && r.q === filterPeriod,
    );
    if (!recs.length) return true;
    const last = recs[recs.length - 1];
    return !last.weight || !last.height;
  });

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
      if (item.status?.label) summary[grade][sex][item.status.label]++;
      const rec = item.student.records
        .filter((r) => r.sy === filterSY && r.q === filterPeriod)
        .slice(-1)[0];
      const haz = rec
        ? getHAZStatus(rec.height, item.student.sex, item.student.birthdate)
        : null;
      if (haz?.label === "Normal") summary[grade][sex]["Normal Height"]++;
      else if (haz?.label) summary[grade][sex][haz.label]++;
    });
    return summary;
  }, [allLatestBMI, filterSY, filterPeriod]);

  const gradeTotals = useMemo(() => {
    const t = {};
    GRADE_LEVELS.forEach((g) => {
      t[g] = gradeSummary[g].Male.Total + gradeSummary[g].Female.Total;
    });
    return t;
  }, [gradeSummary]);

  // ── Calculation for Overall Grand Totals ──
  const grandTotals = useMemo(() => {
    const totals = {
      Male: {
        Normal: 0,
        Wasted: 0,
        SevWasted: 0,
        Overweight: 0,
        Obese: 0,
        NormalHt: 0,
        Stunted: 0,
        SevStunted: 0,
        Tall: 0,
        Total: 0,
      },
      Female: {
        Normal: 0,
        Wasted: 0,
        SevWasted: 0,
        Overweight: 0,
        Obese: 0,
        NormalHt: 0,
        Stunted: 0,
        SevStunted: 0,
        Tall: 0,
        Total: 0,
      },
      Combined: {
        Normal: 0,
        Wasted: 0,
        SevWasted: 0,
        Overweight: 0,
        Obese: 0,
        NormalHt: 0,
        Stunted: 0,
        SevStunted: 0,
        Tall: 0,
        Total: 0,
      },
    };

    GRADE_LEVELS.forEach((g) => {
      const m = gradeSummary[g].Male;
      const f = gradeSummary[g].Female;

      // Accumulate Male
      totals.Male.Normal += m.Normal;
      totals.Male.Wasted += m.Wasted;
      totals.Male.SevWasted += m["Severely Wasted"];
      totals.Male.Overweight += m.Overweight;
      totals.Male.Obese += m.Obese;
      totals.Male.NormalHt += m["Normal Height"];
      totals.Male.Stunted += m.Stunted;
      totals.Male.SevStunted += m["Severely Stunted"];
      totals.Male.Tall += m.Tall;
      totals.Male.Total += m.Total;

      // Accumulate Female
      totals.Female.Normal += f.Normal;
      totals.Female.Wasted += f.Wasted;
      totals.Female.SevWasted += f["Severely Wasted"];
      totals.Female.Overweight += f.Overweight;
      totals.Female.Obese += f.Obese;
      totals.Female.NormalHt += f["Normal Height"];
      totals.Female.Stunted += f.Stunted;
      totals.Female.SevStunted += f["Severely Stunted"];
      totals.Female.Tall += f.Tall;
      totals.Female.Total += f.Total;
    });

    // Compute Combined
    Object.keys(totals.Combined).forEach((key) => {
      totals.Combined[key] = totals.Male[key] + totals.Female[key];
    });

    return totals;
  }, [gradeSummary]);

  const totalForPeriod = students.filter((s) =>
    s.records.some((r) => r.sy === filterSY && r.q === filterPeriod),
  ).length;

  const barItems = [
    { label: "Normal", color: "#3B6D11" },
    { label: "Wasted", color: "#BA7517" },
    { label: "Overweight", color: "#BA7517" },
    { label: "Severely Wasted", color: "#A32D2D" },
    { label: "Obese", color: "#A32D2D" },
  ];

  const hfaBarItems = [
    { label: "Normal Height", color: "#3B6D11" },
    { label: "Stunted", color: "#BA7517" },
    { label: "Severely Stunted", color: "#A32D2D" },
    { label: "Tall", color: "#2563EB" },
  ];

  const gradeBg = {
    Kinder: "#FFF7ED",
    "Grade 1": "#EFF6FF",
    "Grade 2": "#F0FDF4",
    "Grade 3": "#FEFCE8",
    "Grade 4": "#FDF2F8",
    "Grade 5": "#F5F3FF",
    "Grade 6": "#ECFEFF",
  };

  return (
    <div className="page">
      {/* ── Scoped CSS to isolate & correct layout behavior ── */}
      <style>{`
        /* Forces standard table rendering, over-riding global resets */
        .sdo-isolated-table {
          display: table !important;
          width: 100% !important;
          border-collapse: collapse !important;
          table-layout: fixed !important; 
        }
        .sdo-isolated-table thead {
          display: table-header-group !important;
        }
        .sdo-isolated-table tbody {
          display: table-row-group !important;
        }
        .sdo-isolated-table tfoot {
          display: table-footer-group !important;
          font-weight: bold !important;
        }
        .sdo-isolated-table tr {
          display: table-row !important;
        }
        .sdo-isolated-table th, 
        .sdo-isolated-table td {
          display: table-cell !important;
          vertical-align: middle !important;
          text-align: center !important;
          padding: 8px 6px !important;
          border: 1px solid #E5E7EB !important;
          box-sizing: border-box !important;
        }
        .sdo-isolated-table th {
          background-color: #558B2F !important;
          color: white !important;
          font-weight: 700 !important;
          font-size: 11px !important;
          text-transform: uppercase !important;
        }
        /* Footer row backgrounds to distinguish them visually */
        .sdo-isolated-table tfoot tr {
          background-color: #F9FAFB !important;
        }
        .sdo-isolated-table tfoot tr.overall-grand-total {
          background-color: #E2E8F0 !important;
        }
        /* Strict sizing ratios for column alignment consistency */
        .sdo-isolated-table th:nth-child(1), .sdo-isolated-table td:nth-child(1) { width: 10% !important; text-align: left !important; }
        .sdo-isolated-table th:nth-child(2), .sdo-isolated-table td:nth-child(2) { width: 8% !important; }
        .sdo-isolated-table th:nth-child(3), .sdo-isolated-table td:nth-child(3) { width: 9% !important; }
        .sdo-isolated-table th:nth-child(4), .sdo-isolated-table td:nth-child(4) { width: 8% !important; }
        .sdo-isolated-table th:nth-child(5), .sdo-isolated-table td:nth-child(5) { width: 9% !important; }
        .sdo-isolated-table th:nth-child(6), .sdo-isolated-table td:nth-child(6) { width: 10% !important; }
        .sdo-isolated-table th:nth-child(7), .sdo-isolated-table td:nth-child(7) { width: 8% !important; }
        .sdo-isolated-table th:nth-child(8), .sdo-isolated-table td:nth-child(8) { width: 10% !important; }
        .sdo-isolated-table th:nth-child(9), .sdo-isolated-table td:nth-child(9) { width: 8% !important; }
        .sdo-isolated-table th:nth-child(10), .sdo-isolated-table td:nth-child(10) { width: 10% !important; }
        .sdo-isolated-table th:nth-child(11), .sdo-isolated-table td:nth-child(11) { width: 6% !important; }
        .sdo-isolated-table th:nth-child(12), .sdo-isolated-table td:nth-child(12) { width: 8% !important; }

        /* Custom Override styling for enlarging logo banner items */
        .sdo-school-banner {
          display: flex;
          align-items: center;
          gap: 28px;
          padding: 24px;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.06);
          margin-bottom: 24px;
          /* Removed 'background: #ffffff' override to let original stylesheet (SDODashboard.css) dictate color */
        }
        .sdo-banner-logo {
          width: 120px !important;
          height: 120px !important;
          object-fit: contain;
        }
        .sdo-banner-logo-placeholder {
          font-size: 72px !important;
          width: 120px;
          text-align: center;
        }
        .sdo-banner-name {
          font-size: 32px !important;
          font-weight: 800 !important;
          margin-bottom: 6px;
          line-height: 1.2;
        }
        .sdo-banner-sub {
          font-size: 18px !important;
          font-weight: 500;
        }
      `}</style>

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1
            className="page-title"
            style={{ color: "black", fontSize: "24px" }}
          >
            DASHBOARD
          </h1>
          <p className="page-sub">Division-wide nutritional status overview</p>
        </div>
        <div className="sdo-controls">
          {/* School selector */}
          <div className="form-group">
            <label className="form-label">School</label>
            <select
              className="form-select sdo-school-select"
              value={selectedSchool}
              onChange={(e) => setSelectedSchool(e.target.value)}
            >
              <option value="ALL SCHOOLS">ALL SCHOOLS</option>

              <optgroup label="ELEMENTARY SCHOOLS">
                {schoolNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Period</label>
            <select
              className="form-select"
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value)}
            >
              {QUARTERS.map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">School Year</label>
            <select
              className="form-select"
              value={filterSY}
              onChange={(e) => setFilterSY(e.target.value)}
            >
              {SCHOOL_YEARS.map((sy) => (
                <option key={sy}>{sy}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {schoolsError && (
        <div
          style={{
            padding: "10px 14px",
            background: "#FCEBEB",
            color: "#A32D2D",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          Couldn't load school directory from Supabase: {schoolsError}. Logos
          and division/district info may be missing until this is resolved.
        </div>
      )}

      {/* ── No school / no data state ── */}
      {!selectedSchool ? (
        <div className="sdo-empty">
          <div className="sdo-empty-icon">🏫</div>
          <p>Select a school above to view its nutritional status data.</p>
        </div>
      ) : students.length === 0 ? (
        <div className="sdo-empty">
          <div className="sdo-empty-icon">📋</div>
          <p>
            No data available for <strong>{selectedSchool}</strong>.
          </p>
          <p className="sdo-empty-sub">
            Data will appear here once the school uploads their records.
          </p>
        </div>
      ) : (
        <>
          {/* ── School info banner ── */}
          {(() => {
            const isAll = selectedSchool === "ALL SCHOOLS";
            const foundSchool =
              !isAll && schools.find((s) => s.name === selectedSchool);

            // 1. Grab a valid working URL from a known elementary school in your bucket
            const sampleUrl =
              getSchoolLogoUrl("Isabela East Central Elementary School") || "";
            // 2. Dynamically replace the filename at the end of the URL with 'sdo.png'
            const sdoLogoUrl = sampleUrl
              ? `${sampleUrl.substring(0, sampleUrl.lastIndexOf("/"))}/sdo.png`
              : null;

            const info = isAll
              ? {
                  name: "Division of Isabela City",
                  division: "Isabela City Schools Division Office",
                  logo: sdoLogoUrl, // Exactly points to your Supabase 'school-logos/sdo.png'
                }
              : {
                  ...(foundSchool || {
                    name: selectedSchool,
                    division: "Isabela City Schools Division Office",
                  }),
                  logo: getSchoolLogoUrl(selectedSchool),
                };

            return (
              <div className="sdo-school-banner">
                {info.logo ? (
                  <img
                    src={info.logo}
                    alt={info.name}
                    className="sdo-banner-logo"
                    onError={(e) => {
                      // Fallback: If sdo.png is missing or fails to load, gracefully revert to the emoji
                      e.target.style.display = "none";
                      if (
                        !e.target.parentNode.querySelector(
                          ".sdo-banner-logo-placeholder",
                        )
                      ) {
                        e.target.insertAdjacentHTML(
                          "afterend",
                          '<div class="sdo-banner-logo-placeholder">🏫</div>',
                        );
                      }
                    }}
                  />
                ) : (
                  <div className="sdo-banner-logo-placeholder">🏫</div>
                )}

                <div className="sdo-banner-info">
                  <div className="sdo-banner-name">{info.name}</div>
                  {info.division && (
                    <div className="sdo-banner-sub">{info.division}</div>
                  )}
                </div>

                <div className="sdo-banner-stats">
                  <span>
                    <strong>{students.length}</strong> total learners
                  </span>
                  <span>
                    <strong>{totalForPeriod}</strong> with {filterPeriod}{" "}
                    records
                  </span>
                </div>
              </div>
            );
          })()}

          {/* ── Stat cards ── */}
          <div className="stat-grid">
            {[
              {
                label: "Total Learners",
                val: syStudents.length,
                bg: "#EFF6FF",
              },
              { label: "With Records", val: totalForPeriod, bg: "#EAF3DE" },
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
              { label: "Obese", val: statusCounts["Obese"], bg: "#FCEBEB" },
              {
                label: "No Data",
                val: statusCounts["No Data"],
                bg: "#F3F4F6",
                onClick: () =>
                  incompleteRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  }),
              },
            ].map((s) => (
              <div
                key={s.label}
                className="stat-card"
                style={{
                  background: s.bg,
                  cursor: s.onClick ? "pointer" : "default",
                }}
                onClick={s.onClick}
              >
                <div className="stat-num">{s.val}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* ── BMI Distribution bar chart ── */}
          <div className="card">
            <h3 className="card-title">
              Nutritional Status Distribution (BMI-for-Age)
            </h3>
            {barItems.map((b) => {
              const pct = totalForPeriod
                ? (statusCounts[b.label] / totalForPeriod) * 100
                : 0;
              return (
                <div key={b.label} className="bar-row">
                  <div className="bar-labels">
                    <span>{b.label}</span>
                    <span>
                      {statusCounts[b.label]} learners ({pct.toFixed(1)}%)
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

          {/* ── HFA Distribution bar chart ── */}
          <div className="card">
            <h3 className="card-title">Height-for-Age Distribution (HFA)</h3>
            {hfaBarItems.map((b) => {
              const pct = totalForPeriod
                ? (hfaCounts[b.label] / totalForPeriod) * 100
                : 0;
              return (
                <div key={b.label} className="bar-row">
                  <div className="bar-labels">
                    <span>{b.label}</span>
                    <span>
                      {hfaCounts[b.label]} learners ({pct.toFixed(1)}%)
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

          {/* ── Grade level breakdown table ── */}
          <div className="card">
            <h3 className="card-title">Nutritional Status by Grade Level</h3>
            <div style={{ overflowX: "auto" }}>
              <table className="sdo-isolated-table">
                <thead>
                  <tr>
                    <th>Grade</th>
                    <th>Sex</th>
                    <th>Normal</th>
                    <th>Wasted</th>
                    <th>Sev. Wasted</th>
                    <th>Overweight</th>
                    <th>Obese</th>
                    <th>Normal Ht.</th>
                    <th>Stunted</th>
                    <th>Sev. Stunted</th>
                    <th>Tall</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {GRADE_LEVELS.map((grade) => (
                    <React.Fragment key={grade}>
                      <tr>
                        {/* Grade cell on Male Row */}
                        <td
                          style={{
                            background: gradeBg[grade],
                            fontWeight: 700,
                            borderBottom: "none !important",
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
                        <td>
                          <strong>{gradeSummary[grade].Male.Total}</strong>
                        </td>
                      </tr>
                      <tr>
                        {/* Duplicate Grade cell placeholder on Female Row to avoid cell-shifting layout bugs */}
                        <td
                          style={{
                            background: gradeBg[grade],
                            borderTop: "none !important",
                          }}
                        >
                          {/* Blank cell to simulate unified rowspan look natively */}
                        </td>
                        <td>Female</td>
                        <td>{gradeSummary[grade].Female.Normal}</td>
                        <td>{gradeSummary[grade].Female.Wasted}</td>
                        <td>{gradeSummary[grade].Female["Severely Wasted"]}</td>
                        <td>{gradeSummary[grade].Female.Overweight}</td>
                        <td>{gradeSummary[grade].Female.Obese}</td>
                        <td>{gradeSummary[grade].Female["Normal Height"]}</td>
                        <td>{gradeSummary[grade].Female.Stunted}</td>
                        <td>
                          {gradeSummary[grade].Female["Severely Stunted"]}
                        </td>
                        <td>{gradeSummary[grade].Female.Tall}</td>
                        <td>
                          <strong>{gradeSummary[grade].Female.Total}</strong>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>

                {/* ── Table Footer for Summary & Grand Totals ── */}
                <tfoot>
                  <tr>
                    <td
                      style={{
                        fontWeight: "bold",
                        borderBottom: "none !important",
                      }}
                    >
                      TOTALS
                    </td>
                    <td>Male</td>
                    <td>{grandTotals.Male.Normal}</td>
                    <td>{grandTotals.Male.Wasted}</td>
                    <td>{grandTotals.Male.SevWasted}</td>
                    <td>{grandTotals.Male.Overweight}</td>
                    <td>{grandTotals.Male.Obese}</td>
                    <td>{grandTotals.Male.NormalHt}</td>
                    <td>{grandTotals.Male.Stunted}</td>
                    <td>{grandTotals.Male.SevStunted}</td>
                    <td>{grandTotals.Male.Tall}</td>
                    <td>{grandTotals.Male.Total}</td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        borderTop: "none !important",
                        borderBottom: "none !important",
                      }}
                    ></td>
                    <td>Female</td>
                    <td>{grandTotals.Female.Normal}</td>
                    <td>{grandTotals.Female.Wasted}</td>
                    <td>{grandTotals.Female.SevWasted}</td>
                    <td>{grandTotals.Female.Overweight}</td>
                    <td>{grandTotals.Female.Obese}</td>
                    <td>{grandTotals.Female.NormalHt}</td>
                    <td>{grandTotals.Female.Stunted}</td>
                    <td>{grandTotals.Female.SevStunted}</td>
                    <td>{grandTotals.Female.Tall}</td>
                    <td>{grandTotals.Female.Total}</td>
                  </tr>
                  <tr
                    className="overall-grand-total"
                    style={{ fontSize: "13px" }}
                  >
                    <td
                      style={{
                        borderTop: "none !important",
                        fontWeight: "900",
                      }}
                    ></td>
                    <td style={{ fontWeight: "900" }}>Combined</td>
                    <td>
                      <strong>{grandTotals.Combined.Normal}</strong>
                    </td>
                    <td>
                      <strong>{grandTotals.Combined.Wasted}</strong>
                    </td>
                    <td>
                      <strong>{grandTotals.Combined.SevWasted}</strong>
                    </td>
                    <td>
                      <strong>{grandTotals.Combined.Overweight}</strong>
                    </td>
                    <td>
                      <strong>{grandTotals.Combined.Obese}</strong>
                    </td>
                    <td>
                      <strong>{grandTotals.Combined.NormalHt}</strong>
                    </td>
                    <td>
                      <strong>{grandTotals.Combined.Stunted}</strong>
                    </td>
                    <td>
                      <strong>{grandTotals.Combined.SevStunted}</strong>
                    </td>
                    <td>
                      <strong>{grandTotals.Combined.Tall}</strong>
                    </td>
                    <td>
                      <strong style={{ color: "#1E3A8A" }}>
                        {grandTotals.Combined.Total}
                      </strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div
              style={{
                marginTop: 12,
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {GRADE_LEVELS.map((grade) => (
                <div
                  key={grade}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 20,
                    background: gradeBg[grade],
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {grade} — {gradeTotals[grade]}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
