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
import { fetchSchoolById } from "../utils/syncService";
import { getSchoolLogoUrl } from "../utils/schoolLogoMap";
import { loadSbfpEnrolment } from "../utils/sbfpConfig";

export default function Dashboard({ students, currentUser, onOpenProfile }) {
  const [filterSY, setFilterSY] = useState("2026–2027");
  const [filterPeriod, setFilterPeriod] = useState("Baseline");
  const [schoolLogo, setSchoolLogo] = useState(null);
  const [schoolName, setSchoolName] = useState("");
  const [schoolId, setSchoolId] = useState(
    currentUser?.school_id ||
      window.localStorage.getItem("current_school_id") ||
      "",
  );
  const [totalEnrolment, setTotalEnrolment] = useState(0);

  const schoolYears = getSchoolYears();
  const incompleteDataRef = useRef(null);

  useEffect(() => {
    async function loadSchoolDb() {
      let currentName =
        currentUser?.school_name || currentUser?.schoolName || "";
      const targetSchoolId =
        currentUser?.school_id ||
        window.localStorage.getItem("current_school_id");

      if (targetSchoolId) setSchoolId(targetSchoolId);

      if (currentName) {
        setSchoolName(currentName);
        const supabaseUrl = getSchoolLogoUrl(currentName);
        if (supabaseUrl) setSchoolLogo(supabaseUrl);
      }

      if (!targetSchoolId) return;

      try {
        if (window.sqlite?.loadSchoolWithLogo) {
          const schoolData =
            await window.sqlite.loadSchoolWithLogo(targetSchoolId);
          if (schoolData) {
            const resolvedName = schoolData.school_name || currentName;
            if (resolvedName) {
              setSchoolName(resolvedName);
              const supabaseUrl = getSchoolLogoUrl(resolvedName);
              if (supabaseUrl) {
                setSchoolLogo(supabaseUrl);
                return;
              }
            }
          }
        }

        if (window.sqlite?.loadSchool) {
          const schoolData = await window.sqlite.loadSchool(targetSchoolId);
          if (schoolData) {
            const resolvedName = schoolData.school_name || currentName;
            if (resolvedName) {
              setSchoolName(resolvedName);
              const supabaseUrl = getSchoolLogoUrl(resolvedName);
              if (supabaseUrl) {
                setSchoolLogo(supabaseUrl);
                return;
              }
            }
          }
        }

        if (navigator.onLine) {
          try {
            const boundSchool = await fetchSchoolById(targetSchoolId);
            if (boundSchool) {
              const remoteName = boundSchool.name || boundSchool.school_name;
              if (remoteName) {
                setSchoolName(remoteName);
                const supabaseUrl = getSchoolLogoUrl(remoteName);
                if (supabaseUrl) {
                  setSchoolLogo(supabaseUrl);
                  if (window.sqlite?.saveSchool) {
                    await window.sqlite.saveSchool(
                      {
                        school_id: targetSchoolId,
                        school_name: remoteName,
                        logo_url: supabaseUrl,
                      },
                      currentUser?.id,
                    );
                  }
                }
              }
            }
          } catch (syncError) {
            console.warn(
              "[Identity Bridge] Remote backdrop query bypassed:",
              syncError,
            );
          }
        }
      } catch (e) {
        console.error("[Identity Bridge] Critical lookup error:", e);
      }
    }
    loadSchoolDb();
  }, [currentUser]);

  useEffect(() => {
    if (!schoolId) {
      setTotalEnrolment(0);
      return;
    }

    let cancelled = false;

    async function fetchEnrolmentTotal() {
      try {
        // loadSbfpEnrolment is already offline-first: it reads local SQLite
        // immediately, then (if online) refreshes from Supabase and
        // re-caches that locally. No need to duplicate that logic here.
        const enrolmentData = await loadSbfpEnrolment(schoolId, filterSY);
        const total = Object.values(enrolmentData || {}).reduce(
          (sum, val) => sum + (Number(val) || 0),
          0,
        );
        if (!cancelled) setTotalEnrolment(total);
      } catch (err) {
        console.error("[Dashboard] Failed to load enrolment total:", err);
        if (!cancelled) setTotalEnrolment(0);
      }
    }

    fetchEnrolmentTotal();

    return () => {
      cancelled = true;
    };
  }, [schoolId, filterSY]);

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
        const bmiStatus = bmi ? getBMIStatus(bmi, s.sex, s.birthdate) : null;
        const hazStatus = last.height
          ? getHAZStatus(last.height, s.sex, s.birthdate)
          : null;

        return bmi || last.height
          ? { bmi, status: bmiStatus, hazStatus, record: last, student: s }
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
    return !last.weight || !last.height || !s.birthdate || !s.sex;
  });

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
      const lbl = getBMIStatus(bmi, s.sex, s.birthdate).label;
      if (c[lbl] !== undefined) c[lbl]++;
    });
    return c;
  }, [syStudents, filterSY, filterPeriod]);

  const hfaStatusCounts = useMemo(() => {
    const counts = {
      "Normal Height": 0,
      Stunted: 0,
      "Severely Stunted": 0,
      Tall: 0,
    };
    allLatestBMI.forEach((item) => {
      if (item.hazStatus?.label) {
        const label =
          item.hazStatus.label === "Normal"
            ? "Normal Height"
            : item.hazStatus.label;
        if (counts[label] !== undefined) counts[label]++;
      }
    });
    return counts;
  }, [allLatestBMI]);

  // Timeline Trends
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

  const maxVal = useMemo(() => {
    return Math.max(
      ...timelineData.map((d) => Math.max(d.Normal, d.Wasted, d.Overweight)),
      5,
    );
  }, [timelineData]);

  const hfaMax = useMemo(() => {
    return Math.max(
      ...hfaTimelineData.map((d) =>
        Math.max(d.NormalHeight, d.Stunted, d.SeverelyStunted, d.Tall),
      ),
      5,
    );
  }, [hfaTimelineData]);

  const barItems = [
    { label: "Normal", color: "#10b981" },
    { label: "Wasted", color: "#f59e0b" },
    { label: "Overweight", color: "#6366f1" },
    { label: "Severely Wasted", color: "#ef4444" },
    { label: "Obese", color: "#b91c1c" },
  ];

  const hfaBarItems = [
    { label: "Normal Height", color: "#10b981" },
    { label: "Stunted", color: "#f59e0b" },
    { label: "Severely Stunted", color: "#ef4444" },
    { label: "Tall", color: "#3b82f6" },
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

      if (
        item.status?.label &&
        summary[grade][sex][item.status.label] !== undefined
      ) {
        summary[grade][sex][item.status.label]++;
      }

      if (item.hazStatus?.label) {
        const hazLabel =
          item.hazStatus.label === "Normal"
            ? "Normal Height"
            : item.hazStatus.label;
        if (summary[grade][sex][hazLabel] !== undefined) {
          summary[grade][sex][hazLabel]++;
        }
      }
    });
    return summary;
  }, [allLatestBMI]);

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

  const scopedStyles = {
    table: {
      width: "100%",
      borderCollapse: "separate",
      borderSpacing: "0",
      minWidth: "1100px",
      fontSize: "13px",
    },
    th: {
      backgroundColor: "#1e3a8a",
      color: "#ffffff",
      padding: "14px 10px",
      textAlign: "center",
      fontWeight: "600",
      fontSize: "12px",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      borderBottom: "2px solid #0f172a",
    },
    tdGrade: {
      backgroundColor: "#ffffff",
      fontWeight: "600",
      padding: "12px 14px",
      verticalAlign: "middle",
      borderRight: "1px solid #e2e8f0",
      borderBottom: "1px solid #e2e8f0",
      color: "#1e293b",
    },
    tdCell: (isAlternate = false, isBottom = false) => ({
      padding: "12px 10px",
      textAlign: "center",
      backgroundColor: isAlternate ? "#f8fafc" : "#ffffff",
      color: "#334155",
      borderBottom: isBottom ? "2px solid #cbd5e1" : "1px solid #e2e8f0",
    }),
    tdTotalCell: (isAlternate = false, isBottom = false) => ({
      padding: "12px 10px",
      textAlign: "center",
      fontWeight: "600",
      backgroundColor: isAlternate ? "#f1f5f9" : "#f8fafc",
      color: "#1e3a8a",
      borderLeft: "1px solid #e2e8f0",
      borderBottom: isBottom ? "2px solid #cbd5e1" : "1px solid #e2e8f0",
    }),
  };

  return (
    <div
      className="page"
      style={{
        padding: "32px",
        backgroundColor: "#f8fafc",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* BRANDED HEADER ROW BANNER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          marginBottom: "32px",
          padding: "24px 32px",
          background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
          borderRadius: "16px",
          boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          {schoolLogo ? (
            <img
              src={schoolLogo}
              alt="School Logo"
              style={{
                width: "150px", // Enlarged Dimension
                height: "150px", // Enlarged Dimension
                objectFit: "contain",
                backgroundColor: "transparent", // Removed white background frame
                boxShadow: "none", // Removed unnecessary shadow overlays
              }}
              onError={(e) => {
                e.target.src =
                  "https://images.unsplash.com/photo-1592280771190-3e2e4d571952?q=80&w=200";
              }}
            />
          ) : (
            <div
              style={{
                width: "96px", // Enlarged Dimension matching layout
                height: "96px", // Enlarged Dimension matching layout
                backgroundColor: "rgba(255, 255, 255, 0.15)",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#94a3b8",
                fontSize: "12px",
                fontWeight: "500",
              }}
            >
              No Logo
            </div>
          )}
          <div>
            <h1
              style={{
                fontSize: "2.25rem",
                fontWeight: "800",
                color: "#ffffff",
                margin: "0 0 4px 0",
                letterSpacing: "-0.5px",
              }}
            >
              {schoolName || "School Workspace"}
            </h1>
            <p
              style={{
                margin: 0,
                color: "#94a3b8",
                fontSize: "14px",
                fontWeight: "400",
              }}
            >
              Nutritional Status Summary Matrix — School Year{" "}
              <strong style={{ color: "#ffffff", fontWeight: "600" }}>
                {filterSY}
              </strong>{" "}
              ({filterPeriod})
            </p>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: "12px",
            backgroundColor: "rgba(255, 255, 255, 0.07)",
            padding: "8px",
            borderRadius: "12px",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <select
            className="form-select"
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            style={{
              border: "none",
              fontWeight: "600",
              color: "#ffffff",
              backgroundColor: "transparent",
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="Baseline" style={{ color: "#475569" }}>
              Baseline
            </option>
            <option value="Midline" style={{ color: "#475569" }}>
              Midline
            </option>
            <option value="Endline" style={{ color: "#475569" }}>
              Endline
            </option>
          </select>
          <select
            className="form-select"
            value={filterSY}
            onChange={(e) => setFilterSY(e.target.value)}
            style={{
              border: "none",
              fontWeight: "600",
              color: "#ffffff",
              backgroundColor: "transparent",
              outline: "none",
              cursor: "pointer",
            }}
          >
            {schoolYears.map((sy) => (
              <option key={sy} value={sy} style={{ color: "#475569" }}>
                {sy}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* METRIC CARD DASHBOARD GRID */}
      <div
        style={{
          display: "grid",
          // auto-fit automatically scales and rows all 12 cards cleanly without orphan elements
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "16px",
          marginBottom: "32px",
          width: "100%",
        }}
      >
        {[
          {
            label: "Total Students",
            val: totalEnrolment,
            border: "#cbd5e1",
            color: "#0f172a",
          },
          {
            label: "With Records",
            val: allLatestBMI.length,
            border: "#10b981",
            color: "#059669",
          },
          {
            label: "Normal BMI",
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
            val: hfaStatusCounts["Normal Height"],
            border: "#10b981",
            color: "#059669",
          },
          {
            label: "Stunted",
            val: hfaStatusCounts["Stunted"],
            border: "#f59e0b",
            color: "#d97706",
          },
          {
            label: "Severely Stunted",
            val: hfaStatusCounts["Severely Stunted"],
            border: "#ef4444",
            color: "#dc2626",
          },
          {
            label: "Tall",
            val: hfaStatusCounts["Tall"],
            border: "#3b82f6",
            color: "#2563eb",
          },
          {
            label: "No Data",
            val: statusCounts["No Data"],
            border: "#f43f5e",
            color: "#e11d48",
            click: true,
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
              cursor: s.click ? "pointer" : "default",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            onClick={() => {
              if (s.click)
                incompleteDataRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
            }}
            onMouseEnter={(e) => {
              if (s.click) e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              if (s.click) e.currentTarget.style.transform = "translateY(0)";
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

      {/* HORIZONTAL DISTRIBUTION PROGRESS PROFILES */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
          marginBottom: "32px",
        }}
      >
        <div
          style={{
            backgroundColor: "#fff",
            padding: "24px",
            borderRadius: "16px",
            boxShadow: "0 4px 10px rgba(0,0,0,0.03)",
          }}
        >
          <h3
            style={{
              fontSize: "16px",
              fontWeight: "700",
              color: "#0f172a",
              marginBottom: "20px",
            }}
          >
            Nutritional Status Distribution ({filterPeriod})
          </h3>
          {barItems.map((b) => {
            const pct = students.length
              ? (statusCounts[b.label] / students.length) * 100
              : 0;
            return (
              <div key={b.label} style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#475569",
                    marginBottom: "6px",
                  }}
                >
                  <span>{b.label}</span>
                  <span style={{ color: "#0f172a" }}>
                    {statusCounts[b.label]}{" "}
                    <span style={{ fontWeight: "400", color: "#94a3b8" }}>
                      ({pct.toFixed(1)}%)
                    </span>
                  </span>
                </div>
                <div
                  style={{
                    height: "8px",
                    backgroundColor: "#f1f5f9",
                    borderRadius: "99px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: b.color,
                      borderRadius: "99px",
                      transition: "width 0.6s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            backgroundColor: "#fff",
            padding: "24px",
            borderRadius: "16px",
            boxShadow: "0 4px 10px rgba(0,0,0,0.03)",
          }}
        >
          <h3
            style={{
              fontSize: "16px",
              fontWeight: "700",
              color: "#0f172a",
              marginBottom: "20px",
            }}
          >
            Height-for-Age Distribution ({filterPeriod})
          </h3>
          {hfaBarItems.map((b) => {
            const pct = students.length
              ? (hfaStatusCounts[b.label] / students.length) * 100
              : 0;
            return (
              <div key={b.label} style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#475569",
                    marginBottom: "6px",
                  }}
                >
                  <span>{b.label}</span>
                  <span style={{ color: "#0f172a" }}>
                    {hfaStatusCounts[b.label]}{" "}
                    <span style={{ fontWeight: "400", color: "#94a3b8" }}>
                      ({pct.toFixed(1)}%)
                    </span>
                  </span>
                </div>
                <div
                  style={{
                    height: "8px",
                    backgroundColor: "#f1f5f9",
                    borderRadius: "99px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: b.color,
                      borderRadius: "99px",
                      transition: "width 0.6s ease",
                    }}
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
        <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "28px" }}>
          Dynamic phase trajectory metrics mapped natively using continuous line
          profiles.
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
                bmi && getBMIStatus(bmi, s.sex, s.birthdate).label === "Wasted"
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
                bmi && getBMIStatus(bmi, s.sex, s.birthdate).label === "Obese"
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

            const p1 = { x: 35, y: 100 - (counts.NormalHeight / subMax) * 65 };
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

      {/* MATRIX TABLE CARD */}
      <div
        style={{
          backgroundColor: "#fff",
          padding: "24px",
          borderRadius: "16px",
          boxShadow: "0 4px 10px rgba(0,0,0,0.03)",
          marginBottom: "32px",
        }}
      >
        <h3
          style={{
            fontSize: "16px",
            fontWeight: "700",
            color: "#0f172a",
            marginBottom: "4px",
          }}
        >
          Nutritional Status Distribution by Grade Level
        </h3>
        <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "20px" }}>
          Comprehensive structural matrix broken down by demographic segments.
        </p>
        <div
          style={{
            overflowX: "auto",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
          }}
        >
          <table style={scopedStyles.table}>
            <thead>
              <tr>
                <th
                  style={{
                    ...scopedStyles.th,
                    textAlign: "left",
                    width: "120px",
                  }}
                >
                  Grade
                </th>
                <th
                  style={{
                    ...scopedStyles.th,
                    textAlign: "left",
                    width: "90px",
                  }}
                >
                  Sex
                </th>
                <th style={scopedStyles.th}>Normal</th>
                <th style={scopedStyles.th}>Wasted</th>
                <th style={scopedStyles.th}>Sev. Wasted</th>
                <th style={scopedStyles.th}>Overweight</th>
                <th style={scopedStyles.th}>Obese</th>
                <th style={scopedStyles.th}>Norm Ht</th>
                <th style={scopedStyles.th}>Stunted</th>
                <th style={scopedStyles.th}>Sev. Stunted</th>
                <th style={scopedStyles.th}>Tall</th>
                <th
                  style={{
                    ...scopedStyles.th,
                    backgroundColor: "#1e3a8a",
                    borderLeft: "1px solid #334155",
                  }}
                >
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {GRADE_LEVELS.map((grade) => (
                <React.Fragment key={grade}>
                  <tr>
                    <td rowSpan={2} style={scopedStyles.tdGrade}>
                      {grade}
                    </td>
                    <td
                      style={{
                        ...scopedStyles.tdCell(false),
                        textAlign: "left",
                        fontWeight: "600",
                        borderRight: "1px solid #e2e8f0",
                      }}
                    >
                      Male
                    </td>
                    <td style={scopedStyles.tdCell(false)}>
                      {gradeSummary[grade].Male.Normal}
                    </td>
                    <td style={scopedStyles.tdCell(false)}>
                      {gradeSummary[grade].Male.Wasted}
                    </td>
                    <td style={scopedStyles.tdCell(false)}>
                      {gradeSummary[grade].Male["Severely Wasted"]}
                    </td>
                    <td style={scopedStyles.tdCell(false)}>
                      {gradeSummary[grade].Male.Overweight}
                    </td>
                    <td style={scopedStyles.tdCell(false)}>
                      {gradeSummary[grade].Male.Obese}
                    </td>
                    <td style={scopedStyles.tdCell(false)}>
                      {gradeSummary[grade].Male["Normal Height"]}
                    </td>
                    <td style={scopedStyles.tdCell(false)}>
                      {gradeSummary[grade].Male.Stunted}
                    </td>
                    <td style={scopedStyles.tdCell(false)}>
                      {gradeSummary[grade].Male["Severely Stunted"]}
                    </td>
                    <td style={scopedStyles.tdCell(false)}>
                      {gradeSummary[grade].Male.Tall}
                    </td>
                    <td style={scopedStyles.tdTotalCell(false)}>
                      {gradeSummary[grade].Male.Total}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        ...scopedStyles.tdCell(true, true),
                        textAlign: "left",
                        fontWeight: "600",
                        borderRight: "1px solid #e2e8f0",
                      }}
                    >
                      Female
                    </td>
                    <td style={scopedStyles.tdCell(true, true)}>
                      {gradeSummary[grade].Female.Normal}
                    </td>
                    <td style={scopedStyles.tdCell(true, true)}>
                      {gradeSummary[grade].Female.Wasted}
                    </td>
                    <td style={scopedStyles.tdCell(true, true)}>
                      {gradeSummary[grade].Female["Severely Wasted"]}
                    </td>
                    <td style={scopedStyles.tdCell(true, true)}>
                      {gradeSummary[grade].Female.Overweight}
                    </td>
                    <td style={scopedStyles.tdCell(true, true)}>
                      {gradeSummary[grade].Female.Obese}
                    </td>
                    <td style={scopedStyles.tdCell(true, true)}>
                      {gradeSummary[grade].Female["Normal Height"]}
                    </td>
                    <td style={scopedStyles.tdCell(true, true)}>
                      {gradeSummary[grade].Female.Stunted}
                    </td>
                    <td style={scopedStyles.tdCell(true, true)}>
                      {gradeSummary[grade].Female["Severely Stunted"]}
                    </td>
                    <td style={scopedStyles.tdCell(true, true)}>
                      {gradeSummary[grade].Female.Tall}
                    </td>
                    <td style={scopedStyles.tdTotalCell(true, true)}>
                      {gradeSummary[grade].Female.Total}
                    </td>
                  </tr>
                </React.Fragment>
              ))}
              <tr style={{ borderTop: "2px solid #0f172a" }}>
                <td
                  rowSpan={3}
                  style={{
                    ...scopedStyles.tdGrade,
                    backgroundColor: "#f8fafc",
                    fontWeight: "700",
                  }}
                >
                  TOTALS
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false),
                    textAlign: "left",
                    fontWeight: "700",
                    backgroundColor: "#f8fafc",
                    borderRight: "1px solid #e2e8f0",
                  }}
                >
                  Total Male
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false),
                    fontWeight: "700",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  {grandTotals.Male.Normal}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false),
                    fontWeight: "700",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  {grandTotals.Male.Wasted}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false),
                    fontWeight: "700",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  {grandTotals.Male["Severely Wasted"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false),
                    fontWeight: "700",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  {grandTotals.Male.Overweight}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false),
                    fontWeight: "700",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  {grandTotals.Male.Obese}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false),
                    fontWeight: "700",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  {grandTotals.Male["Normal Height"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false),
                    fontWeight: "700",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  {grandTotals.Male.Stunted}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false),
                    fontWeight: "700",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  {grandTotals.Male["Severely Stunted"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false),
                    fontWeight: "700",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  {grandTotals.Male.Tall}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdTotalCell(false),
                    backgroundColor: "#e2e8f0",
                  }}
                >
                  {grandTotals.Male.Total}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    ...scopedStyles.tdCell(true),
                    textAlign: "left",
                    fontWeight: "700",
                    backgroundColor: "#f1f5f9",
                    borderRight: "1px solid #e2e8f0",
                  }}
                >
                  Total Female
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(true),
                    fontWeight: "700",
                    backgroundColor: "#f1f5f9",
                  }}
                >
                  {grandTotals.Female.Normal}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(true),
                    fontWeight: "700",
                    backgroundColor: "#f1f5f9",
                  }}
                >
                  {grandTotals.Female.Wasted}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(true),
                    fontWeight: "700",
                    backgroundColor: "#f1f5f9",
                  }}
                >
                  {grandTotals.Female["Severely Wasted"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(true),
                    fontWeight: "700",
                    backgroundColor: "#f1f5f9",
                  }}
                >
                  {grandTotals.Female.Overweight}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(true),
                    fontWeight: "700",
                    backgroundColor: "#f1f5f9",
                  }}
                >
                  {grandTotals.Female.Obese}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(true),
                    fontWeight: "700",
                    backgroundColor: "#f1f5f9",
                  }}
                >
                  {grandTotals.Female["Normal Height"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(true),
                    fontWeight: "700",
                    backgroundColor: "#f1f5f9",
                  }}
                >
                  {grandTotals.Female.Stunted}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(true),
                    fontWeight: "700",
                    backgroundColor: "#f1f5f9",
                  }}
                >
                  {grandTotals.Female["Severely Stunted"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(true),
                    fontWeight: "700",
                    backgroundColor: "#f1f5f9",
                  }}
                >
                  {grandTotals.Female.Tall}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdTotalCell(true),
                    backgroundColor: "#cbd5e1",
                  }}
                >
                  {grandTotals.Female.Total}
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td
                  style={{
                    ...scopedStyles.tdCell(false, true),
                    textAlign: "left",
                    fontWeight: "800",
                    backgroundColor: "#cbd5e1",
                    borderRight: "1px solid #cbd5e1",
                  }}
                >
                  Grand Total
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false, true),
                    fontWeight: "800",
                    backgroundColor: "#cbd5e1",
                  }}
                >
                  {grandTotals.Overall.Normal}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false, true),
                    fontWeight: "800",
                    backgroundColor: "#cbd5e1",
                  }}
                >
                  {grandTotals.Overall.Wasted}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false, true),
                    fontWeight: "800",
                    backgroundColor: "#cbd5e1",
                  }}
                >
                  {grandTotals.Overall["Severely Wasted"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false, true),
                    fontWeight: "800",
                    backgroundColor: "#cbd5e1",
                  }}
                >
                  {grandTotals.Overall.Overweight}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false, true),
                    fontWeight: "800",
                    backgroundColor: "#cbd5e1",
                  }}
                >
                  {grandTotals.Overall.Obese}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false, true),
                    fontWeight: "800",
                    backgroundColor: "#cbd5e1",
                  }}
                >
                  {grandTotals.Overall["Normal Height"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false, true),
                    fontWeight: "800",
                    backgroundColor: "#cbd5e1",
                  }}
                >
                  {grandTotals.Overall.Stunted}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false, true),
                    fontWeight: "800",
                    backgroundColor: "#cbd5e1",
                  }}
                >
                  {grandTotals.Overall["Severely Stunted"]}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdCell(false, true),
                    fontWeight: "800",
                    backgroundColor: "#cbd5e1",
                  }}
                >
                  {grandTotals.Overall.Tall}
                </td>
                <td
                  style={{
                    ...scopedStyles.tdTotalCell(false, true),
                    backgroundColor: "#1e3a8a",
                    color: "#fff",
                    fontSize: "14px",
                  }}
                >
                  {grandTotals.Overall.Total}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* INCOMPLETE DATA VIEW */}
      <div
        className="card"
        ref={incompleteDataRef}
        style={{
          backgroundColor: "#fff",
          padding: "24px",
          borderRadius: "16px",
          boxShadow: "0 4px 10px rgba(0,0,0,0.03)",
          width: "100%",
        }}
      >
        <h3
          style={{
            fontSize: "16px",
            fontWeight: "700",
            color: "#e11d48",
            marginBottom: "20px",
          }}
        >
          Learners with Incomplete Data ({incompleteLearners.length})
        </h3>
        <div style={{ overflowX: "auto", width: "100%" }}>
          <table
            className="data-table"
            style={{ width: "100%", minWidth: "700px", tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: "10%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "32%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>LRN</th>
                <th style={{ textAlign: "left" }}>Name</th>
                <th>Age</th>
                <th>Gender</th>
                <th>Grade Level - Section</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {incompleteLearners.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="empty-cell"
                    style={{
                      textAlign: "center",
                      padding: "24px",
                      color: "#64748b",
                    }}
                  >
                    All learners have complete data configurations.
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
                  if (!recs.length) missing.push(`Missing Q Record`);
                  else {
                    const last = recs[recs.length - 1];
                    if (!last.weight) missing.push("Weight");
                    if (!last.height) missing.push("Height");
                  }
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: "600" }}>{s.lrn}</td>
                      <td
                        style={{
                          textAlign: "left",
                          whiteSpace: "normal",
                          wordBreak: "break-word",
                        }}
                      >
                        <span
                          onDoubleClick={() =>
                            onOpenProfile?.(s.id, { autoOpenAddRecord: true })
                          }
                          title={
                            onOpenProfile
                              ? "Double-click to open profile and add measurements"
                              : undefined
                          }
                          style={{
                            cursor: onOpenProfile ? "pointer" : "default",
                            color: onOpenProfile ? "#1d4ed8" : "inherit",
                            textDecoration: onOpenProfile
                              ? "underline"
                              : "none",
                            fontWeight: 600,
                          }}
                        >
                          {s.name}
                        </span>
                      </td>
                      <td
                        style={{
                          textAlign: "center",
                          verticalAlign: "middle",
                        }}
                      >
                        {s.age}
                      </td>
                      <td>{s.sex}</td>
                      <td
                        style={{
                          whiteSpace: "normal",
                          wordBreak: "break-word",
                        }}
                      >
                        {s.section}
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            color: "#df2c4c",
                            fontWeight: "600",
                            backgroundColor: "#fff1f2",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                          }}
                        >
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
      </div>
    </div>
  );
}
