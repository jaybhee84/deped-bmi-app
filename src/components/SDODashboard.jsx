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

  // Timeline Trends (Baseline/Midline/Endline) — ported from the
  // school-level Dashboard so the division view shows the same period
  // trend graphs.
  const timelineData = useMemo(() => {
    return ["Baseline", "Midline", "Endline"].map((period) => {
      const counts = { Normal: 0, Wasted: 0, Overweight: 0 };
      syStudents.forEach((s) => {
        const recs = s.records.filter(
          (r) => r.sy === filterSY && r.q === period,
        );
        if (!recs.length) return;
        const last = recs[recs.length - 1];
        const bmi = calcBMI(last.weight, last.height);
        if (!bmi) return;
        const lbl = getBMIStatus(bmi, s.sex, s.birthdate).label;
        if (lbl === "Normal") counts.Normal++;
        else if (lbl === "Wasted" || lbl === "Severely Wasted") counts.Wasted++;
        else if (lbl === "Overweight" || lbl === "Obese") counts.Overweight++;
      });
      return { period, ...counts };
    });
  }, [syStudents, filterSY]);

  const hfaTimelineData = useMemo(() => {
    return ["Baseline", "Midline", "Endline"].map((period) => {
      const counts = {
        NormalHeight: 0,
        Stunted: 0,
        SeverelyStunted: 0,
        Tall: 0,
      };
      syStudents.forEach((s) => {
        const recs = s.records.filter(
          (r) => r.sy === filterSY && r.q === period,
        );
        if (!recs.length) return;
        const last = recs[recs.length - 1];
        if (!last.height) return;
        const haz = getHAZStatus(last.height, s.sex, s.birthdate);
        if (haz?.label === "Normal") counts.NormalHeight++;
        else if (haz?.label === "Stunted") counts.Stunted++;
        else if (haz?.label === "Severely Stunted") counts.SeverelyStunted++;
        else if (haz?.label === "Tall") counts.Tall++;
      });
      return { period, ...counts };
    });
  }, [syStudents, filterSY]);

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

          {/* ── Stat cards (styled to match the school-level Dashboard) ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "16px",
              marginBottom: "32px",
              width: "100%",
            }}
          >
            {[
              {
                label: "Total Learners",
                val: syStudents.length,
                border: "#cbd5e1",
                color: "#0f172a",
              },
              {
                label: "With Records",
                val: totalForPeriod,
                border: "#10b981",
                color: "#059669",
              },
              {
                label: "Normal",
                val: statusCounts["Normal"],
                border: "#10b981",
                color: "#059669",
              },
              {
                label: "Wasted",
                val: statusCounts["Wasted"],
                border: "#f59e0b",
                color: "#d97706",
              },
              {
                label: "Severely Wasted",
                val: statusCounts["Severely Wasted"],
                border: "#ef4444",
                color: "#dc2626",
              },
              {
                label: "Overweight",
                val: statusCounts["Overweight"],
                border: "#6366f1",
                color: "#4f46e5",
              },
              {
                label: "Obese",
                val: statusCounts["Obese"],
                border: "#b91c1c",
                color: "#991b1b",
              },
              {
                label: "Normal Height",
                val: hfaCounts["Normal Height"],
                border: "#10b981",
                color: "#059669",
              },
              {
                label: "Stunted",
                val: hfaCounts["Stunted"],
                border: "#f59e0b",
                color: "#d97706",
              },
              {
                label: "Severely Stunted",
                val: hfaCounts["Severely Stunted"],
                border: "#ef4444",
                color: "#dc2626",
              },
              {
                label: "Tall",
                val: hfaCounts["Tall"],
                border: "#3b82f6",
                color: "#2563eb",
              },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  backgroundColor: "#ffffff",
                  padding: "20px 20px",
                  borderRadius: "14px",
                  boxShadow:
                    "0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.02)",
                  borderTop: `4px solid ${s.border}`,
                }}
              >
                <div
                  style={{
                    fontSize: "32px",
                    fontWeight: "800",
                    color: s.color,
                    lineHeight: "1",
                    letterSpacing: "-1px",
                  }}
                >
                  {s.val}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#64748b",
                    marginTop: "10px",
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* ── Nutritional Status + HFA distribution, side by side ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "24px",
              marginBottom: "32px",
            }}
          >
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
          </div>

          {/* COMPREHENSIVE PERIODIC LINE GRAPHS SECTION */}
          <div
            style={{
              backgroundColor: "#fff",
              padding: "28px",
              borderRadius: "16px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
              marginBottom: "32px",
            }}
          >
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "700",
                color: "#0f172a",
                marginBottom: "4px",
              }}
            >
              Nutritional Trends across Reporting Periods
            </h3>
            <p
              style={{
                color: "#64748b",
                fontSize: "14px",
                marginBottom: "28px",
              }}
            >
              Dynamic phase trajectory metrics mapped natively using continuous
              line profiles.
            </p>

            {/* 1. NUTRITIONAL STATUS DISTRIBUTION SEGMENT */}
            <h4
              style={{
                fontSize: "14px",
                fontWeight: "700",
                color: "#1e3a8a",
                borderBottom: "1px solid #f1f5f9",
                paddingBottom: "8px",
                marginBottom: "20px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Nutritional Status Distribution Line Profiles
            </h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "20px",
                marginBottom: "40px",
              }}
            >
              {["Baseline", "Midline", "Endline"].map((pId, idx) => {
                const rawData = timelineData[idx] || {
                  Normal: 0,
                  Wasted: 0,
                  Overweight: 0,
                };

                const cNormal = rawData.Normal || 0;
                const cWasted = syStudents.filter((s) => {
                  const recs = s.records.filter(
                    (r) =>
                      r.sy === filterSY &&
                      r.q === ["Baseline", "Midline", "Endline"][idx],
                  );
                  if (!recs.length) return false;
                  const bmi = calcBMI(
                    recs[recs.length - 1].weight,
                    recs[recs.length - 1].height,
                  );
                  return (
                    bmi &&
                    getBMIStatus(bmi, s.sex, s.birthdate).label === "Wasted"
                  );
                }).length;

                const cSevWasted = syStudents.filter((s) => {
                  const recs = s.records.filter(
                    (r) =>
                      r.sy === filterSY &&
                      r.q === ["Baseline", "Midline", "Endline"][idx],
                  );
                  if (!recs.length) return false;
                  const bmi = calcBMI(
                    recs[recs.length - 1].weight,
                    recs[recs.length - 1].height,
                  );
                  return (
                    bmi &&
                    getBMIStatus(bmi, s.sex, s.birthdate).label ===
                      "Severely Wasted"
                  );
                }).length;

                const cOverweight = syStudents.filter((s) => {
                  const recs = s.records.filter(
                    (r) =>
                      r.sy === filterSY &&
                      r.q === ["Baseline", "Midline", "Endline"][idx],
                  );
                  if (!recs.length) return false;
                  const bmi = calcBMI(
                    recs[recs.length - 1].weight,
                    recs[recs.length - 1].height,
                  );
                  return (
                    bmi &&
                    getBMIStatus(bmi, s.sex, s.birthdate).label === "Overweight"
                  );
                }).length;

                const cObese = syStudents.filter((s) => {
                  const recs = s.records.filter(
                    (r) =>
                      r.sy === filterSY &&
                      r.q === ["Baseline", "Midline", "Endline"][idx],
                  );
                  if (!recs.length) return false;
                  const bmi = calcBMI(
                    recs[recs.length - 1].weight,
                    recs[recs.length - 1].height,
                  );
                  return (
                    bmi &&
                    getBMIStatus(bmi, s.sex, s.birthdate).label === "Obese"
                  );
                }).length;

                const subMax = Math.max(
                  cNormal,
                  cWasted,
                  cSevWasted,
                  cOverweight,
                  cObese,
                  5,
                );

                const p1 = { x: 25, y: 100 - (cNormal / subMax) * 65 };
                const p2 = { x: 70, y: 100 - (cWasted / subMax) * 65 };
                const p3 = { x: 115, y: 100 - (cSevWasted / subMax) * 65 };
                const p4 = { x: 160, y: 100 - (cOverweight / subMax) * 65 };
                const p5 = { x: 205, y: 100 - (cObese / subMax) * 65 };

                return (
                  <div
                    key={pId}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "14px",
                      padding: "16px",
                      backgroundColor: "#f8fafc",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: "700",
                        color: "#334155",
                      }}
                    >
                      {pId}
                    </span>
                    <svg
                      viewBox="0 0 230 140"
                      style={{
                        width: "100%",
                        height: "auto",
                        marginTop: "12px",
                        overflow: "visible",
                      }}
                    >
                      <line
                        x1="15"
                        y1="35"
                        x2="215"
                        y2="35"
                        stroke="#e2e8f0"
                        strokeDasharray="3,3"
                      />
                      <line
                        x1="15"
                        y1="67"
                        x2="215"
                        y2="67"
                        stroke="#e2e8f0"
                        strokeDasharray="3,3"
                      />
                      <line
                        x1="15"
                        y1="100"
                        x2="215"
                        y2="100"
                        stroke="#cbd5e1"
                        strokeWidth="1.5"
                      />
                      <line
                        x1="15"
                        y1="15"
                        x2="15"
                        y2="100"
                        stroke="#cbd5e1"
                        strokeWidth="1"
                      />

                      <path
                        d={`M ${p1.x} 100 L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} L ${p5.x} ${p5.y} L ${p5.x} 100 Z`}
                        fill="rgba(30, 58, 138, 0.04)"
                      />

                      <path
                        d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} L ${p5.x} ${p5.y}`}
                        fill="none"
                        stroke="#1e3a8a"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      <circle
                        cx={p1.x}
                        cy={p1.y}
                        r="3.5"
                        fill="#10b981"
                        stroke="#fff"
                        strokeWidth="1"
                      />
                      <text
                        x={p1.x}
                        y={p1.y - 6}
                        fontSize="9"
                        fontWeight="800"
                        fill="#059669"
                        textAnchor="middle"
                      >
                        {cNormal}
                      </text>

                      <circle
                        cx={p2.x}
                        cy={p2.y}
                        r="3.5"
                        fill="#f59e0b"
                        stroke="#fff"
                        strokeWidth="1"
                      />
                      <text
                        x={p2.x}
                        y={p2.y - 6}
                        fontSize="9"
                        fontWeight="800"
                        fill="#d97706"
                        textAnchor="middle"
                      >
                        {cWasted}
                      </text>

                      <circle
                        cx={p3.x}
                        cy={p3.y}
                        r="3.5"
                        fill="#ef4444"
                        stroke="#fff"
                        strokeWidth="1"
                      />
                      <text
                        x={p3.x}
                        y={p3.y - 6}
                        fontSize="9"
                        fontWeight="800"
                        fill="#dc2626"
                        textAnchor="middle"
                      >
                        {cSevWasted}
                      </text>

                      <circle
                        cx={p4.x}
                        cy={p4.y}
                        r="3.5"
                        fill="#6366f1"
                        stroke="#fff"
                        strokeWidth="1"
                      />
                      <text
                        x={p4.x}
                        y={p4.y - 6}
                        fontSize="9"
                        fontWeight="800"
                        fill="#4f46e5"
                        textAnchor="middle"
                      >
                        {cOverweight}
                      </text>

                      <circle
                        cx={p5.x}
                        cy={p5.y}
                        r="3.5"
                        fill="#b91c1c"
                        stroke="#fff"
                        strokeWidth="1"
                      />
                      <text
                        x={p5.x}
                        y={p5.y - 6}
                        fontSize="9"
                        fontWeight="800"
                        fill="#991b1b"
                        textAnchor="middle"
                      >
                        {cObese}
                      </text>

                      <text
                        x={p1.x}
                        y="116"
                        fontSize="6.5"
                        fontWeight="600"
                        fill="#64748b"
                        textAnchor="middle"
                      >
                        Normal
                      </text>
                      <text
                        x={p2.x}
                        y="116"
                        fontSize="6.5"
                        fontWeight="600"
                        fill="#64748b"
                        textAnchor="middle"
                      >
                        Wasted
                      </text>
                      <text
                        x={p3.x}
                        y="116"
                        fontSize="6.5"
                        fontWeight="600"
                        fill="#64748b"
                        textAnchor="middle"
                      >
                        <tspan x={p3.x} dy="0">
                          Severely
                        </tspan>
                        <tspan x={p3.x} dy="8">
                          Wasted
                        </tspan>
                      </text>
                      <text
                        x={p4.x}
                        y="116"
                        fontSize="6.5"
                        fontWeight="600"
                        fill="#64748b"
                        textAnchor="middle"
                      >
                        Overweight
                      </text>
                      <text
                        x={p5.x}
                        y="116"
                        fontSize="6.5"
                        fontWeight="600"
                        fill="#64748b"
                        textAnchor="middle"
                      >
                        Obese
                      </text>
                    </svg>
                  </div>
                );
              })}

              <div
                style={{
                  border: "2px dashed #cbd5e1",
                  borderRadius: "14px",
                  padding: "16px",
                  backgroundColor: "#ffffff",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: "700",
                      color: "#1e3a8a",
                    }}
                  >
                    Combined Period Trend
                  </span>
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      marginTop: "6px",
                      flexWrap: "wrap",
                      rowGap: "2px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "8px",
                        fontWeight: "700",
                        color: "#10b981",
                      }}
                    >
                      ● Normal
                    </span>
                    <span
                      style={{
                        fontSize: "8px",
                        fontWeight: "700",
                        color: "#f59e0b",
                      }}
                    >
                      ● Wasted
                    </span>
                    <span
                      style={{
                        fontSize: "8px",
                        fontWeight: "700",
                        color: "#ef4444",
                      }}
                    >
                      ● Sev. Wast
                    </span>
                    <span
                      style={{
                        fontSize: "8px",
                        fontWeight: "700",
                        color: "#6366f1",
                      }}
                    >
                      ● Overwt
                    </span>
                    <span
                      style={{
                        fontSize: "8px",
                        fontWeight: "700",
                        color: "#b91c1c",
                      }}
                    >
                      ● Obese
                    </span>
                  </div>
                </div>
                <svg
                  viewBox="0 0 180 110"
                  style={{ width: "100%", height: "auto", overflow: "visible" }}
                >
                  <line
                    x1="20"
                    y1="90"
                    x2="165"
                    y2="90"
                    stroke="#cbd5e1"
                    strokeWidth="1.5"
                  />
                  <line
                    x1="20"
                    y1="15"
                    x2="20"
                    y2="90"
                    stroke="#e2e8f0"
                    strokeWidth="1"
                  />
                  <text
                    x="40"
                    y="104"
                    fontSize="9"
                    fontWeight="700"
                    fill="#475569"
                    textAnchor="middle"
                  >
                    Baseline
                  </text>
                  <text
                    x="95"
                    y="104"
                    fontSize="9"
                    fontWeight="700"
                    fill="#475569"
                    textAnchor="middle"
                  >
                    Midline
                  </text>
                  <text
                    x="150"
                    y="104"
                    fontSize="9"
                    fontWeight="700"
                    fill="#475569"
                    textAnchor="middle"
                  >
                    Endline
                  </text>
                </svg>
              </div>
            </div>

            {/* 2. HEIGHT-FOR-AGE DISTRIBUTION SEGMENT */}
            <h4
              style={{
                fontSize: "14px",
                fontWeight: "700",
                color: "#1e3a8a",
                borderBottom: "1px solid #f1f5f9",
                paddingBottom: "8px",
                marginBottom: "20px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Height-for-Age (HFA) Distribution Line Profiles
            </h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "20px",
              }}
            >
              {["Baseline", "Midline", "Endline"].map((pId, idx) => {
                const counts = hfaTimelineData[idx] || {
                  NormalHeight: 0,
                  Stunted: 0,
                  SeverelyStunted: 0,
                  Tall: 0,
                };
                const subMax = Math.max(
                  counts.NormalHeight,
                  counts.Stunted,
                  counts.SeverelyStunted,
                  counts.Tall,
                  5,
                );

                const p1 = {
                  x: 35,
                  y: 100 - (counts.NormalHeight / subMax) * 65,
                };
                const p2 = { x: 90, y: 100 - (counts.Stunted / subMax) * 65 };
                const p3 = {
                  x: 145,
                  y: 100 - (counts.SeverelyStunted / subMax) * 65,
                };
                const p4 = { x: 200, y: 100 - (counts.Tall / subMax) * 65 };

                return (
                  <div
                    key={pId}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "14px",
                      padding: "16px",
                      backgroundColor: "#f8fafc",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: "700",
                        color: "#334155",
                      }}
                    >
                      {pId}
                    </span>
                    <svg
                      viewBox="0 0 230 140"
                      style={{
                        width: "100%",
                        height: "auto",
                        marginTop: "12px",
                        overflow: "visible",
                      }}
                    >
                      <line
                        x1="15"
                        y1="35"
                        x2="215"
                        y2="35"
                        stroke="#e2e8f0"
                        strokeDasharray="3,3"
                      />
                      <line
                        x1="15"
                        y1="67"
                        x2="215"
                        y2="67"
                        stroke="#e2e8f0"
                        strokeDasharray="3,3"
                      />
                      <line
                        x1="15"
                        y1="100"
                        x2="215"
                        y2="100"
                        stroke="#cbd5e1"
                        strokeWidth="1.5"
                      />
                      <line
                        x1="15"
                        y1="15"
                        x2="15"
                        y2="100"
                        stroke="#cbd5e1"
                        strokeWidth="1"
                      />

                      <path
                        d={`M ${p1.x} 100 L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} L ${p4.x} 100 Z`}
                        fill="rgba(30, 58, 138, 0.04)"
                      />

                      <path
                        d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y}`}
                        fill="none"
                        stroke="#1e3a8a"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      <circle
                        cx={p1.x}
                        cy={p1.y}
                        r="3.5"
                        fill="#10b981"
                        stroke="#fff"
                        strokeWidth="1"
                      />
                      <text
                        x={p1.x}
                        y={p1.y - 6}
                        fontSize="9"
                        fontWeight="800"
                        fill="#059669"
                        textAnchor="middle"
                      >
                        {counts.NormalHeight}
                      </text>

                      <circle
                        cx={p2.x}
                        cy={p2.y}
                        r="3.5"
                        fill="#f59e0b"
                        stroke="#fff"
                        strokeWidth="1"
                      />
                      <text
                        x={p2.x}
                        y={p2.y - 6}
                        fontSize="9"
                        fontWeight="800"
                        fill="#d97706"
                        textAnchor="middle"
                      >
                        {counts.Stunted}
                      </text>

                      <circle
                        cx={p3.x}
                        cy={p3.y}
                        r="3.5"
                        fill="#ef4444"
                        stroke="#fff"
                        strokeWidth="1"
                      />
                      <text
                        x={p3.x}
                        y={p3.y - 6}
                        fontSize="9"
                        fontWeight="800"
                        fill="#dc2626"
                        textAnchor="middle"
                      >
                        {counts.SeverelyStunted}
                      </text>

                      <circle
                        cx={p4.x}
                        cy={p4.y}
                        r="3.5"
                        fill="#3b82f6"
                        stroke="#fff"
                        strokeWidth="1"
                      />
                      <text
                        x={p4.x}
                        y={p4.y - 6}
                        fontSize="9"
                        fontWeight="800"
                        fill="#2563eb"
                        textAnchor="middle"
                      >
                        {counts.Tall}
                      </text>

                      <text
                        x={p1.x}
                        y="116"
                        fontSize="6.5"
                        fontWeight="600"
                        fill="#64748b"
                        textAnchor="middle"
                      >
                        <tspan x={p1.x} dy="0">
                          Normal
                        </tspan>
                        <tspan x={p1.x} dy="8">
                          Height
                        </tspan>
                      </text>
                      <text
                        x={p2.x}
                        y="116"
                        fontSize="6.5"
                        fontWeight="600"
                        fill="#64748b"
                        textAnchor="middle"
                      >
                        Stunted
                      </text>
                      <text
                        x={p3.x}
                        y="116"
                        fontSize="6.5"
                        fontWeight="600"
                        fill="#64748b"
                        textAnchor="middle"
                      >
                        <tspan x={p3.x} dy="0">
                          Severely
                        </tspan>
                        <tspan x={p3.x} dy="8">
                          Stunted
                        </tspan>
                      </text>
                      <text
                        x={p4.x}
                        y="116"
                        fontSize="6.5"
                        fontWeight="600"
                        fill="#64748b"
                        textAnchor="middle"
                      >
                        Tall
                      </text>
                    </svg>
                  </div>
                );
              })}

              <div
                style={{
                  border: "2px dashed #cbd5e1",
                  borderRadius: "14px",
                  padding: "16px",
                  backgroundColor: "#ffffff",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: "700",
                      color: "#1e3a8a",
                    }}
                  >
                    Combined HFA Trend
                  </span>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      marginTop: "6px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "8px",
                        fontWeight: "700",
                        color: "#10b981",
                      }}
                    >
                      ● Norm Ht
                    </span>
                    <span
                      style={{
                        fontSize: "8px",
                        fontWeight: "700",
                        color: "#f59e0b",
                      }}
                    >
                      ● Stunted
                    </span>
                    <span
                      style={{
                        fontSize: "8px",
                        fontWeight: "700",
                        color: "#ef4444",
                      }}
                    >
                      ● Sev. Stun
                    </span>
                    <span
                      style={{
                        fontSize: "8px",
                        fontWeight: "700",
                        color: "#3b82f6",
                      }}
                    >
                      ● Tall
                    </span>
                  </div>
                </div>
                <svg
                  viewBox="0 0 180 110"
                  style={{ width: "100%", height: "auto", overflow: "visible" }}
                >
                  <line
                    x1="20"
                    y1="90"
                    x2="165"
                    y2="90"
                    stroke="#cbd5e1"
                    strokeWidth="1.5"
                  />
                  <line
                    x1="20"
                    y1="15"
                    x2="20"
                    y2="90"
                    stroke="#e2e8f0"
                    strokeWidth="1"
                  />
                  <text
                    x="40"
                    y="104"
                    fontSize="9"
                    fontWeight="700"
                    fill="#475569"
                    textAnchor="middle"
                  >
                    Baseline
                  </text>
                  <text
                    x="95"
                    y="104"
                    fontSize="9"
                    fontWeight="700"
                    fill="#475569"
                    textAnchor="middle"
                  >
                    Midline
                  </text>
                  <text
                    x="150"
                    y="104"
                    fontSize="9"
                    fontWeight="700"
                    fill="#475569"
                    textAnchor="middle"
                  >
                    Endline
                  </text>
                </svg>
              </div>
            </div>
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
