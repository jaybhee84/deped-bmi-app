import React, { useMemo, useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { loadSupabaseConfig } from "../utils/syncService";
import {
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  GRADE_LEVELS,
  SCHOOL_YEARS,
  QUARTERS,
} from "../utils/bmi";
import {
  loadSbfpConfig,
  isOfficialBeneficiary,
  DEFAULT_SBFP_CONFIG,
  loadSbfpEnrolment,
  saveSbfpEnrolment,
} from "../utils/sbfpConfig";
import Badge from "./Badge";
import "./SBFPBeneficiaries.css";
import "./SBFPBeneficiaries.print.css";

const REPORT_GRADE_ORDER = [
  "Kinder",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "SPED",
];

const BMI_LABELS = [
  "Severely Wasted",
  "Wasted",
  "Normal",
  "Overweight",
  "Obese",
];
const HFA_LABELS = ["Severely Stunted", "Stunted", "Normal", "Tall"];

const enrolmentInputStyle = {
  width: "90px",
  height: "36px",
  border: "1px solid #D1D5DB",
  borderRadius: "8px",
  padding: "0 10px",
  textAlign: "center",
  fontSize: "14px",
  fontWeight: 600,
  boxSizing: "border-box",
};

function emptyStats() {
  return {
    enrolment: 0,
    weighed: 0,
    takenHeight: 0,
    bmi: Object.fromEntries(BMI_LABELS.map((l) => [l, 0])),
    hfa: Object.fromEntries(HFA_LABELS.map((l) => [l, 0])),
  };
}

function addInto(target, src) {
  target.enrolment += src.enrolment;
  target.weighed += src.weighed;
  target.takenHeight += src.takenHeight;
  BMI_LABELS.forEach((l) => (target.bmi[l] += src.bmi[l]));
  HFA_LABELS.forEach((l) => (target.hfa[l] += src.hfa[l]));
}

function pct(n, d) {
  if (!d) return "0.00%";
  return ((n / d) * 100).toFixed(2) + "%";
}

function deriveGrade(s) {
  const g = s.section?.split(" - ")[0] || s.grade || "";
  return REPORT_GRADE_ORDER.includes(g) ? g : "SPED";
}

function buildNutritionReport(students, filterSY, filterPeriod) {
  const rows = REPORT_GRADE_ORDER.map((grade) => ({
    grade,
    M: emptyStats(),
    F: emptyStats(),
  }));
  const rowByGrade = Object.fromEntries(rows.map((r) => [r.grade, r]));

  students.forEach((s) => {
    const grade = deriveGrade(s);
    const row = rowByGrade[grade];
    if (!row) return;
    const sex = String(s.sex || "")
      .trim()
      .toUpperCase();

    const bucket = sex === "M" || sex === "MALE" ? row.M : row.F;

    bucket.enrolment++;

    const rec =
      s.records.find((r) => r.sy === filterSY && r.q === filterPeriod) || null;
    if (!rec) return;

    const hasWeight = rec.weight != null && rec.weight !== "";
    const hasHeight = rec.height != null && rec.height !== "";

    if (hasWeight && hasHeight) {
      bucket.weighed++;
      const bmi = calcBMI(rec.weight, rec.height);
      const baz = getBMIStatus(bmi, s.sex, s.birthdate);
      if (baz?.label && bucket.bmi[baz.label] !== undefined) {
        bucket.bmi[baz.label]++;
      }
    }

    if (hasHeight) {
      bucket.takenHeight++;
      const haz = getHAZStatus(rec.height, s.sex, s.birthdate);
      if (haz?.label && bucket.hfa[haz.label] !== undefined) {
        bucket.hfa[haz.label]++;
      }
    }
  });

  const withTotals = rows.map((r) => {
    const Total = emptyStats();
    addInto(Total, r.M);
    addInto(Total, r.F);
    return { ...r, Total };
  });

  const grand = { M: emptyStats(), F: emptyStats(), Total: emptyStats() };
  withTotals.forEach((r) => {
    addInto(grand.M, r.M);
    addInto(grand.F, r.F);
    addInto(grand.Total, r.Total);
  });

  return { rows: withTotals, grand };
}

// ── CUSTOM INLINE DIALOG COMPONENT ──────────────────────────────────────────
function CustomAlertDialog({ isOpen, title, message, type = "info", onClose }) {
  if (!isOpen) return null;

  const headerColors = {
    error: "bg-red-50 text-red-700 border-red-200",
    success: "bg-green-50 text-green-700 border-green-200",
    info: "bg-blue-50 text-blue-700 border-blue-200",
  };

  const buttonColors = {
    error: "bg-red-600 hover:bg-red-700 focus:ring-red-500",
    success: "bg-green-600 hover:bg-green-700 focus:ring-green-500",
    info: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500",
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          overflow: "hidden",
          backgroundColor: "#FFFFFF",
          borderRadius: "12px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: "1px solid #F1F5F9",
        }}
      >
        <div
          className={`px-6 py-4 border-b font-semibold flex items-center gap-2 ${headerColors[type]}`}
          style={{
            padding: "16px 24px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            borderBottom: "1px solid #E2E8F0",
          }}
        >
          {type === "error" && <span>⚠️</span>}
          {type === "success" && <span>✅</span>}
          {type === "info" && <span>ℹ️</span>}
          {title}
        </div>

        <div
          style={{
            padding: "20px 24px",
            color: "#475569",
            fontSize: "14px",
            lineHeight: "1.6",
            whiteSpace: "pre-wrap",
          }}
        >
          {message}
        </div>

        <div
          style={{
            padding: "12px 24px",
            backgroundColor: "#F8FAFC",
            display: "flex",
            justifyContent: "end",
            borderTop: "1px solid #F1F5F9",
          }}
        >
          <button
            onClick={onClose}
            className={buttonColors[type]}
            style={{
              padding: "8px 16px",
              color: "#FFFFFF",
              fontSize: "14px",
              fontWeight: 500,
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SBFPBeneficiaries({
  students,
  setStudents,
  schoolName = "",
  schoolId = "",
  currentUser,
}) {
  const [filterSY, setFilterSY] = useState("2026–2027");
  const [filterPeriod, setFilterPeriod] = useState("Baseline");
  const [filterGrade, setFilterGrade] = useState("All");
  const [searchQ, setSearchQ] = useState("");
  const [manualEnrolment, setManualEnrolment] = useState({});
  const [isDirty, setIsDirty] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // Dialog State
  const [dialogConfig, setDialogConfig] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
  });

  const triggerDialog = (title, message, type = "info") => {
    setDialogConfig({ isOpen: true, title, message, type });
  };

  const closeDialog = () => {
    setDialogConfig((prev) => ({ ...prev, isOpen: false }));
  };

  const csvFileInputRef = React.useRef(null);
  const saveTimeoutRef = React.useRef(null);

  const initialSchoolId = schoolId || currentUser?.school_id || "";
  const [resolvedSchool, setResolvedSchool] = useState({
    name: schoolName,
    id: initialSchoolId,
  });

  useEffect(() => {
    if (schoolName && schoolId) {
      setResolvedSchool({ name: schoolName, id: schoolId });
      return;
    }

    let cancelled = false;

    async function resolveSchool() {
      if (currentUser?.school_id) {
        try {
          const local = await window.sqlite?.loadSchool?.(currentUser?.id);
          if (local && !cancelled) {
            setResolvedSchool({
              name: local.school_name || "",
              id: currentUser.school_id,
            });
            return;
          }
        } catch (e) {
          console.error("[SBFP] Profile session validation error:", e);
        }
      }

      try {
        const local = await window.sqlite?.loadSchool?.(currentUser?.id);
        if (local && (local.school_name || local.school_id)) {
          if (!cancelled) {
            setResolvedSchool({
              name: local.school_name || "",
              id: local.school_id || "",
            });
          }
          if (local.school_name && local.school_id) return;
        }
      } catch (e) {
        console.error("[SBFP] Failed to load school from SQLite:", e);
      }

      if (!navigator.onLine) return;

      try {
        const config = loadSupabaseConfig();
        if (!config?.url || !config?.key) return;

        const supabaseInstance = createClient(config.url, config.key);
        const { data, error } = await supabaseInstance
          .from("schools")
          .select("school_name, school_id")
          .limit(1)
          .single();

        if (error) {
          console.error("[SBFP] Supabase school fetch failed:", error);
          return;
        }

        if (data && !cancelled) {
          setResolvedSchool((prev) => ({
            name: prev.name || data.school_name || "",
            id: prev.id || data.school_id || "",
          }));
        }
      } catch (e) {
        console.error("[SBFP] Supabase school fetch error:", e);
      }
    }

    resolveSchool();

    return () => {
      cancelled = true;
    };
  }, [schoolName, schoolId, currentUser]);

  useEffect(() => {
    if (!resolvedSchool.id) {
      setManualEnrolment({});
      setIsLocked(false);
      return;
    }

    let cancelled = false;

    async function fetchEnrolmentLifecycle() {
      try {
        const localData = await loadSbfpEnrolment(resolvedSchool.id, filterSY);

        if (localData && Object.keys(localData).length > 0) {
          if (!cancelled) {
            setManualEnrolment(localData);
            setIsDirty(false);
            setIsLocked(true);
            setSaveMessage("");
          }
          return;
        }

        if (!navigator.onLine) return;

        const config = loadSupabaseConfig();
        if (!config?.url || !config?.key) return;

        const textSchoolId = String(resolvedSchool.id).trim();

        const supabaseInstance = createClient(config.url, config.key);
        const { data, error } = await supabaseInstance
          .from("sbfp_enrolment")
          .select("data")
          .eq("school_id", textSchoolId)
          .eq("sy", filterSY)
          .maybeSingle();

        if (error) {
          console.error("[SBFP] Supabase online matching query failed:", error);
          return;
        }

        if (data && data.data && !cancelled) {
          setManualEnrolment(data.data);
          setIsDirty(false);
          setIsLocked(true);
          setSaveMessage("");
        } else {
          if (!cancelled) {
            setManualEnrolment({});
            setIsLocked(false);
          }
        }
      } catch (err) {
        console.error("[SBFP] Enrolment sync resolution crash context:", err);
      }
    }

    fetchEnrolmentLifecycle();

    return () => {
      cancelled = true;
    };
  }, [resolvedSchool.id, filterSY]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  function handleEnrolmentChange(key, value) {
    setManualEnrolment((prev) => ({
      ...prev,
      [key]: value,
    }));

    setIsDirty(true);
    setSaveMessage("");
  }

  async function handleSaveEnrolment() {
    if (!resolvedSchool.id) {
      triggerDialog(
        "Missing Profile Scope",
        "No school identification configuration details are initialized yet. Please access your local Settings view context to assert primary institution parameters first.",
        "error",
      );
      return;
    }

    const total = Object.values(manualEnrolment).reduce(
      (sum, val) => sum + (Number(val) || 0),
      0,
    );

    const ok = await saveSbfpEnrolment(
      resolvedSchool.id,
      filterSY,
      manualEnrolment,
      total,
    );

    if (ok) {
      setIsDirty(false);
      setIsLocked(true);
      setSaveMessage("✅ Enrolment saved successfully.");

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        setSaveMessage("");
      }, 3000);
    } else {
      triggerDialog(
        "Database Write Error",
        "The application failed to update your enrollment numbers. This might be due to a strict security profile rule restriction mismatch context. Please review the operational permissions map with the SDO.",
        "error",
      );
    }
  }

  const [config, setConfig] = useState(DEFAULT_SBFP_CONFIG);

  useEffect(() => {
    loadSbfpConfig().then(setConfig);
  }, []);

  const isConfigured = config.grades?.length > 0 || config.criteria?.length > 0;

  const beneficiaries = useMemo(() => {
    return students
      .map((s) => {
        const rec =
          s.records?.find((r) => r.sy === filterSY && r.q === filterPeriod) ||
          null;

        const bmi = rec ? calcBMI(rec.weight, rec.height) : null;
        const baz = bmi ? getBMIStatus(bmi, s.sex, s.birthdate) : null;
        const haz = rec ? getHAZStatus(rec.height, s.sex, s.birthdate) : null;
        const grade = s.section?.split(" - ")[0] || s.grade || "";

        let isBen = false;
        if (rec) {
          const gradeInclusion = config.grades?.includes(grade);

          const hasBmiMatch = config.criteria?.includes(baz?.label);
          const bmiRestrictionActive =
            config.criterionGradeRestrictions?.[baz?.label] !== undefined;
          const passesBmiRestriction = bmiRestrictionActive
            ? config.criterionGradeRestrictions[baz.label].includes(grade)
            : true;
          const bazInclusion = hasBmiMatch && passesBmiRestriction;

          const hasHazMatch = config.criteria?.includes(haz?.label);
          const hazRestrictionActive =
            config.criterionGradeRestrictions?.[haz?.label] !== undefined;
          const passesHazRestriction = hazRestrictionActive
            ? config.criterionGradeRestrictions[haz.label].includes(grade)
            : true;
          const hazInclusion = hasHazMatch && passesHazRestriction;

          isBen = gradeInclusion || bazInclusion || hazInclusion;
        } else {
          isBen = true;
        }

        return { ...s, bmi, baz, haz, grade, rec, isBen };
      })
      .filter((s) => s.isBen);
  }, [students, filterSY, filterPeriod, config]);

  const filtered = useMemo(() => {
    return beneficiaries.filter((s) => {
      const matchGrade = filterGrade === "All" || s.grade === filterGrade;
      const matchSearch =
        searchQ === "" ||
        (s.name || "").toLowerCase().includes(searchQ.toLowerCase()) ||
        (s.lrn || "").includes(searchQ);
      return matchGrade && matchSearch;
    });
  }, [beneficiaries, filterGrade, searchQ]);

  const counts = useMemo(() => {
    const c = {
      Male: 0,
      Female: 0,
      "Severely Wasted": 0,
      Wasted: 0,
      Overweight: 0,
      Obese: 0,
      Normal: 0,
      Stunted: 0,
      "Severely Stunted": 0,
    };
    filtered.forEach((s) => {
      const sex = String(s.sex || "")
        .trim()
        .toUpperCase();

      if (sex === "M" || sex === "MALE") {
        c.Male++;
      } else if (sex === "F" || sex === "FEMALE") {
        c.Female++;
      }

      if (s.baz?.label) {
        c[s.baz.label] = (c[s.baz.label] || 0) + 1;
      }

      if (s.haz?.label && s.haz.label !== "Normal" && s.haz.label !== "Tall") {
        c[s.haz.label] = (c[s.haz.label] || 0) + 1;
      }
    });
    return c;
  }, [filtered]);

  const gradeOrder = {
    Kinder: 0,
    "Grade 1": 1,
    "Grade 2": 2,
    "Grade 3": 3,
    "Grade 4": 4,
    "Grade 5": 5,
    "Grade 6": 6,
  };
  const sortedRows = [...filtered].sort((a, b) => {
    const gd = (gradeOrder[a.grade] ?? 99) - (gradeOrder[b.grade] ?? 99);
    if (gd !== 0) return gd;
    const sd = (a.section || "").localeCompare(b.section || "");
    if (sd !== 0) return sd;
    const sexOrder = { M: 0, F: 1 };
    const xd = (sexOrder[a.sex] ?? 2) - (sexOrder[b.sex] ?? 2);
    if (xd !== 0) return xd;
    return a.name.localeCompare(b.name);
  });

  const nutritionReport = useMemo(() => {
    const report = buildNutritionReport(students, filterSY, filterPeriod);

    report.rows.forEach((r) => {
      const male = Number(manualEnrolment[`${r.grade}_M`] || 0);
      const female = Number(manualEnrolment[`${r.grade}_F`] || 0);

      r.M = { ...r.M, enrolment: male };
      r.F = { ...r.F, enrolment: female };
      r.Total = { ...r.Total, enrolment: male + female };
    });

    const grandMale = report.rows.reduce((sum, r) => sum + r.M.enrolment, 0);
    const grandFemale = report.rows.reduce((sum, r) => sum + r.F.enrolment, 0);

    report.grand = {
      ...report.grand,
      M: { ...report.grand.M, enrolment: grandMale },
      F: { ...report.grand.F, enrolment: grandFemale },
      Total: { ...report.grand.Total, enrolment: grandMale + grandFemale },
    };

    return report;
  }, [students, filterSY, filterPeriod, manualEnrolment]);

  async function handlePrint() {
    document.title = `SBFP Beneficiaries - ${filterSY} - ${filterPeriod}`;

    if (window.electronAPI?.generatePrintPreview) {
      window.electronAPI.generatePrintPreview({
        reportType: "landscape",
        meta: {
          schoolName: resolvedSchool.name,
          schoolId: resolvedSchool.id,
          sy: filterSY,
          period: filterPeriod,
          date: new Date().toLocaleDateString("en-PH", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
        },
        rows: nutritionReport.rows,
        grand: nutritionReport.grand,
      });

      return;
    }
    window.print();
  }

  function handleExportCsv() {
    if (!filtered.length) {
      triggerDialog(
        "Export Notice",
        "There are no beneficiaries currently matching your target metrics to isolate and compile into a CSV file summary structure.",
        "info",
      );
      return;
    }

    const headers = [
      "Registry No.",
      "LRN",
      "Name",
      "Birthdate",
      "Sex",
      "Age",
      "Grade",
      "Section",
      "Weight",
      "Height",
    ];

    const csvEscape = (val) => {
      const str = String(val ?? "");
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const rows = sortedRows.map((s) => [
      s.registryNo || "",
      s.lrn && s.lrn !== "—" ? s.lrn : "",
      s.name || "",
      s.birthdate || "",
      s.sex || "",
      "",
      "",
      "",
      "",
      "",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SBFP_Beneficiaries_${filterSY}_${filterPeriod}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleImportCsv(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.trim().split("\n").filter(Boolean);

      if (!lines.length) {
        triggerDialog(
          "Parsing Failed",
          "The target CSV file you selected is completely blank. Please load a structured data payload containing record rows.",
          "error",
        );
        return;
      }

      const headers = lines[0]
        .split(",")
        .map((h) => h.trim().toLowerCase().replace(/"/g, ""));

      const hasRegistry =
        headers.includes("registry no.") || headers.includes("registry_no");
      const hasLRN = headers.includes("lrn");
      const hasName = headers.includes("name");
      const hasWeight = headers.includes("weight");
      const hasHeight = headers.includes("height");

      if (!hasRegistry && !hasLRN && !hasName) {
        triggerDialog(
          "Invalid Column Format",
          "CSV must contain at least a Registry No., LRN, or Name reference coordinate. Execute an Export structural query to match standard data layouts.",
          "error",
        );
        return;
      }
      if (!hasWeight || !hasHeight) {
        triggerDialog(
          "Missing Parameters",
          "The matching engine requires standard numeric weight and height identifier properties to execute synchronization operations.",
          "error",
        );
        return;
      }

      const registryIdx = headers.includes("registry no.")
        ? headers.indexOf("registry no.")
        : headers.indexOf("registry_no");
      const idx = (h) => headers.indexOf(h);
      const errs = [];
      const matches = [];

      lines.slice(1).forEach((line, i) => {
        const cols = line.split(",").map((c) => c.trim().replace(/"/g, ""));
        const registryNo = hasRegistry ? cols[registryIdx]?.trim() : "";
        const lrn = hasLRN ? cols[idx("lrn")]?.trim() : "";
        const name = hasName ? cols[idx("name")]?.trim() : "";
        const weight = parseFloat(cols[idx("weight")]);
        const height = parseFloat(cols[idx("height")]);
        const label = registryNo || lrn || name;

        if (!registryNo && !lrn && !name) {
          errs.push(
            `Row ${i + 2}: structural index missing reference mapping metadata.`,
          );
          return;
        }
        if (isNaN(weight) || weight <= 0) {
          errs.push(
            `Row ${i + 2}: specified tracking weight is incorrect for ${label}.`,
          );
          return;
        }
        if (isNaN(height) || height <= 0) {
          errs.push(
            `Row ${i + 2}: structural stature tracking height is invalid for ${label}.`,
          );
          return;
        }

        let match = null;
        if (registryNo) {
          match = students.find((s) => s.registryNo === registryNo);
        }
        if (!match && lrn && lrn !== "—") {
          match = students.find((s) => s.lrn === lrn);
        }
        if (!match && name) {
          const nameLower = name.toLowerCase();
          match = students.find((s) => s.name?.toLowerCase() === nameLower);
        }

        if (!match) {
          errs.push(
            `Row ${i + 2}: no active local student profile mapped to target sequence identifier "${label}".`,
          );
          return;
        }

        matches.push({ studentId: match.id, weight, height });
      });

      if (!matches.length) {
        triggerDialog(
          "Import Matching Failure",
          "Could not synchronize row indices.\n\n" +
            errs.slice(0, 5).join("\n"),
          "error",
        );
        return;
      }

      const today = new Date().toISOString().slice(0, 10);

      setStudents((prev) =>
        prev.map((s) => {
          const row = matches.find((m) => m.studentId === s.id);
          if (!row) return s;
          const cleaned = s.records.filter(
            (r) => !(r.sy === filterSY && r.q === filterPeriod),
          );
          return {
            ...s,
            records: [
              ...cleaned,
              {
                sy: filterSY,
                q: filterPeriod,
                date: today,
                weight: row.weight,
                height: row.height,
              },
            ],
          };
        }),
      );

      const summary = `Imported ${matches.length} record${
        matches.length !== 1 ? "s" : ""
      } for ${filterPeriod} ${filterSY}.${
        errs.length
          ? `\n\n${errs.length} record conflict deviations omitted:\n` +
            errs.slice(0, 5).join("\n")
          : ""
      }`;
      triggerDialog(
        "Import Finished",
        summary,
        errs.length ? "info" : "success",
      );
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handlePrintBeneficiaries() {
    if (!sortedRows.length) {
      triggerDialog(
        "Print Operation Deferred",
        "No structural rows isolated to send to printer spool arrays under current filter scopes.",
        "info",
      );
      return;
    }

    const payload = {
      reportType: "portrait",
      title: "School-Based Feeding Program (SBFP) Nutritional Report",
      meta: {
        schoolName: resolvedSchool.name,
        schoolId: resolvedSchool.id,
        sy: filterSY,
        period: filterPeriod,
        date: new Date().toLocaleDateString("en-PH"),
      },
      learners: sortedRows.map((s) => ({
        lrn: s.lrn || "—",
        name: s.name,
        sex: s.sex,
        age: s.age ?? "N/A",
        weight: s.rec?.weight ?? "—",
        height: s.rec?.height ?? "—",
        bmi: s.bmi ? parseFloat(s.bmi).toFixed(2) : "—",
        wfa: s.baz?.label || "—",
        hfa: s.haz?.label || "—",
        section: s.section || "Unassigned",
      })),
    };

    if (window.electronAPI?.generatePrintPreview) {
      window.electronAPI.generatePrintPreview(payload);
    } else {
      triggerDialog(
        "Hardware Context Missing",
        "Electron native bridge API layer was not identified in the active platform wrapper context.",
        "error",
      );
    }
  }

  function StatCell({ n, d }) {
    return (
      <>
        <td className="num">{n}</td>
        <td className="num pct">{pct(n, d)}</td>
      </>
    );
  }

  function StatCells({ stats }) {
    return (
      <>
        <td className="num">{stats.enrolment}</td>
        <StatCell n={stats.weighed} d={stats.enrolment} />
        {BMI_LABELS.map((l) => (
          <StatCell key={l} n={stats.bmi[l]} d={stats.weighed} />
        ))}
        {HFA_LABELS.map((l) => (
          <StatCell key={l} n={stats.hfa[l]} d={stats.takenHeight} />
        ))}
        <StatCell n={stats.takenHeight} d={stats.enrolment} />
      </>
    );
  }

  function abbrevGrade(g) {
    if (g === "Kinder") return "K";
    const m = g.match(/Grade (\d+)/);
    return m ? `G${m[1]}` : g;
  }

  return (
    <div className="page">
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">SBFP Beneficiaries</h1>
          <p className="page-sub">
            Official learners included in the School-Based Feeding Program
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button className="btn btn-primary no-print" onClick={handlePrint}>
            🖨 Print Summary
          </button>
        </div>
      </div>

      {!isConfigured && (
        <div className="sbfp-no-config">
          <div className="sbfp-no-config-icon">⚠️</div>
          <div>
            <div className="sbfp-no-config-title">
              No official criteria set yet
            </div>
            <div className="sbfp-no-config-sub">
              The SDO has not configured the official SBFP beneficiary criteria.
              Once the SDO sets the criteria (via SDO Settings), beneficiaries
              will appear here automatically.
            </div>
          </div>
        </div>
      )}

      {isConfigured && (
        <div className="sbfp-config-summary no-print">
          <span className="sbfp-config-label">
            Official criteria set by SDO:
          </span>
          {config.grades?.map((g) => (
            <span key={g} className="sbfp-config-tag grade">
              {g}
            </span>
          ))}
          {config.criteria?.map((c) => (
            <span key={c} className="sbfp-config-tag criteria">
              {c}
            </span>
          ))}
          {config.setBy && (
            <span className="sbfp-config-meta">
              Set by {config.setBy} ·{" "}
              {new Date(config.setAt).toLocaleDateString("en-PH", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>
      )}

      <div
        className="sbfp-enrolment-row no-print"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "10px",
          margin: "8px 0 16px",
          padding: "10px 12px",
          background: "#F9FAFB",
          border: "1px solid #E5E7EB",
          borderRadius: "8px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          <span
            className="sbfp-config-label"
            style={{ fontWeight: 600, marginRight: "4px" }}
          >
            Enrolment (official, per grade):
          </span>
          {isLocked && (
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#6B7280",
                background: "#E5E7EB",
                padding: "2px 8px",
                borderRadius: "12px",
              }}
            >
              🔒 Inputs Locked
            </span>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
            width: "100%",
            marginTop: "12px",
          }}
        >
          {[
            "Kinder",
            "Grade 1",
            "Grade 2",
            "Grade 3",
            "Grade 4",
            "Grade 5",
            "Grade 6",
            "SPED",
          ].map((g) => (
            <div
              key={g}
              style={{
                background: "#FFFFFF",
                border: "1px solid #E5E7EB",
                borderRadius: "12px",
                padding: "12px",
                boxShadow: "0 1px 4px rgba(0,0,0,.06)",
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "14px",
                  color: "#1E3A5F",
                  borderBottom: "1px solid #E5E7EB",
                  paddingBottom: "8px",
                  marginBottom: "10px",
                }}
              >
                {g}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontWeight: 500,
                  }}
                >
                  <span style={{ color: "#3B82F6", fontSize: "16px" }}>🚹</span>
                  Male
                </span>
                <input
                  type="number"
                  min="0"
                  disabled={isLocked}
                  value={manualEnrolment[`${g}_M`] ?? ""}
                  onChange={(e) =>
                    handleEnrolmentChange(`${g}_M`, e.target.value)
                  }
                  style={{
                    ...enrolmentInputStyle,
                    background: isLocked ? "#F3F4F6" : "#FFFFFF",
                    cursor: isLocked ? "not-allowed" : "text",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontWeight: 500,
                  }}
                >
                  <span style={{ color: "#EC4899", fontSize: "16px" }}>🚺</span>
                  Female
                </span>
                <input
                  type="number"
                  min="0"
                  disabled={isLocked}
                  value={manualEnrolment[`${g}_F`] ?? ""}
                  onChange={(e) =>
                    handleEnrolmentChange(`${g}_F`, e.target.value)
                  }
                  style={{
                    ...enrolmentInputStyle,
                    background: isLocked ? "#F3F4F6" : "#FFFFFF",
                    cursor: isLocked ? "not-allowed" : "text",
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginTop: "16px",
            width: "100%",
          }}
        >
          <button
            type="button"
            disabled={!isDirty || isLocked}
            onClick={handleSaveEnrolment}
            style={{
              padding: "10px 24px",
              background: isDirty && !isLocked ? "#16A34A" : "#9CA3AF",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontWeight: 600,
              cursor: isDirty && !isLocked ? "pointer" : "not-allowed",
              opacity: isDirty && !isLocked ? 1 : 0.8,
              transition: "all .2s ease",
            }}
          >
            {isDirty ? "💾 Save Enrolment" : "✓ Enrolment Saved"}
          </button>

          {isLocked && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsLocked(false)}
            >
              ✏️ Edit Enrolment
            </button>
          )}

          {saveMessage && (
            <span
              style={{ color: "#15803d", fontWeight: 600, marginLeft: "10px" }}
            >
              {saveMessage}
            </span>
          )}
        </div>
      </div>

      <div
        className="filter-row no-print"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "10px",
            padding: "8px 10px",
            background: "#F9FAFB",
            border: "1px solid #E5E7EB",
            borderRadius: "10px",
            flexWrap: "wrap",
          }}
        >
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ marginBottom: "2px" }}>
              School Year
            </label>
            <select
              className="form-select"
              style={{ minWidth: "120px" }}
              value={filterSY}
              onChange={(e) => setFilterSY(e.target.value)}
            >
              {SCHOOL_YEARS.map((sy) => (
                <option key={sy}>{sy}</option>
              ))}
            </select>
          </div>

          <div
            style={{
              width: "1px",
              alignSelf: "stretch",
              background: "#E5E7EB",
            }}
          />

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ marginBottom: "2px" }}>
              Period
            </label>
            <select
              className="form-select"
              style={{ minWidth: "110px" }}
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value)}
            >
              {QUARTERS.map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </div>

          <div
            style={{
              width: "1px",
              alignSelf: "stretch",
              background: "#E5E7EB",
            }}
          />

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ marginBottom: "2px" }}>
              Grade Level
            </label>
            <select
              className="form-select"
              style={{ minWidth: "120px" }}
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
            >
              <option value="All">All Grades</option>
              {GRADE_LEVELS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              width: "1px",
              alignSelf: "stretch",
              background: "#E5E7EB",
            }}
          />

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button className="btn btn-secondary" onClick={handleExportCsv}>
              ⬇ Export CSV
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => csvFileInputRef.current?.click()}
            >
              ⬆ Import CSV
            </button>
            <input
              ref={csvFileInputRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={handleImportCsv}
            />
          </div>
        </div>

        <button className="btn btn-primary" onClick={handlePrintBeneficiaries}>
          🖨 Print Beneficiaries
        </button>
      </div>

      {isConfigured && (
        <div className="sbfp-summary-row no-print">
          {[
            {
              label: "Total Beneficiaries",
              val: filtered.length,
              bg: "#EFF6FF",
              color: "#1E3A5F",
            },
            {
              label: "Male",
              val: counts.Male,
              bg: "#EAF3DE",
              color: "#3B6D11",
            },
            {
              label: "Female",
              val: counts.Female,
              bg: "#FDF2F8",
              color: "#9D174D",
            },
            {
              label: "Wasted",
              val: counts["Wasted"],
              bg: "#FAEEDA",
              color: "#BA7517",
            },
            {
              label: "Severely Wasted",
              val: counts["Severely Wasted"],
              bg: "#FCEBEB",
              color: "#A32D2D",
            },
            {
              label: "Overweight",
              val: counts["Overweight"],
              bg: "#FAEEDA",
              color: "#BA7517",
            },
            {
              label: "Stunted",
              val: counts["Stunted"],
              bg: "#FAEEDA",
              color: "#BA7517",
            },
            {
              label: "Severely Stunted",
              val: counts["Severely Stunted"],
              bg: "#FCEBEB",
              color: "#A32D2D",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="sbfp-summary-pill"
              style={{ background: s.bg }}
            >
              <div className="sbfp-summary-num" style={{ color: s.color }}>
                {s.val}
              </div>
              <div className="sbfp-summary-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card screen-only">
        {!isConfigured ? (
          <div
            className="empty-cell"
            style={{ padding: "3rem", textAlign: "center", color: "#9CA3AF" }}
          >
            Waiting for SDO to configure official beneficiary criteria.
          </div>
        ) : sortedRows.length === 0 ? (
          <div
            className="empty-cell"
            style={{ padding: "3rem", textAlign: "center", color: "#9CA3AF" }}
          >
            No beneficiaries found for the selected filters.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>LRN</th>
                <th>Name</th>
                <th>Age</th>
                <th>Sex</th>
                <th>Grade</th>
                <th>Section</th>
                <th>Weight (kg)</th>
                <th>Height (cm)</th>
                <th>BMI</th>
                <th>Nutritional Status</th>
                <th>Height Status</th>
                <th>Reason for Inclusion</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((s, idx) => {
                const gradeInclusion = config.grades?.includes(s.grade);

                const bazInclusion =
                  config.criteria?.includes(s.baz?.label) &&
                  (config.criterionGradeRestrictions?.[s.baz?.label] ===
                    undefined ||
                    config.criterionGradeRestrictions[s.baz.label].includes(
                      s.grade,
                    ));

                const hazInclusion =
                  config.criteria?.includes(s.haz?.label) &&
                  (config.criterionGradeRestrictions?.[s.haz?.label] ===
                    undefined ||
                    config.criterionGradeRestrictions[s.haz.label].includes(
                      s.grade,
                    ));

                const reasons = [];
                if (gradeInclusion) reasons.push(`Grade (${s.grade})`);
                if (bazInclusion && s.baz?.label) reasons.push(s.baz.label);
                if (hazInclusion && s.haz?.label) reasons.push(s.haz.label);

                return (
                  <tr key={s.id}>
                    <td>{idx + 1}</td>
                    <td>{s.lrn}</td>
                    <td className="name-cell">{s.name}</td>
                    <td>{s.age}</td>
                    <td>{s.sex}</td>
                    <td>{s.grade}</td>
                    <td>{s.section}</td>
                    <td>{s.rec ? s.rec.weight : "—"}</td>
                    <td>{s.rec ? s.rec.height : "—"}</td>
                    <td>{s.bmi ? s.bmi.toFixed(2) : "—"}</td>
                    <td>
                      {s.baz ? (
                        <Badge
                          label={s.baz.label}
                          color={s.baz.color}
                          bg={s.baz.bg}
                        />
                      ) : (
                        <span className="no-data-tag">No data</span>
                      )}
                    </td>
                    <td>
                      {s.haz ? (
                        <Badge
                          label={s.haz.label}
                          color={s.haz.color}
                          bg={s.haz.bg}
                        />
                      ) : (
                        <span className="no-data-tag">No data</span>
                      )}
                    </td>
                    <td>
                      <div className="reason-tags">
                        {reasons.map((r) => (
                          <span key={r} className="reason-tag">
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="deped-report print-only">
        <div className="deped-report-header">
          <div className="deped-report-title">
            <p>Department of Education</p>
            <p>Bureau of Learner Support Services</p>
            <p>School Health Division</p>
            <h2>
              NUTRITIONAL STATUS REPORT OF{" "}
              {(
                resolvedSchool.name || "___________________________"
              ).toUpperCase()}
            </h2>
            <p className="deped-report-period">
              {filterPeriod.toUpperCase()} SY {filterSY}
            </p>
          </div>
        </div>

        <table className="deped-table">
          <thead>
            <tr>
              <th rowSpan={3}>Grade Levels</th>
              <th rowSpan={3}>Sex</th>
              <th rowSpan={3}>Enrolment</th>
              <th colSpan={2} rowSpan={2}>
                Pupils Weighed
              </th>
              <th colSpan={10}>Body Mass Index (BMI)</th>
              <th colSpan={8}>Height-for-Age (HFA)</th>
              <th colSpan={2} rowSpan={2}>
                Pupils Taken Height
              </th>
            </tr>
            <tr>
              <th colSpan={2}>Severely Wasted</th>
              <th colSpan={2}>Wasted</th>
              <th colSpan={2}>Normal</th>
              <th colSpan={2}>Overweight</th>
              <th colSpan={2}>Obese</th>
              <th colSpan={2}>Severely Stunted</th>
              <th colSpan={2}>Stunted</th>
              <th colSpan={2}>Normal</th>
              <th colSpan={2}>Tall</th>
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
            {nutritionReport.rows.map((r) => (
              <React.Fragment key={r.grade}>
                <tr>
                  <td className="row-label" rowSpan={3}>
                    {abbrevGrade(r.grade)}
                  </td>
                  <td className="row-label">M</td>
                  <StatCells stats={r.M} />
                </tr>
                <tr>
                  <td className="row-label">F</td>
                  <StatCells stats={r.F} />
                </tr>
                <tr className="row-total">
                  <td className="row-label">Total</td>
                  <StatCells stats={r.Total} />
                </tr>
              </React.Fragment>
            ))}
            <tr className="row-total">
              <td className="row-label grand-total-cell" rowSpan={3}>
                GRAND TOTAL
              </td>
              <td className="row-label">M</td>
              <StatCells stats={nutritionReport.grand.M} />
            </tr>
            <tr className="row-total">
              <td className="row-label">F</td>
              <StatCells stats={nutritionReport.grand.F} />
            </tr>
            <tr className="row-total">
              <td className="row-label">Total</td>
              <StatCells stats={nutritionReport.grand.Total} />
            </tr>
          </tbody>
        </table>

        <p className="deped-report-footer">
          Date Printed:{" "}
          {new Date().toLocaleDateString("en-PH", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* --- RENDER CUSTOM CONTEXT DIALOG --- */}
      <CustomAlertDialog
        isOpen={dialogConfig.isOpen}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
        onClose={closeDialog}
      />
    </div>
  );
}
