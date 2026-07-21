import React, { useState, useMemo, useEffect, useRef } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  SCHOOL_YEARS,
  QUARTERS,
} from "../utils/bmi";
import Badge from "./Badge";
import "./SDOReports.css";
import { SCHOOL_OPTIONS } from "../utils/schools.js";
import { loadSbfpEnrolment } from "../utils/sbfpConfig";

// Normalize strings (replaces en-dashes/em-dashes, trims, converts to lowercase)
const normalizeStr = (str) =>
  (str || "").toLowerCase().replace(/[–—]/g, "-").trim();

// Loose School Year matching (handles dash variations and digit comparison)
function isMatchSY(recSY, targetSY) {
  if (!recSY || !targetSY) return false;
  const s1 = normalizeStr(recSY).replace(/[^0-9]/g, "");
  const s2 = normalizeStr(targetSY).replace(/[^0-9]/g, "");
  return s1 === s2 || normalizeStr(recSY) === normalizeStr(targetSY);
}

// Loose Period / Quarter matching
function isMatchPeriod(recQ, targetPeriod) {
  if (!recQ || !targetPeriod) return false;
  const q = normalizeStr(recQ);
  const t = normalizeStr(targetPeriod);
  if (q === t) return true;
  if (
    t === "baseline" &&
    (q === "q1" ||
      q === "1st" ||
      q === "1st quarter" ||
      q === "b" ||
      q === "quarter 1")
  )
    return true;
  if (
    t === "q1" &&
    (q === "baseline" || q === "1st" || q === "1st quarter" || q === "b")
  )
    return true;
  if (t === "q2" && (q === "2nd" || q === "2nd quarter" || q === "midline"))
    return true;
  if (t === "q3" && (q === "3rd" || q === "3rd quarter")) return true;
  if (t === "q4" && (q === "4th" || q === "4th quarter" || q === "endline"))
    return true;
  if (t === "endline" && (q === "q4" || q === "4th" || q === "4th quarter"))
    return true;
  return false;
}

// Parses standardized Grade Level from student objects (handles Roman numerals, prefixes, sections)
function getStudentGrade(s) {
  if (!s) return "";
  const raw = String(
    typeof s === "string"
      ? s
      : s.grade || s.grade_level || s.gradeLevel || s.section || "",
  ).trim();
  const upper = raw.toUpperCase();

  if (
    upper.includes("KINDER") ||
    upper.includes("KINDERGARTEN") ||
    upper.startsWith("K-") ||
    upper === "K"
  ) {
    return "Kinder";
  }
  if (
    upper.includes("SPED") ||
    upper.includes("SPECIAL EDUCATION") ||
    upper.includes("SPECIAL ED")
  ) {
    return "SPED";
  }

  // Grade 4 / Grade IV
  if (
    upper.includes("GRADE 4") ||
    upper.includes("GRADE-4") ||
    upper.includes("GRADE4") ||
    upper.includes("GRADE IV") ||
    upper.includes("GRADE-IV") ||
    upper.includes("G4") ||
    upper.includes("G-4") ||
    upper.startsWith("4 -") ||
    upper.startsWith("4-") ||
    upper.startsWith("4 ") ||
    upper === "4" ||
    upper === "IV"
  ) {
    return "Grade 4";
  }

  // Grade 6 / Grade VI
  if (
    upper.includes("GRADE 6") ||
    upper.includes("GRADE-6") ||
    upper.includes("GRADE6") ||
    upper.includes("GRADE VI") ||
    upper.includes("GRADE-VI") ||
    upper.includes("G6") ||
    upper.includes("G-6") ||
    upper.startsWith("6 -") ||
    upper.startsWith("6-") ||
    upper.startsWith("6 ") ||
    upper === "6" ||
    upper === "VI"
  ) {
    return "Grade 6";
  }

  // Grade 5 / Grade V
  if (
    upper.includes("GRADE 5") ||
    upper.includes("GRADE-5") ||
    upper.includes("GRADE5") ||
    upper.includes("GRADE V") ||
    upper.includes("GRADE-V") ||
    upper.includes("G5") ||
    upper.includes("G-5") ||
    upper.startsWith("5 -") ||
    upper.startsWith("5-") ||
    upper.startsWith("5 ") ||
    upper === "5" ||
    upper === "V"
  ) {
    return "Grade 5";
  }

  // Grade 3 / Grade III
  if (
    upper.includes("GRADE 3") ||
    upper.includes("GRADE-3") ||
    upper.includes("GRADE3") ||
    upper.includes("GRADE III") ||
    upper.includes("GRADE-III") ||
    upper.includes("G3") ||
    upper.includes("G-3") ||
    upper.startsWith("3 -") ||
    upper.startsWith("3-") ||
    upper.startsWith("3 ") ||
    upper === "3" ||
    upper === "III"
  ) {
    return "Grade 3";
  }

  // Grade 2 / Grade II
  if (
    upper.includes("GRADE 2") ||
    upper.includes("GRADE-2") ||
    upper.includes("GRADE2") ||
    upper.includes("GRADE II") ||
    upper.includes("GRADE-II") ||
    upper.includes("G2") ||
    upper.includes("G-2") ||
    upper.startsWith("2 -") ||
    upper.startsWith("2-") ||
    upper.startsWith("2 ") ||
    upper === "2" ||
    upper === "II"
  ) {
    return "Grade 2";
  }

  // Grade 1 / Grade I
  if (
    upper.includes("GRADE 1") ||
    upper.includes("GRADE-1") ||
    upper.includes("GRADE1") ||
    upper.includes("GRADE I") ||
    upper.includes("GRADE-I") ||
    upper.includes("G1") ||
    upper.includes("G-1") ||
    upper.startsWith("1 -") ||
    upper.startsWith("1-") ||
    upper.startsWith("1 ") ||
    upper === "1" ||
    upper === "I"
  ) {
    return "Grade 1";
  }

  return "";
}

/**
 * Universal Enrolment Matcher
 * Resolves flat keys ("kinder_m", "g4_male", "1_m"), nested objects, arrays, and custom dicts
 */
function getOfficialEnrolment(map, grade, sex) {
  if (!map || typeof map !== "object") return null;

  const isMale = sex.toUpperCase() === "M" || sex.toLowerCase().startsWith("m");
  const sexFull = isMale ? "male" : "female";
  const sexShort = isMale ? "m" : "f";

  const targetGradeNorm = normalizeStr(grade).replace(/[^a-z0-9]/g, ""); // "kinder", "grade1", "grade4"
  const gNum = grade.replace(/[^0-9]/g, ""); // "", "1", "4"

  // 1. Array structure check: [{ grade: "Grade 4", male: 152, female: 127 }, ...]
  if (Array.isArray(map)) {
    const item = map.find((x) => {
      const g = getStudentGrade({ grade: x.grade || x.gradeLevel || x.level });
      return g === grade;
    });
    if (item) {
      const val =
        item[sexFull] ??
        item[sexShort] ??
        item[sex.toUpperCase()] ??
        item[sex.toLowerCase()];
      if (val !== undefined && val !== null && val !== "")
        return Number(val) || 0;
    }
  }

  // 2. Nested Object structure check: map["Grade 4"] = { male: 152, female: 127 }
  for (const [k, v] of Object.entries(map)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const matchedGrade =
        getStudentGrade({ grade: k }) || (gNum && k === gNum ? grade : "");
      if (matchedGrade === grade) {
        const val =
          v[sexFull] ??
          v[sexShort] ??
          v[sex.toUpperCase()] ??
          v[sex.toLowerCase()];
        if (val !== undefined && val !== null && val !== "")
          return Number(val) || 0;
      }
    }
  }

  // 3. Flat Key lookup: "kinder_m", "kinder_male", "grade4_m", "g4_m", "4_m"
  const candidatePrefixes = [targetGradeNorm];
  if (grade === "Kinder") candidatePrefixes.push("k");
  if (grade === "SPED") candidatePrefixes.push("specialed");
  if (gNum) {
    candidatePrefixes.push(`g${gNum}`);
    candidatePrefixes.push(gNum);
  }

  for (const [k, v] of Object.entries(map)) {
    if (v === null || v === undefined || v === "" || typeof v === "object")
      continue;
    const normK = normalizeStr(k).replace(/[^a-z0-9]/g, "");

    for (const prefix of candidatePrefixes) {
      if (normK === `${prefix}${sexShort}` || normK === `${prefix}${sexFull}`) {
        return Number(v) || 0;
      }
    }
  }

  return null;
}

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
    const rec = s.records?.find(
      (r) => isMatchSY(r.sy, sy) && isMatchPeriod(r.q, period),
    );
    if (!rec) return;

    const hasWeight =
      rec.weight !== undefined &&
      rec.weight !== null &&
      rec.weight !== "" &&
      Number(rec.weight) > 0;

    const hasHeight =
      rec.height !== undefined &&
      rec.height !== null &&
      rec.height !== "" &&
      Number(rec.height) > 0;

    if (hasWeight) {
      stats.weighed++;
      if (hasHeight) {
        const bmi = calcBMI(rec.weight, rec.height);
        if (bmi) {
          const status = getBMIStatus(bmi, s.sex, s.birthdate);
          if (status?.label && stats.bmi[status.label] !== undefined) {
            stats.bmi[status.label]++;
          }
        }
      }
    }

    if (hasHeight) {
      stats.takenHeight++;
      const haz = getHAZStatus(rec.height, s.sex, s.birthdate);
      if (haz?.label && stats.hfa[haz.label] !== undefined) {
        stats.hfa[haz.label]++;
      }
    }
  });

  return stats;
}

function computeGradeSummary(students, sy, period, officialEnrolment = {}) {
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
    const gradeStudents = students.filter((s) => getStudentGrade(s) === grade);

    const M = computeSexStats(
      gradeStudents.filter((s) => (s.sex || "").toUpperCase() === "M"),
      sy,
      period,
    );

    const F = computeSexStats(
      gradeStudents.filter((s) => (s.sex || "").toUpperCase() === "F"),
      sy,
      period,
    );

    const officialM = getOfficialEnrolment(officialEnrolment, grade, "M");
    const officialF = getOfficialEnrolment(officialEnrolment, grade, "F");

    if (officialM !== null) {
      M.enrolment = officialM;
    } else if (M.weighed > M.enrolment) {
      M.enrolment = M.weighed;
    }

    if (officialF !== null) {
      F.enrolment = officialF;
    } else if (F.weighed > F.enrolment) {
      F.enrolment = F.weighed;
    }

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

  return { rows, grand };
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
  if (!total || total === 0) return "0.00%";
  return ((value / total) * 100).toFixed(2) + "%";
}

function StatCells({ stats }) {
  const e = stats.enrolment;
  const w = stats.weighed;

  return (
    <>
      <td>{stats.enrolment}</td>
      <td>{stats.weighed}</td>
      <td>{pct(stats.weighed, e)}</td>
      <td>{stats.bmi["Severely Wasted"]}</td>
      <td>{pct(stats.bmi["Severely Wasted"], w)}</td>
      <td>{stats.bmi["Wasted"]}</td>
      <td>{pct(stats.bmi["Wasted"], w)}</td>
      <td>{stats.bmi["Normal"]}</td>
      <td>{pct(stats.bmi["Normal"], w)}</td>
      <td>{stats.bmi["Overweight"]}</td>
      <td>{pct(stats.bmi["Overweight"], w)}</td>
      <td>{stats.bmi["Obese"]}</td>
      <td>{pct(stats.bmi["Obese"], w)}</td>
      <td>{stats.hfa["Severely Stunted"]}</td>
      <td>{pct(stats.hfa["Severely Stunted"], w)}</td>
      <td>{stats.hfa["Stunted"]}</td>
      <td>{pct(stats.hfa["Stunted"], w)}</td>
      <td>{stats.hfa["Normal"]}</td>
      <td>{pct(stats.hfa["Normal"], w)}</td>
      <td>{stats.hfa["Tall"]}</td>
      <td>{pct(stats.hfa["Tall"], w)}</td>
      <td>{stats.takenHeight}</td>
      <td>{pct(stats.takenHeight, e)}</td>
    </>
  );
}

export default function SDOReports({
  allSchoolsData = {},
  selectedSchool: selectedSchoolProp,
  setSelectedSchool: setSelectedSchoolProp,
}) {
  const [localSelectedSchool, setLocalSelectedSchool] =
    useState("CONSOLIDATED");
  const selectedSchool = selectedSchoolProp ?? localSelectedSchool;
  const setSelectedSchool = setSelectedSchoolProp ?? setLocalSelectedSchool;

  const [sy, setSy] = useState("2026–2027");
  const [period, setPeriod] = useState("Baseline");

  const [zoomScale, setZoomScale] = useState(1.0);
  const containerRef = useRef(null);

  const [officialEnrolmentMap, setOfficialEnrolmentMap] = useState({});

  const students = useMemo(() => {
    if (selectedSchool === "CONSOLIDATED" || selectedSchool === "ALL SCHOOLS") {
      return Object.values(allSchoolsData).flat();
    }
    return allSchoolsData[selectedSchool] || [];
  }, [selectedSchool, allSchoolsData]);

  // Load enrolment data via loadSbfpEnrolment + local Storage fallbacks
  useEffect(() => {
    let cancelled = false;

    const extractEnrolmentDict = (res) => {
      if (!res) return {};
      if (res.counts) return res.counts;
      if (res.details) return res.details;
      if (res.data) return res.data;
      if (res.enrolment) return res.enrolment;
      return res;
    };

    async function fetchOfficialEnrolments() {
      try {
        const cleanSy = sy.replace(/[–—]/g, "-");

        if (
          selectedSchool === "CONSOLIDATED" ||
          selectedSchool === "ALL SCHOOLS"
        ) {
          const schoolKeys = Object.keys(allSchoolsData);
          const combined = {};

          for (const sch of schoolKeys) {
            // allSchoolsData is keyed by SCHOOL NAME, but enrolment rows in
            // Supabase/SQLite are saved keyed by SCHOOL ID (see
            // SBFPBeneficiaries.jsx -> resolvedSchool.id). Resolve the real
            // school_id from that school's own student records first, or the
            // enrolment lookup will always miss and silently fall back to
            // "enrolment = records entered" (which is why Pupils Weighed
            // showed ~100% for every grade).
            const schoolStudents = allSchoolsData[sch] || [];
            const idHolder = schoolStudents.find(
              (s) => s?.schoolId || s?.school_id,
            );
            const resolvedId = idHolder?.schoolId || idHolder?.school_id || sch;

            let rawData = await loadSbfpEnrolment(resolvedId, cleanSy);
            if (
              !rawData ||
              Object.keys(extractEnrolmentDict(rawData)).length === 0
            ) {
              rawData = await loadSbfpEnrolment(resolvedId, sy);
            }
            // Last-resort fallback: some older rows may have been saved
            // under the school NAME instead of the ID.
            if (
              (!rawData ||
                Object.keys(extractEnrolmentDict(rawData)).length === 0) &&
              resolvedId !== sch
            ) {
              rawData = await loadSbfpEnrolment(sch, cleanSy);
              if (
                !rawData ||
                Object.keys(extractEnrolmentDict(rawData)).length === 0
              ) {
                rawData = await loadSbfpEnrolment(sch, sy);
              }
            }

            const dict = extractEnrolmentDict(rawData);
            if (dict && typeof dict === "object") {
              Object.entries(dict).forEach(([k, v]) => {
                if (typeof v === "number" || typeof v === "string") {
                  combined[k] = (combined[k] || 0) + (Number(v) || 0);
                } else if (v && typeof v === "object") {
                  combined[`${k}_M`] =
                    (combined[`${k}_M`] || 0) +
                    (Number(v.male || v.m || v.M) || 0);
                  combined[`${k}_F`] =
                    (combined[`${k}_F`] || 0) +
                    (Number(v.female || v.f || v.F) || 0);
                }
              });
            }
          }
          if (!cancelled) setOfficialEnrolmentMap(combined);
        } else if (selectedSchool) {
          let rawData = await loadSbfpEnrolment(selectedSchool, cleanSy);

          // Don't just check students[0] — an early/legacy record can be
          // missing schoolId even when later records in the same school
          // have it set. Search the whole array, same as the consolidated
          // branch above.
          const idHolder = students.find((s) => s?.schoolId || s?.school_id);
          const studentSchoolId = idHolder?.schoolId || idHolder?.school_id;

          if (
            (!rawData ||
              Object.keys(extractEnrolmentDict(rawData)).length === 0) &&
            studentSchoolId
          ) {
            rawData = await loadSbfpEnrolment(studentSchoolId, cleanSy);
            if (
              !rawData ||
              Object.keys(extractEnrolmentDict(rawData)).length === 0
            ) {
              rawData = await loadSbfpEnrolment(studentSchoolId, sy);
            }
          }

          if (
            !rawData ||
            Object.keys(extractEnrolmentDict(rawData)).length === 0
          ) {
            rawData = await loadSbfpEnrolment(selectedSchool, sy);
          }

          // Check LocalStorage keys if API returned empty
          if (
            !rawData ||
            Object.keys(extractEnrolmentDict(rawData)).length === 0
          ) {
            try {
              const keysToTry = [
                `sbfp_enrolment_${selectedSchool}_${cleanSy}`,
                `sbfp_enrolment_${selectedSchool}_${sy}`,
                `sbfp_enrolment_${cleanSy}`,
                `sbfp_enrolment_${sy}`,
              ];
              for (const k of keysToTry) {
                const item = localStorage.getItem(k);
                if (item) {
                  rawData = JSON.parse(item);
                  break;
                }
              }
            } catch (e) {
              console.error("Local storage lookup error", e);
            }
          }

          const dict = extractEnrolmentDict(rawData);
          if (!cancelled) setOfficialEnrolmentMap(dict || {});
        }
      } catch (err) {
        console.error("[SDOReports] Error loading official enrolment:", err);
      }
    }

    fetchOfficialEnrolments();

    return () => {
      cancelled = true;
    };
  }, [selectedSchool, sy, allSchoolsData, students]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const zoomStep = 0.05;
        let newScale = zoomScale;
        if (e.deltaY < 0) {
          newScale = Math.min(zoomScale + zoomStep, 2.0);
        } else {
          newScale = Math.max(zoomScale - zoomStep, 0.5);
        }
        setZoomScale(newScale);
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [zoomScale]);

  const filtered = students.filter((s) => {
    return (s.records || []).some(
      (r) => isMatchSY(r.sy, sy) && isMatchPeriod(r.q, period),
    );
  });

  const rows = filtered
    .map((s) => {
      const rec = s.records?.find(
        (r) => isMatchSY(r.sy, sy) && isMatchPeriod(r.q, period),
      );
      if (!rec) return null;
      const bmi = calcBMI(rec.weight, rec.height);
      const status = bmi ? getBMIStatus(bmi, s.sex, s.birthdate) : null;
      const haz = getHAZStatus(rec.height, s.sex, s.birthdate);
      return {
        ...s,
        bmi,
        status,
        haz,
        grade: getStudentGrade(s),
        lastRec: rec,
      };
    })
    .filter(Boolean);

<<<<<<< HEAD
  const reportData = useMemo(() => {
    return computeGradeSummary(students, sy, period, officialEnrolmentMap);
  }, [students, sy, period, officialEnrolmentMap]);
=======
  const gradeOrder = {
    Kinder: 0,
    "Grade 1": 1,
    "Grade 2": 2,
    "Grade 3": 3,
    "Grade 4": 4,
    "Grade 5": 5,
    "Grade 6": 6,
  };

  rows.sort((a, b) => {
    const gradeDiff =
      (gradeOrder[a.grade] ?? 999) - (gradeOrder[b.grade] ?? 999);
    if (gradeDiff !== 0) return gradeDiff;
    return a.name.localeCompare(b.name);
  });

  const reportData = useMemo(() => {
    return computeGradeSummary(students, sy, period);
  }, [students, sy, period]);
>>>>>>> 9c27fbc09b7624779a042834bfa9843d0037a349

  const counts = {
    Normal: 0,
    Wasted: 0,
    "Severely Wasted": 0,
    Overweight: 0,
    Obese: 0,
    "No Data": 0,
  };
  rows.forEach((r) => {
    if (r.status) counts[r.status.label]++;
    else counts["No Data"]++;
  });

<<<<<<< HEAD
  async function handlePrintReport() {
    const extractEnrolmentDict = (res) => {
      if (!res) return {};
      if (res.counts) return res.counts;
      if (res.details) return res.details;
      if (res.data) return res.data;
      return res;
    };
=======
  function handlePrintReport() {
    console.log("=== PRINT PREVIEW DIAGNOSTICS ===");
    console.log("Selected Value Context:", selectedSchool);
>>>>>>> 9c27fbc09b7624779a042834bfa9843d0037a349

    if (selectedSchool === "ALL SCHOOLS") {
      const schools = SCHOOL_OPTIONS.filter((school) => {
        const s = school.toLowerCase();
        return (
          !s.includes("high school") &&
          !s.includes("national high school") &&
          !s.includes("nhs") &&
          school !== "ALL SCHOOLS"
        );
      }).sort((a, b) => a.localeCompare(b));

<<<<<<< HEAD
      const multiPagePayloads = await Promise.all(
        schools.map(async (schoolKey) => {
          const schoolStudents = allSchoolsData[schoolKey] || [];
          const cleanSy = sy.replace(/[–—]/g, "-");
          const idHolder = schoolStudents.find(
            (s) => s?.schoolId || s?.school_id,
          );
          const resolvedId =
            idHolder?.schoolId || idHolder?.school_id || schoolKey;

          let schoolEnrolmentRaw = await loadSbfpEnrolment(resolvedId, cleanSy);
          if (!schoolEnrolmentRaw) {
            schoolEnrolmentRaw = await loadSbfpEnrolment(resolvedId, sy);
          }
          if (
            (!schoolEnrolmentRaw ||
              Object.keys(extractEnrolmentDict(schoolEnrolmentRaw)).length ===
                0) &&
            resolvedId !== schoolKey
          ) {
            schoolEnrolmentRaw = await loadSbfpEnrolment(schoolKey, cleanSy);
            if (!schoolEnrolmentRaw) {
              schoolEnrolmentRaw = await loadSbfpEnrolment(schoolKey, sy);
            }
          }
          const schoolEnrolment = extractEnrolmentDict(schoolEnrolmentRaw);

          const summary = computeGradeSummary(
            schoolStudents,
            sy,
            period,
            schoolEnrolment,
          );

          return {
            reportType: "landscape",
            meta: {
              schoolName: schoolKey,
              sy,
              period,
              date: new Date().toLocaleDateString("en-PH"),
            },
            rows: summary.rows,
            grand: summary.grand,
          };
        }),
      );
=======
      const multiPagePayloads = schools.map((schoolKey) => {
        const schoolStudents = allSchoolsData[schoolKey] || [];
        const summary = computeGradeSummary(schoolStudents, sy, period);

        return {
          reportType: "landscape",
          meta: {
            schoolName: schoolKey,
            sy,
            period,
            date: new Date().toLocaleDateString("en-PH"),
          },
          rows: summary.rows,
          grand: summary.grand,
        };
      });
>>>>>>> 9c27fbc09b7624779a042834bfa9843d0037a349

      if (multiPagePayloads.length === 0) {
        alert("No school data found for printing.");
        return;
      }

      if (window.electronAPI?.generatePrintPreview) {
        window.electronAPI.generatePrintPreview(multiPagePayloads);
      } else if (window.electronAPI?.generatePdfPreview) {
        window.electronAPI.generatePdfPreview(multiPagePayloads);
      }
    } else {
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

      if (window.electronAPI?.generatePrintPreview) {
        window.electronAPI.generatePrintPreview(payload);
      } else if (window.electronAPI?.generatePdfPreview) {
        window.electronAPI.generatePdfPreview(payload);
      }
    }
  }

  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Nutritional Status Report");

    worksheet.pageSetup = {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };

    const schoolTitle =
      selectedSchool === "CONSOLIDATED"
        ? "ISABELA CITY SCHOOLS DIVISION OFFICE"
        : selectedSchool === "ALL SCHOOLS"
          ? "ALL DIVISION SCHOOLS"
          : selectedSchool;

    worksheet.mergeCells("A1:Y1");
    const r1 = worksheet.getCell("A1");
    r1.value = "DEPED NUTRITIONAL STATUS REPORT";
    r1.font = { name: "Calibri", size: 16, bold: true };
    r1.alignment = { horizontal: "center", vertical: "middle" };

    worksheet.mergeCells("A2:Y2");
    const r2 = worksheet.getCell("A2");
    r2.value = schoolTitle;
    r2.font = { name: "Calibri", size: 12, bold: true };
    r2.alignment = { horizontal: "center", vertical: "middle" };

    worksheet.mergeCells("A3:Y3");
    const r3 = worksheet.getCell("A3");
    r3.value = `${period} | ${sy}`;
    r3.font = { name: "Calibri", size: 10, italic: true };
    r3.alignment = { horizontal: "center", vertical: "middle" };

    worksheet.addRow([]);

    worksheet.getRow(5).values = [
      "Grade Levels",
      "Sex",
      "Enrolment",
      "Pupils Weighed",
      "",
      "BODY MASS INDEX (BMI)",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "HEIGHT-FOR-AGE (HFA)",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Pupils Taken Height",
      "",
    ];

    worksheet.getRow(6).values = [
      "",
      "",
      "",
      "",
      "",
      "Severely Wasted",
      "",
      "Wasted",
      "",
      "Normal",
      "",
      "Overweight",
      "",
      "Obese",
      "",
      "Severely Stunted",
      "",
      "Stunted",
      "",
      "Normal",
      "",
      "Tall",
      "",
      "",
      "",
    ];

    worksheet.getRow(7).values = [
      "",
      "",
      "",
      "No.",
      "%",
      "No.",
      "%",
      "No.",
      "%",
      "No.",
      "%",
      "No.",
      "%",
      "No.",
      "%",
      "No.",
      "%",
      "No.",
      "%",
      "No.",
      "%",
      "No.",
      "%",
      "No.",
      "%",
    ];

    worksheet.mergeCells("A5:A7");
    worksheet.mergeCells("B5:B7");
    worksheet.mergeCells("C5:C7");
    worksheet.mergeCells("D5:E6");
    worksheet.mergeCells("F5:O5");
    worksheet.mergeCells("P5:W5");
    worksheet.mergeCells("X5:Y6");

    worksheet.mergeCells("F6:G6");
    worksheet.mergeCells("H6:I6");
    worksheet.mergeCells("J6:K6");
    worksheet.mergeCells("L6:M6");
    worksheet.mergeCells("N6:O6");

    worksheet.mergeCells("P6:Q6");
    worksheet.mergeCells("R6:S6");
    worksheet.mergeCells("T6:U6");
    worksheet.mergeCells("V6:W6");

    const headerFill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4FA832" },
    };
    const headerFont = {
      name: "Calibri",
      size: 10,
      bold: true,
      color: { argb: "FFFFFF" },
    };

    for (let r = 5; r <= 7; r++) {
      const row = worksheet.getRow(r);
      row.height = 20;
      for (let c = 1; c <= 25; c++) {
        const cell = row.getCell(c);
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFFFFFFF" } },
          left: { style: "thin", color: { argb: "FFFFFFFF" } },
          bottom: { style: "thin", color: { argb: "FFFFFFFF" } },
          right: { style: "thin", color: { argb: "FFFFFFFF" } },
        };
      }
    }

    const buildRowValues = (grade, sex, stats) => {
      const e = stats.enrolment;
      const w = stats.weighed;
      return [
        grade,
        sex,
        stats.enrolment,
        stats.weighed,
        pct(stats.weighed, e),
        stats.bmi["Severely Wasted"],
        pct(stats.bmi["Severely Wasted"], w),
        stats.bmi["Wasted"],
        pct(stats.bmi["Wasted"], w),
        stats.bmi["Normal"],
        pct(stats.bmi["Normal"], w),
        stats.bmi["Overweight"],
        pct(stats.bmi["Overweight"], w),
        stats.bmi["Obese"],
        pct(stats.bmi["Obese"], w),
        stats.hfa["Severely Stunted"],
        pct(stats.hfa["Severely Stunted"], w),
        stats.hfa["Stunted"],
        pct(stats.hfa["Stunted"], w),
        stats.hfa["Normal"],
        pct(stats.hfa["Normal"], w),
        stats.hfa["Tall"],
        pct(stats.hfa["Tall"], w),
        stats.takenHeight,
        pct(stats.takenHeight, e),
      ];
    };

    const hexToArgb = (hex) => {
      if (!hex || hex === "#ffffff") return "FFFFFFFF";
      return "FF" + hex.replace("#", "").toUpperCase();
    };

    let curRowIdx = 8;

    reportData.rows.forEach((row) => {
      const bgArgb = hexToArgb(getGradeColor(row.grade));
      const gradeStart = curRowIdx;

      worksheet.addRow(buildRowValues(row.grade, "M", row.M));
      worksheet.addRow(buildRowValues("", "F", row.F));
      worksheet.addRow(buildRowValues("", "Total", row.Total));

      worksheet.mergeCells(`A${gradeStart}:A${gradeStart + 2}`);

      for (let r = gradeStart; r <= gradeStart + 2; r++) {
        const rowObj = worksheet.getRow(r);
        rowObj.height = 19;
        const isTotalRow = r === gradeStart + 2;

        for (let c = 1; c <= 25; c++) {
          const cell = rowObj.getCell(c);
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: bgArgb },
          };
          cell.font = {
            name: "Calibri",
            size: 10,
            bold: isTotalRow || c === 1,
          };
          cell.alignment = {
            horizontal: c <= 2 ? "center" : "right",
            vertical: "middle",
          };
          cell.border = {
            top: { style: "thin", color: { argb: "FFCBD5E1" } },
            left: { style: "thin", color: { argb: "FFCBD5E1" } },
            bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
            right: { style: "thin", color: { argb: "FFCBD5E1" } },
          };
        }
      }

      curRowIdx += 3;
    });

    const grandStart = curRowIdx;
    worksheet.addRow(buildRowValues("GRAND TOTAL:", "M", reportData.grand.M));
    worksheet.addRow(buildRowValues("", "F", reportData.grand.F));
    worksheet.addRow(buildRowValues("", "Total", reportData.grand.Total));

    worksheet.mergeCells(`A${grandStart}:A${grandStart + 2}`);

    for (let r = grandStart; r <= grandStart + 2; r++) {
      const rowObj = worksheet.getRow(r);
      rowObj.height = 20;
      for (let c = 1; c <= 25; c++) {
        const cell = rowObj.getCell(c);
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFE69C" },
        };
        cell.font = {
          name: "Calibri",
          size: 10,
          bold: true,
          color: { argb: "FF5A4300" },
        };
        cell.alignment = {
          horizontal: c <= 2 ? "center" : "right",
          vertical: "middle",
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFD69E2E" } },
          left: { style: "thin", color: { argb: "FFD69E2E" } },
          bottom: { style: "thin", color: { argb: "FFD69E2E" } },
          right: { style: "thin", color: { argb: "FFD69E2E" } },
        };
      }
    }

    const colWidths = [
      14, 6, 11, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
      8,
    ];
    colWidths.forEach((w, idx) => {
      worksheet.getColumn(idx + 1).width = w;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const cleanSchoolName = selectedSchool.replace(/[^a-zA-Z0-9]/g, "_");
    saveAs(
      new Blob([buffer]),
      `DepEd_Nutritional_Status_Report_${cleanSchoolName}_${sy}_${period}.xlsx`,
    );
  };

  return (
    <div className="sdo-reports-page">
      <div className="filter-row no-print">
        <div className="form-group" style={{ flexGrow: 2, minWidth: "220px" }}>
          <label className="form-label">School</label>
          <select
            className="form-select"
            value={selectedSchool}
            onChange={(e) => setSelectedSchool(e.target.value)}
          >
            <option value="CONSOLIDATED">Consolidated Report</option>
            <option value="ALL SCHOOLS">All Schools (Print Per Page)</option>
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

        <div className="form-group" style={{ flexGrow: 1 }}>
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

        <div className="form-group" style={{ flexGrow: 1 }}>
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

<<<<<<< HEAD
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignSelf: "flex-end",
          }}
        >
          <button
            className="btn btn-success"
            onClick={handleExportExcel}
            style={{
              height: "38px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "#16a34a",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              padding: "0 16px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            📊 Download Excel
          </button>

          <button
            className="btn btn-primary"
            onClick={handlePrintReport}
            style={{
              height: "38px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            🖨️ Print Report
          </button>
        </div>
=======
        <button
          className="btn btn-primary"
          onClick={handlePrintReport}
          style={{
            height: "38px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            alignSelf: "flex-end",
          }}
        >
          🖨️ Print Report
        </button>
>>>>>>> 9c27fbc09b7624779a042834bfa9843d0037a349
      </div>

      <div className="print-header">
        <p>
          School: {selectedSchool} | School Year: {sy} | Period: {period}
        </p>
        <p>Total Learners: {rows.length}</p>
      </div>

      <div
        className="report-summary no-print"
        style={{ justifyContent: "flex-start" }}
      >
        {Object.entries(counts).map(([label, count]) => (
          <div key={label} className="summary-pill">
            <span className="summary-count">{count}</span>
            <span className="summary-label">{label}</span>
          </div>
        ))}
      </div>

      <div
        className="sdo-reports-card"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "72vh",
          position: "relative",
          marginTop: "4px",
        }}
      >
        <div
          style={{ marginBottom: "20px", flexShrink: 0, textAlign: "center" }}
        >
          <h2
            style={{
              margin: "0 0 4px 0",
              fontSize: "1.4rem",
              fontWeight: "800",
              color: "#1e293b",
              letterSpacing: "0.5px",
            }}
          >
            DEPED NUTRITIONAL STATUS REPORT
          </h2>
          <div
            style={{ fontSize: "1.15rem", fontWeight: "600", color: "#334155" }}
          >
            {selectedSchool === "CONSOLIDATED"
              ? "ISABELA CITY SCHOOLS DIVISION OFFICE"
              : selectedSchool === "ALL SCHOOLS"
                ? "ALL DIVISION SCHOOLS"
                : selectedSchool}
          </div>
          <div
            style={{
              fontSize: "0.9rem",
              color: "#64748b",
              fontWeight: "500",
              marginTop: "2px",
            }}
          >
            {period} | {sy}
          </div>
        </div>

        <div
          className="sdo-reports-table-container"
          ref={containerRef}
          style={{
            flexGrow: 1,
            overflow: "auto",
            marginTop: 0,
            maxHeight: "none",
            width: "100%",
          }}
        >
<<<<<<< HEAD
          <table
            className="sdo-reports-table"
            style={{ zoom: zoomScale, minWidth: "1600px" }}
          >
=======
          <table className="sdo-reports-table" style={{ zoom: zoomScale }}>
>>>>>>> 9c27fbc09b7624779a042834bfa9843d0037a349
            <colgroup>
              <col style={{ width: "110px" }} />
              <col style={{ width: "55px" }} />
              <col style={{ width: "90px" }} />
<<<<<<< HEAD
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "70px" }} />
=======
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "65px" }} />
>>>>>>> 9c27fbc09b7624779a042834bfa9843d0037a349
            </colgroup>
            <thead>
              <tr>
                <th rowSpan="3">Grade Levels</th>
                <th rowSpan="3">Sex</th>
                <th rowSpan="3">Enrolment</th>
                <th colSpan="2" rowSpan="2">
                  Pupils Weighed
                </th>
                <th colSpan="10">BODY MASS INDEX (BMI)</th>
                <th colSpan="8">HEIGHT-FOR-AGE (HFA)</th>
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
                    <td
                      rowSpan={3}
                      className="cell-grade"
                      style={{ fontWeight: "bold" }}
                    >
                      {row.grade}
                    </td>
                    <td>M</td>
<<<<<<< HEAD
                    <StatCells stats={row.M} />
=======
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
                    <td>{pct(row.F.hfa["Tall"], row.M.takenHeight)}</td>
                    <td>{row.M.takenHeight}</td>
                    <td>{pct(row.M.takenHeight, row.M.enrolment)}</td>
>>>>>>> 9c27fbc09b7624779a042834bfa9843d0037a349
                  </tr>
                  <tr style={{ backgroundColor: getGradeColor(row.grade) }}>
                    <td>F</td>
                    <StatCells stats={row.F} />
                  </tr>
                  <tr
                    style={{
                      backgroundColor: getGradeColor(row.grade),
                      fontWeight: "bold",
                    }}
                  >
                    <td>Total</td>
                    <StatCells stats={row.Total} />
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
                <td rowSpan={3}>GRAND TOTAL:</td>
                <td>M</td>
                <StatCells stats={reportData.grand.M} />
              </tr>
              <tr
                style={{
                  backgroundColor: "#FFE69C",
                  color: "#5A4300",
                  fontWeight: "bold",
                }}
              >
                <td>F</td>
                <StatCells stats={reportData.grand.F} />
              </tr>
              <tr
                style={{
                  backgroundColor: "#FFE69C",
                  color: "#5A4300",
                  fontWeight: "bold",
                }}
              >
                <td>Total</td>
                <StatCells stats={reportData.grand.Total} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
