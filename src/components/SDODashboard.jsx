import React, { useMemo, useState, useRef, useEffect } from "react";
import { supabase } from "../utils/supabase";
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
import DataAndTables from "./DataAndTables";

// ── Multi-Segment SVG Donut Chart Component ──────────────────────────────────
function MultiSegmentDonut({ segments, total, centerNumber, centerLabel }) {
  let currentOffset = 25; // 12 o'clock position

  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
      <svg viewBox="0 0 42 42" width="100%" height="100%">
        {/* Background Base Circle */}
        <circle
          cx="21"
          cy="21"
          r="15.9155"
          fill="transparent"
          stroke="#e2e8f0"
          strokeWidth="5"
        />
        {/* Multi-Segment Arc Strokes */}
        {segments.map((seg) => {
          const pct = total > 0 ? (seg.count / total) * 100 : 0;
          if (pct <= 0) return null;
          const strokeDasharray = `${pct} ${100 - pct}`;
          const offset = currentOffset;
          currentOffset -= pct;

          return (
            <circle
              key={seg.label}
              cx="21"
              cy="21"
              r="15.9155"
              fill="transparent"
              stroke={seg.color}
              strokeWidth="5"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={offset}
            />
          );
        })}
      </svg>
      {/* Center Label Overlay */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          width: "80%",
        }}
      >
        <div
          style={{
            fontSize: "22px",
            fontWeight: 800,
            color: "#0f172a",
            lineHeight: 1,
          }}
        >
          {centerNumber}
        </div>
        <div
          style={{
            fontSize: "10px",
            color: "#64748b",
            marginTop: "4px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {centerLabel}
        </div>
      </div>
    </div>
  );
}

export default function SDODashboard({
  allSchoolsData,
  selectedSchool,
  setSelectedSchool,
}) {
  // allSchoolsData: { [schoolName]: students[] }

  // ── Modal popout state for enlarged charts ──
  const [modalChart, setModalChart] = useState(null);

  // ── School registry pulled from Supabase (source of truth) ─────────
  const [schools, setSchools] = useState([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [schoolsError, setSchoolsError] = useState(null);

  // Fallback map state for broken image logos
  const [brokenLogos, setBrokenLogos] = useState({});

  // Official enrolment loaded from sbfp_enrolment
  const [schoolEnrolment, setSchoolEnrolment] = useState(0);

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

  const [filterSY, setFilterSY] = useState("2026–2027");
  const [filterPeriod, setFilterPeriod] = useState("Baseline");
  const incompleteRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    function totalFromRow(row) {
      if (!row) return 0;
      return Object.values(row.data || {}).reduce(
        (acc, val) => acc + (Number(val) || 0),
        0,
      );
    }

    async function fetchEnrolment() {
      try {
        if (selectedSchool === "ALL SCHOOLS") {
          const { data, error } = await supabase
            .from("sbfp_enrolment")
            .select("data")
            .eq("sy", filterSY);

          if (!cancelled) {
            if (error) {
              console.error(
                "[SDODashboard] Enrolment fetch error (ALL SCHOOLS):",
                error,
              );
              setSchoolEnrolment(0);
            } else {
              const sum = (data || []).reduce(
                (acc, row) => acc + totalFromRow(row),
                0,
              );
              setSchoolEnrolment(sum);
            }
          }
          return;
        }

        const found = schools.find((s) => s.name === selectedSchool);
        const targetId = found?.school_id || found?.id;

        if (!targetId) {
          if (!cancelled) setSchoolEnrolment(0);
          return;
        }

        const { data, error } = await supabase
          .from("sbfp_enrolment")
          .select("data")
          .eq("school_id", String(targetId).trim())
          .eq("sy", filterSY)
          .maybeSingle();

        if (!cancelled) {
          if (error) {
            console.error("[SDODashboard] Enrolment fetch error:", error);
          }
          setSchoolEnrolment(!error && data ? totalFromRow(data) : 0);
        }
      } catch (e) {
        console.error("[SDODashboard] Failed to fetch enrolment:", e);
        if (!cancelled) setSchoolEnrolment(0);
      }
    }

    fetchEnrolment();

    return () => {
      cancelled = true;
    };
  }, [selectedSchool, filterSY, schools]);

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

    return [...rawSchools].sort((a, b) => a.localeCompare(b));
  }, []);

  const students = useMemo(() => {
    if (selectedSchool === "ALL SCHOOLS") {
      return Object.values(allSchoolsData).flat();
    }
    return allSchoolsData[selectedSchool] || [];
  }, [selectedSchool, allSchoolsData]);

  const syStudents = students.filter((s) =>
    s.records.some((r) => r.sy === filterSY),
  );

  const totalEnrollees = useMemo(() => {
    return schoolEnrolment > 0 ? schoolEnrolment : syStudents.length;
  }, [schoolEnrolment, syStudents.length]);

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

  const schoolReportingStats = useMemo(() => {
    const total = schoolNames.length;
    let reporting = 0;
    schoolNames.forEach((name) => {
      const roster = allSchoolsData[name] || [];
      const hasData = roster.some((s) =>
        s.records.some((r) => r.sy === filterSY && r.q === filterPeriod),
      );
      if (hasData) reporting++;
    });
    const notReporting = total - reporting;
    const pct = total ? (reporting / total) * 100 : 0;
    return { total, reporting, notReporting, pct };
  }, [schoolNames, allSchoolsData, filterSY, filterPeriod]);

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

      totals.Female.Normal += f.Normal;
      totals.Female.Wasted += f.Wasted;
      totals.Female.SevWasted += f["Severely Wasted"];
      totals.Female.Overweight += f["Severely Wasted"];
      totals.Female.Obese += f.Obese;
      totals.Female.NormalHt += f["Normal Height"];
      totals.Female.Stunted += f.Stunted;
      totals.Female.SevStunted += f["Severely Stunted"];
      totals.Female.Tall += f.Tall;
      totals.Female.Total += f.Total;
    });

    Object.keys(totals.Combined).forEach((key) => {
      totals.Combined[key] = totals.Male[key] + totals.Female[key];
    });

    return totals;
  }, [gradeSummary]);

  const totalForPeriod = students.filter((s) =>
    s.records.some((r) => r.sy === filterSY && r.q === filterPeriod),
  ).length;

  const timelineData = useMemo(() => {
    return ["Baseline", "Midline", "Endline"].map((period) => {
      const counts = {
        Normal: 0,
        Wasted: 0,
        "Severely Wasted": 0,
        Overweight: 0,
        Obese: 0,
      };
      syStudents.forEach((s) => {
        const recs = s.records.filter(
          (r) => r.sy === filterSY && r.q === period,
        );
        if (!recs.length) return;
        const last = recs[recs.length - 1];
        const bmi = calcBMI(last.weight, last.height);
        if (!bmi) return;
        const lbl = getBMIStatus(bmi, s.sex, s.birthdate).label;
        if (counts[lbl] !== undefined) counts[lbl]++;
      });
      return { period, ...counts };
    });
  }, [syStudents, filterSY]);

  const hfaTimelineData = useMemo(() => {
    return ["Baseline", "Midline", "Endline"].map((period) => {
      const counts = {
        "Normal Height": 0,
        Stunted: 0,
        "Severely Stunted": 0,
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
        if (haz?.label === "Normal" && counts["Normal Height"] !== undefined)
          counts["Normal Height"]++;
        else if (haz?.label && counts[haz.label] !== undefined)
          counts[haz.label]++;
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

  const bmiPieSegments = useMemo(() => {
    return [
      { label: "Normal", count: statusCounts["Normal"], color: "#10b981" },
      { label: "Wasted", count: statusCounts["Wasted"], color: "#f59e0b" },
      {
        label: "Severely Wasted",
        count: statusCounts["Severely Wasted"],
        color: "#ef4444",
      },
      {
        label: "Overweight",
        count: statusCounts["Overweight"],
        color: "#6366f1",
      },
      { label: "Obese", count: statusCounts["Obese"], color: "#b91c1c" },
    ];
  }, [statusCounts]);

  const hfaPieSegments = useMemo(() => {
    return [
      {
        label: "Normal Height",
        count: hfaCounts["Normal Height"],
        color: "#10b981",
      },
      { label: "Stunted", count: hfaCounts["Stunted"], color: "#f59e0b" },
      {
        label: "Severely Stunted",
        count: hfaCounts["Severely Stunted"],
        color: "#ef4444",
      },
      { label: "Tall", count: hfaCounts["Tall"], color: "#3b82f6" },
    ];
  }, [hfaCounts]);

  const gradeBg = {
    Kinder: "#FFF7ED",
    "Grade 1": "#EFF6FF",
    "Grade 2": "#F0FDF4",
    "Grade 3": "#FEFCE8",
    "Grade 4": "#FDF2F8",
    "Grade 5": "#F5F3FF",
    "Grade 6": "#ECFEFF",
  };

  const combinedMaxBMI = useMemo(() => {
    return Math.max(
      ...timelineData.flatMap((d) => [
        d.Normal,
        d.Wasted,
        d["Severely Wasted"],
        d.Overweight,
        d.Obese,
      ]),
      5,
    );
  }, [timelineData]);

  const combinedMaxHFA = useMemo(() => {
    return Math.max(
      ...hfaTimelineData.flatMap((d) => [
        d["Normal Height"],
        d.Stunted,
        d["Severely Stunted"],
        d.Tall,
      ]),
      5,
    );
  }, [hfaTimelineData]);

  return (
    <div className="page">
      {/* ── Scoped CSS ── */}
      <style>{`
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
        .sdo-isolated-table tfoot tr {
          background-color: #F9FAFB !important;
        }
        .sdo-isolated-table tfoot tr.overall-grand-total {
          background-color: #E2E8F0 !important;
          font-size: 13px !important;
        }
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

        .sdo-school-banner {
          display: flex;
          align-items: center;
          gap: 28px;
          padding: 24px;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.06);
          margin-bottom: 24px;
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

        /* ── Clickable Graph Cards & Modal Overlay ── */
        .clickable-graph-card {
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          position: relative;
        }
        .clickable-graph-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
          border-color: #93c5fd !important;
        }
        .clickable-graph-card::after {
          content: "🔍 Click to enlarge";
          position: absolute;
          top: 10px;
          right: 12px;
          font-size: 10px;
          font-weight: 600;
          color: #64748b;
          background: rgba(255, 255, 255, 0.9);
          padding: 2px 6px;
          border-radius: 4px;
          opacity: 0;
          transition: opacity 0.2s ease;
          pointer-events: none;
        }
        .clickable-graph-card:hover::after {
          opacity: 1;
        }

        .chart-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background-color: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          padding: 20px;
        }
        .chart-modal-content {
          background: #ffffff;
          border-radius: 16px;
          padding: 28px;
          width: 100%;
          max-width: 700px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          position: relative;
          animation: modalPop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes modalPop {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        .chart-modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          background: #f1f5f9;
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: bold;
          color: #475569;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .chart-modal-close:hover {
          background: #e2e8f0;
          color: #0f172a;
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

      {/* ── Conditional Main Layout States ── */}
      {!selectedSchool ? (
        <div className="sdo-empty">
          <div className="sdo-empty-icon">🏫</div>
          <p>Select a school above to view its nutritional status data.</p>
        </div>
      ) : (
        <>
          {/* ── No-records notice (dashboard still renders below, zero-filled) ── */}
          {students.length === 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 14px",
                background: "#FFF7ED",
                border: "1px solid #FED7AA",
                color: "#9A3412",
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              <span style={{ fontSize: "16px" }}>📋</span>
              <span>
                No records submitted yet for <strong>{selectedSchool}</strong>.
                The figures below will update automatically once the school
                uploads their data.
              </span>
            </div>
          )}

          {/* ── School info banner ── */}
          {(() => {
            const isAll = selectedSchool === "ALL SCHOOLS";
            const foundSchool =
              !isAll && schools.find((s) => s.name === selectedSchool);

            const sampleUrl =
              getSchoolLogoUrl("Isabela East Central Elementary School") || "";
            const sdoLogoUrl = sampleUrl
              ? `${sampleUrl.substring(0, sampleUrl.lastIndexOf("/"))}/sdo.png`
              : null;

            const info = isAll
              ? {
                  name: "Division of Isabela City",
                  division: "Isabela City Schools Division Office",
                  logo: sdoLogoUrl,
                }
              : {
                  ...(foundSchool || {
                    name: selectedSchool,
                    division: "Isabela City Schools Division Office",
                  }),
                  logo: getSchoolLogoUrl(selectedSchool),
                };

            const hasLogoFailing = brokenLogos[info.name || "default"];

            return (
              <div className="sdo-school-banner">
                {info.logo && !hasLogoFailing ? (
                  <img
                    src={info.logo}
                    alt={info.name}
                    className="sdo-banner-logo"
                    onError={() => {
                      setBrokenLogos((prev) => ({
                        ...prev,
                        [info.name]: true,
                      }));
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
                    <strong>{totalEnrollees}</strong> total learners
                  </span>
                  <span>
                    <strong>{totalForPeriod}</strong> with {filterPeriod}{" "}
                    records
                  </span>
                </div>
              </div>
            );
          })()}

          {/* ── Dynamic Top Section: Stat cards + Pie Chart(s) ── */}
          <div
            className="sdo-stats-row"
            style={{
              display: "grid",
              gridTemplateColumns:
                selectedSchool === "ALL SCHOOLS" ? "1fr 1fr" : "40% 60%",
              gap: "24px",
              marginBottom: "32px",
              alignItems: "stretch",
            }}
          >
            {/* ── Cards Container (Left Side) ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  selectedSchool === "ALL SCHOOLS"
                    ? "repeat(2, 1fr)"
                    : "repeat(2, 1fr)",
                gap: "12px",
                width: "100%",
                alignContent: "start",
              }}
            >
              {[
                {
                  label: "Total Learners",
                  val: totalEnrollees,
                  border: "#cbd5e1",
                  color: "#0f172a",
                },
                {
                  label: `Learners with Records out of ${totalEnrollees}`,
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
                    padding: "10px 12px",
                    borderRadius: "10px",
                    boxShadow:
                      "0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.02)",
                    borderTop: `4px solid ${s.border}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: "22px",
                      fontWeight: "800",
                      color: s.color,
                      lineHeight: "1",
                      letterSpacing: "-0.5px",
                    }}
                  >
                    {s.val}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: "600",
                      color: "#64748b",
                      marginTop: "4px",
                    }}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Dynamic Chart Container (Right Side) ── */}
            {selectedSchool === "ALL SCHOOLS" ? (
              <div
                className="card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                <h3 className="card-title" style={{ marginBottom: 4 }}>
                  Schools Reporting
                </h3>
                <p
                  style={{
                    color: "#64748b",
                    fontSize: "12px",
                    marginBottom: "16px",
                  }}
                >
                  {filterSY} · {filterPeriod}
                </p>

                <div
                  style={{
                    position: "relative",
                    width: "min(280px, 100%)",
                    aspectRatio: "1 / 1",
                  }}
                >
                  <svg viewBox="0 0 42 42" width="100%" height="100%">
                    <circle
                      cx="21"
                      cy="21"
                      r="15.9155"
                      fill="transparent"
                      stroke="#e2e8f0"
                      strokeWidth="5"
                    />
                    {schoolReportingStats.pct > 0 && (
                      <circle
                        cx="21"
                        cy="21"
                        r="15.9155"
                        fill="transparent"
                        stroke="#10b981"
                        strokeWidth="5"
                        strokeDasharray={`${schoolReportingStats.pct} ${
                          100 - schoolReportingStats.pct
                        }`}
                        strokeDashoffset="25"
                        strokeLinecap="round"
                      />
                    )}
                  </svg>
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "38px",
                        fontWeight: 800,
                        color: "#0f172a",
                        lineHeight: 1,
                      }}
                    >
                      {schoolReportingStats.pct.toFixed(0)}%
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#64748b",
                        marginTop: 4,
                      }}
                    >
                      reporting
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "20px",
                    marginTop: "20px",
                    fontSize: "12px",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "#10b981",
                        display: "inline-block",
                      }}
                    />
                    <span>
                      <strong>{schoolReportingStats.reporting}</strong> with
                      data
                    </span>
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "#e2e8f0",
                        display: "inline-block",
                      }}
                    />
                    <span>
                      <strong>{schoolReportingStats.notReporting}</strong> no
                      data yet
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: "11px",
                    color: "#94a3b8",
                    marginTop: "10px",
                  }}
                >
                  {schoolReportingStats.reporting} out of{" "}
                  {schoolReportingStats.total} schools division-wide
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                  height: "100%",
                }}
              >
                {/* ── Pie Chart 1: Nutritional Status (BMI) ── */}
                <div
                  className="card"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "20px 16px",
                  }}
                >
                  <div style={{ textAlign: "center", width: "100%" }}>
                    <h3
                      className="card-title"
                      style={{
                        fontSize: "15px",
                        fontWeight: 700,
                        marginBottom: 2,
                      }}
                    >
                      Nutritional Status
                    </h3>
                    <p
                      style={{
                        color: "#64748b",
                        fontSize: "11px",
                        marginBottom: "12px",
                      }}
                    >
                      BMI-for-Age (% out of {totalEnrollees})
                    </p>
                  </div>

                  <div style={{ width: "min(180px, 100%)" }}>
                    <MultiSegmentDonut
                      segments={bmiPieSegments}
                      total={totalEnrollees}
                      centerNumber={totalEnrollees}
                      centerLabel="Learners"
                    />
                  </div>

                  <div
                    style={{
                      width: "100%",
                      marginTop: "14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      fontSize: "11px",
                    }}
                  >
                    {bmiPieSegments.map((seg) => {
                      const pctVal = totalEnrollees
                        ? ((seg.count / totalEnrollees) * 100).toFixed(1)
                        : "0.0";
                      return (
                        <div
                          key={seg.label}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: seg.color,
                                display: "inline-block",
                              }}
                            />
                            <span style={{ color: "#334155", fontWeight: 500 }}>
                              {seg.label}
                            </span>
                          </div>
                          <span style={{ fontWeight: 700, color: "#0f172a" }}>
                            {seg.count}{" "}
                            <span
                              style={{
                                color: "#64748b",
                                fontWeight: 400,
                                fontSize: "10px",
                              }}
                            >
                              ({pctVal}%)
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Pie Chart 2: Height-for-Age (HFA) ── */}
                <div
                  className="card"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "20px 16px",
                  }}
                >
                  <div style={{ textAlign: "center", width: "100%" }}>
                    <h3
                      className="card-title"
                      style={{
                        fontSize: "15px",
                        fontWeight: 700,
                        marginBottom: 2,
                      }}
                    >
                      Height-for-Age (HFA)
                    </h3>
                    <p
                      style={{
                        color: "#64748b",
                        fontSize: "11px",
                        marginBottom: "12px",
                      }}
                    >
                      Stature Status (% out of {totalEnrollees})
                    </p>
                  </div>

                  <div style={{ width: "min(180px, 100%)" }}>
                    <MultiSegmentDonut
                      segments={hfaPieSegments}
                      total={totalEnrollees}
                      centerNumber={totalEnrollees}
                      centerLabel="Learners"
                    />
                  </div>

                  <div
                    style={{
                      width: "100%",
                      marginTop: "14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      fontSize: "11px",
                    }}
                  >
                    {hfaPieSegments.map((seg) => {
                      const pctVal = totalEnrollees
                        ? ((seg.count / totalEnrollees) * 100).toFixed(1)
                        : "0.0";
                      return (
                        <div
                          key={seg.label}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: seg.color,
                                display: "inline-block",
                              }}
                            />
                            <span style={{ color: "#334155", fontWeight: 500 }}>
                              {seg.label}
                            </span>
                          </div>
                          <span style={{ fontWeight: 700, color: "#0f172a" }}>
                            {seg.count}{" "}
                            <span
                              style={{
                                color: "#64748b",
                                fontWeight: 400,
                                fontSize: "10px",
                              }}
                            >
                              ({pctVal}%)
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Side-by-side distribution graphs ── */}
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
                const pct = totalEnrollees
                  ? (statusCounts[b.label] / totalEnrollees) * 100
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
                const pct = totalEnrollees
                  ? (hfaCounts[b.label] / totalEnrollees) * 100
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

          {/* ── Comprehensive line trends section (CLICKABLE) ── */}
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
              line profiles. Click any chart card below to enlarge.
            </p>

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
                  "Severely Wasted": 0,
                  Overweight: 0,
                  Obese: 0,
                };
                const cNormal = rawData.Normal || 0;
                const cWasted = rawData.Wasted || 0;
                const cSevWasted = rawData["Severely Wasted"] || 0;
                const cOverweight = rawData.Overweight || 0;
                const cObese = rawData.Obese || 0;

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

                const chartSvg = (
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
                );

                return (
                  <div
                    key={pId}
                    className="clickable-graph-card"
                    onClick={() =>
                      setModalChart({
                        title: `${pId} — Nutritional Status Profile`,
                        subtitle: `${selectedSchool} (${filterSY})`,
                        content: chartSvg,
                      })
                    }
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
                    {chartSvg}
                  </div>
                );
              })}

              {/* Combined Period Trend */}
              {(() => {
                const combinedSvg = (
                  <svg
                    viewBox="0 0 180 110"
                    style={{
                      width: "100%",
                      height: "auto",
                      overflow: "visible",
                    }}
                  >
                    <line
                      x1="20"
                      y1="25"
                      x2="165"
                      y2="25"
                      stroke="#f1f5f9"
                      strokeDasharray="2,2"
                    />
                    <line
                      x1="20"
                      y1="55"
                      x2="165"
                      y2="55"
                      stroke="#f1f5f9"
                      strokeDasharray="2,2"
                    />
                    <line
                      x1="20"
                      y1="85"
                      x2="165"
                      y2="85"
                      stroke="#cbd5e1"
                      strokeWidth="1.5"
                    />
                    <line
                      x1="20"
                      y1="10"
                      x2="20"
                      y2="85"
                      stroke="#e2e8f0"
                      strokeWidth="1"
                    />

                    {[
                      "Normal",
                      "Wasted",
                      "Severely Wasted",
                      "Overweight",
                      "Obese",
                    ].map((lbl, idx) => {
                      const colors = [
                        "#10b981",
                        "#f59e0b",
                        "#ef4444",
                        "#6366f1",
                        "#b91c1c",
                      ];
                      const pts = timelineData.map((d, dIdx) => {
                        const x = 40 + dIdx * 55;
                        const val = d[lbl] || 0;
                        const y = 85 - (val / combinedMaxBMI) * 65;
                        return { x, y };
                      });
                      const dStr = `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y} L ${pts[2].x} ${pts[2].y}`;
                      return (
                        <g key={lbl}>
                          <path
                            d={dStr}
                            fill="none"
                            stroke={colors[idx]}
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                          {pts.map((pt, pIdx) => (
                            <circle
                              key={pIdx}
                              cx={pt.x}
                              cy={pt.y}
                              r="2.5"
                              fill={colors[idx]}
                            />
                          ))}
                        </g>
                      );
                    })}

                    <text
                      x="40"
                      y="98"
                      fontSize="9"
                      fontWeight="700"
                      fill="#475569"
                      textAnchor="middle"
                    >
                      Baseline
                    </text>
                    <text
                      x="95"
                      y="98"
                      fontSize="9"
                      fontWeight="700"
                      fill="#475569"
                      textAnchor="middle"
                    >
                      Midline
                    </text>
                    <text
                      x="150"
                      y="98"
                      fontSize="9"
                      fontWeight="700"
                      fill="#475569"
                      textAnchor="middle"
                    >
                      Endline
                    </text>
                  </svg>
                );

                return (
                  <div
                    className="clickable-graph-card"
                    onClick={() =>
                      setModalChart({
                        title: "Combined Period Trend — Nutritional Status",
                        subtitle: `${selectedSchool} (${filterSY})`,
                        content: (
                          <div>
                            <div
                              style={{
                                display: "flex",
                                gap: "12px",
                                marginBottom: "16px",
                                justifyContent: "center",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  color: "#10b981",
                                }}
                              >
                                ● Normal
                              </span>
                              <span
                                style={{
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  color: "#f59e0b",
                                }}
                              >
                                ● Wasted
                              </span>
                              <span
                                style={{
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  color: "#ef4444",
                                }}
                              >
                                ● Sev. Wasted
                              </span>
                              <span
                                style={{
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  color: "#6366f1",
                                }}
                              >
                                ● Overweight
                              </span>
                              <span
                                style={{
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  color: "#b91c1c",
                                }}
                              >
                                ● Obese
                              </span>
                            </div>
                            {combinedSvg}
                          </div>
                        ),
                      })
                    }
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
                    {combinedSvg}
                  </div>
                );
              })()}
            </div>

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
                  "Normal Height": 0,
                  Stunted: 0,
                  "Severely Stunted": 0,
                  Tall: 0,
                };
                const subMax = Math.max(
                  counts["Normal Height"],
                  counts.Stunted,
                  counts["Severely Stunted"],
                  counts.Tall,
                  5,
                );

                const p1 = {
                  x: 35,
                  y: 100 - (counts["Normal Height"] / subMax) * 65,
                };
                const p2 = { x: 90, y: 100 - (counts.Stunted / subMax) * 65 };
                const p3 = {
                  x: 145,
                  y: 100 - (counts["Severely Stunted"] / subMax) * 65,
                };
                const p4 = { x: 200, y: 100 - (counts.Tall / subMax) * 65 };

                const hfaSvg = (
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
                      {counts["Normal Height"]}
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
                      {counts["Severely Stunted"]}
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
                );

                return (
                  <div
                    key={pId}
                    className="clickable-graph-card"
                    onClick={() =>
                      setModalChart({
                        title: `${pId} — Height-for-Age (HFA) Profile`,
                        subtitle: `${selectedSchool} (${filterSY})`,
                        content: hfaSvg,
                      })
                    }
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
                    {hfaSvg}
                  </div>
                );
              })}

              {/* Combined HFA Trend */}
              {(() => {
                const combinedHfaSvg = (
                  <svg
                    viewBox="0 0 180 110"
                    style={{
                      width: "100%",
                      height: "auto",
                      overflow: "visible",
                    }}
                  >
                    <line
                      x1="20"
                      y1="25"
                      x2="165"
                      y2="25"
                      stroke="#f1f5f9"
                      strokeDasharray="2,2"
                    />
                    <line
                      x1="20"
                      y1="55"
                      x2="165"
                      y2="55"
                      stroke="#f1f5f9"
                      strokeDasharray="2,2"
                    />
                    <line
                      x1="20"
                      y1="85"
                      x2="165"
                      y2="85"
                      stroke="#cbd5e1"
                      strokeWidth="1.5"
                    />
                    <line
                      x1="20"
                      y1="10"
                      x2="20"
                      y2="85"
                      stroke="#e2e8f0"
                      strokeWidth="1"
                    />

                    {[
                      "Normal Height",
                      "Stunted",
                      "Severely Stunted",
                      "Tall",
                    ].map((lbl, idx) => {
                      const colors = [
                        "#10b981",
                        "#f59e0b",
                        "#ef4444",
                        "#3b82f6",
                      ];
                      const pts = hfaTimelineData.map((d, dIdx) => {
                        const x = 40 + dIdx * 55;
                        const val = d[lbl] || 0;
                        const y = 85 - (val / combinedMaxHFA) * 65;
                        return { x, y };
                      });
                      const dStr = `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y} L ${pts[2].x} ${pts[2].y}`;
                      return (
                        <g key={lbl}>
                          <path
                            d={dStr}
                            fill="none"
                            stroke={colors[idx]}
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                          {pts.map((pt, pIdx) => (
                            <circle
                              key={pIdx}
                              cx={pt.x}
                              cy={pt.y}
                              r="2.5"
                              fill={colors[idx]}
                            />
                          ))}
                        </g>
                      );
                    })}

                    <text
                      x="40"
                      y="98"
                      fontSize="9"
                      fontWeight="700"
                      fill="#475569"
                      textAnchor="middle"
                    >
                      Baseline
                    </text>
                    <text
                      x="95"
                      y="98"
                      fontSize="9"
                      fontWeight="700"
                      fill="#475569"
                      textAnchor="middle"
                    >
                      Midline
                    </text>
                    <text
                      x="150"
                      y="98"
                      fontSize="9"
                      fontWeight="700"
                      fill="#475569"
                      textAnchor="middle"
                    >
                      Endline
                    </text>
                  </svg>
                );

                return (
                  <div
                    className="clickable-graph-card"
                    onClick={() =>
                      setModalChart({
                        title: "Combined Height-for-Age (HFA) Trend",
                        subtitle: `${selectedSchool} (${filterSY})`,
                        content: (
                          <div>
                            <div
                              style={{
                                display: "flex",
                                gap: "12px",
                                marginBottom: "16px",
                                justifyContent: "center",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  color: "#10b981",
                                }}
                              >
                                ● Normal Height
                              </span>
                              <span
                                style={{
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  color: "#f59e0b",
                                }}
                              >
                                ● Stunted
                              </span>
                              <span
                                style={{
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  color: "#ef4444",
                                }}
                              >
                                ● Sev. Stunted
                              </span>
                              <span
                                style={{
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  color: "#3b82f6",
                                }}
                              >
                                ● Tall
                              </span>
                            </div>
                            {combinedHfaSvg}
                          </div>
                        ),
                      })
                    }
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
                    {combinedHfaSvg}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ── Grade level breakdown table isolated component ── */}
          <DataAndTables
            GRADE_LEVELS={GRADE_LEVELS}
            gradeSummary={gradeSummary}
            grandTotals={grandTotals}
            gradeTotals={gradeTotals}
            gradeBg={gradeBg}
          />
        </>
      )}

      {/* ── Enlarged Graph Popout Modal ── */}
      {modalChart && (
        <div
          className="chart-modal-overlay"
          onClick={() => setModalChart(null)}
        >
          <div
            className="chart-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="chart-modal-close"
              onClick={() => setModalChart(null)}
              title="Close"
            >
              ✕
            </button>
            <h3
              style={{
                fontSize: "20px",
                fontWeight: "800",
                color: "#0f172a",
                marginBottom: "4px",
              }}
            >
              {modalChart.title}
            </h3>
            {modalChart.subtitle && (
              <p
                style={{
                  fontSize: "13px",
                  color: "#64748b",
                  marginBottom: "20px",
                }}
              >
                {modalChart.subtitle}
              </p>
            )}
            <div style={{ marginTop: "12px" }}>{modalChart.content}</div>
          </div>
        </div>
      )}
    </div>
  );
}
