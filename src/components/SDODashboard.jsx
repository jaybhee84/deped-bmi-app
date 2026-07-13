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

  const schoolNames = [
    "ALL SCHOOLS",

    // ELEMENTARY
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

    // HIGH SCHOOL
    "Basilan National High School",
    "Basilan National High School - Night",
    "Baluno National High School",
    "Malamawi National High School",
    "Begang National High School",
    "Isabela City National High School",
    "Kumalarang National High School",
    "Ismael Integrated School (High School)",
    "Lampinigan National High School",
    "Tandung Ahas National High School",
    "Panigayan Integrated School (High School)",
    "Badjao Floating Integrated School (High School)",
    "Geras Integrated School (High School)",
    "Caro National High School",
  ];

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

              <optgroup label="ELEMENTARY">
                <option value="Isabela East Central Elementary School">
                  Isabela East Central Elementary School
                </option>
                <option value="Isabela Bliss Elementary School">
                  Isabela Bliss Elementary School
                </option>
                <option value="Bishop Querexeta Elementary School">
                  Bishop Querexeta Elementary School
                </option>
                <option value="Kaumpurnah Elementary School">
                  Kaumpurnah Elementary School
                </option>
                <option value="Simeon & Josefa Obsequio Elementary School">
                  Simeon & Josefa Obsequio Elementary School
                </option>
                <option value="Begang Central Elementary School">
                  Begang Central Elementary School
                </option>
                <option value="Busay Elementary School">
                  Busay Elementary School
                </option>
                <option value="Tabiawan Elementary School">
                  Tabiawan Elementary School
                </option>
                <option value="Latuan Elementary School">
                  Latuan Elementary School
                </option>
                <option value="Panunsulan Elementary School">
                  Panunsulan Elementary School
                </option>
                <option value="Kawa-Kawa Elementary School">
                  Kawa-Kawa Elementary School
                </option>
                <option value="Look-Jambangan Elementary School">
                  Look-Jambangan Elementary School
                </option>
                <option value="Kauman Ekka Elementary School">
                  Kauman Ekka Elementary School
                </option>
                <option value="Palasanan Primary School">
                  Palasanan Primary School
                </option>
                <option value="Spillway Elementary School">
                  Spillway Elementary School
                </option>
                <option value="Kapatagan Diutay Elementary School">
                  Kapatagan Diutay Elementary School
                </option>
                <option value="Hadji Camlani Elementary School">
                  Hadji Camlani Elementary School
                </option>
                <option value="Calvario Peak Elementary School">
                  Calvario Peak Elementary School
                </option>
                <option value="Calvario Elementary School">
                  Calvario Elementary School
                </option>
                <option value="Masola Elementary School">
                  Masola Elementary School
                </option>
                <option value="Lanote Elementary School">
                  Lanote Elementary School
                </option>
                <option value="Lunot Elementary School">
                  Lunot Elementary School
                </option>
                <option value="Cabunbata Elementary School">
                  Cabunbata Elementary School
                </option>
                <option value="Isabela Central Pilot Elementary School">
                  Isabela Central Pilot Elementary School
                </option>
                <option value="Isabela Central Pilot Elementary School - Night">
                  Isabela Central Pilot Elementary School - Night
                </option>
                <option value="Westside Elementary School">
                  Westside Elementary School
                </option>
                <option value="Ustadz Wahab Akbar Elementary School">
                  Ustadz Wahab Akbar Elementary School
                </option>
                <option value="Sunset Elementary School">
                  Sunset Elementary School
                </option>
                <option value="Ajibon Elementary School">
                  Ajibon Elementary School
                </option>
                <option value="Sumagdang Elementary School">
                  Sumagdang Elementary School
                </option>
                <option value="Kumalarang Elementary School">
                  Kumalarang Elementary School
                </option>
                <option value="Menzi Elementary School">
                  Menzi Elementary School
                </option>
                <option value="Balatanay Elementary School">
                  Balatanay Elementary School
                </option>
                <option value="Balawatin Elementary School">
                  Balawatin Elementary School
                </option>
                <option value="Makiri Elementary School">
                  Makiri Elementary School
                </option>
                <option value="Campo Barn Elementary School">
                  Campo Barn Elementary School
                </option>
                <option value="Hadji Maulana Primary School">
                  Hadji Maulana Primary School
                </option>
                <option value="Caro Elementary School">
                  Caro Elementary School
                </option>
                <option value="Malamawi Central Elementary School">
                  Malamawi Central Elementary School
                </option>
                <option value="Tampalan Elementary School">
                  Tampalan Elementary School
                </option>
                <option value="Diki Elementary School">
                  Diki Elementary School
                </option>
                <option value="Marang Marang Elementary School">
                  Marang Marang Elementary School
                </option>
                <option value="Lukbuton Elementary School">
                  Lukbuton Elementary School
                </option>
                <option value="Hadji Amilhamja Lahaba Memorial Elementary School">
                  Hadji Amilhamja Lahaba Memorial Elementary School
                </option>
                <option value="MS Bernardo Elementary School">
                  MS Bernardo Elementary School
                </option>
                <option value="Lampinigan Elementary School">
                  Lampinigan Elementary School
                </option>
                <option value="Ismael Integrated School">
                  Ismael Integrated School
                </option>
                <option value="Panigayan Integrated School">
                  Panigayan Integrated School
                </option>
                <option value="Badjao Floating Integrated School">
                  Badjao Floating Integrated School
                </option>
                <option value="Geras Integrated School">
                  Geras Integrated School
                </option>
              </optgroup>

              <optgroup label="HIGH SCHOOL">
                <option value="Basilan National High School">
                  Basilan National High School
                </option>
                <option value="Basilan National High School - Night">
                  Basilan National High School - Night
                </option>
                <option value="Baluno National High School">
                  Baluno National High School
                </option>
                <option value="Malamawi National High School">
                  Malamawi National High School
                </option>
                <option value="Begang National High School">
                  Begang National High School
                </option>
                <option value="Isabela City National High School">
                  Isabela City National High School
                </option>
                <option value="Kumalarang National High School">
                  Kumalarang National High School
                </option>
                <option value="Ismael Integrated School (High School)">
                  Ismael Integrated School (High School)
                </option>
                <option value="Lampinigan National High School">
                  Lampinigan National High School
                </option>
                <option value="Tandung Ahas National High School">
                  Tandung Ahas National High School
                </option>
                <option value="Panigayan Integrated School (High School)">
                  Panigayan Integrated School (High School)
                </option>
                <option value="Badjao Floating Integrated School (High School)">
                  Badjao Floating Integrated School (High School)
                </option>
                <option value="Geras Integrated School (High School)">
                  Geras Integrated School (High School)
                </option>
                <option value="Caro National High School">
                  Caro National High School
                </option>
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

            const info = isAll
              ? {
                  name: "ALL SCHOOLS",
                  division: "Isabela City Schools Division Office",
                  logo: null,
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

          {/* ── Incomplete data ── */}
          <div className="card" ref={incompleteRef}>
            <h3 className="card-title">
              Learners with Incomplete Data ({incompleteLearners.length})
            </h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>LRN</th>
                  <th>Name</th>
                  <th>Age</th>
                  <th>Sex</th>
                  <th>Section</th>
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
                    if (!recs.length) missing.push(`No ${filterPeriod} Record`);
                    else {
                      const last = recs[recs.length - 1];
                      if (!last.weight) missing.push("Weight");
                      if (!last.height) missing.push("Height");
                    }
                    return (
                      <tr key={s.id}>
                        <td>{s.lrn}</td>
                        <td>{s.name}</td>
                        <td>{s.age}</td>
                        <td>{s.sex}</td>
                        <td>{s.section}</td>
                        <td>
                          <span style={{ color: "#dc2626", fontWeight: 600 }}>
                            {missing.join(", ")}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Grade level breakdown table ── */}
          <div className="card">
            <h3 className="card-title">Nutritional Status by Grade Level</h3>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
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
                        <td
                          rowSpan={2}
                          style={{
                            background: gradeBg[grade],
                            fontWeight: 700,
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
