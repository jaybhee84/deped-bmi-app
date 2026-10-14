import React, { useEffect, useMemo, useRef, useState } from "react";
import ExcelJS from "exceljs";
import depedSeal from "../images/deped.png";
import {
  calcBMI,
  getBMIStatus,
  getHAZStatus,
  normalizeHeightCm,
  formatHeightMeters,
  SCHOOL_YEARS,
  QUARTERS,
} from "../utils/bmi";
import {
  DEFAULT_SBFP_CONFIG,
  isOfficialBeneficiary,
  loadSbfpConfig,
} from "../utils/sbfpConfig";
import { exportSbfpForm1Excel } from "../utils/exportSbfpForm1Excel";
import {
  buildForm2Rows,
  exportSbfpForm2Excel,
} from "../utils/exportSbfpForm2Excel";
import { exportNsReportExcel } from "../utils/exportNsReportExcel";
import { nsReportFilename } from "../utils/exportNsReportExcel";
import { buildNutritionReport } from "../utils/nutritionSummaryModel";
import { nutritionSummaryDocument } from "../utils/printDocuments";
import {
  buildNsReportClasses,
  nsTeacherFor,
  teacherFromSection,
} from "../utils/nsReportModel";
import NsReportSheet from "./NsReportSheet";
import nsReportSheetCss from "./NsReportSheet.css?raw";
import { usePrintPreview } from "./PrintPreview/PrintPreviewContext";
import LearnerScopeSelect from "./LearnerScopeSelect";
import { isSbfpBeneficiary } from "../utils/sbfpBeneficiary";
import { gradeFromSection } from "../utils/registry";
import { fetchIecesAdvisers, isIecesSchool } from "../utils/iecesOrgChart";
import "./SbfpForms.css";
import "./SbfpFormsOverrides.css";

const CODES = {
  "Severely Wasted": "SW",
  Wasted: "W",
  Normal: "N",
  Overweight: "OW",
  Obese: "O",
  "Severely Stunted": "SS",
  Stunted: "S",
  Tall: "T",
};
function date(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "—";
}
function formDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : String(value || "");
}
function age(value, referenceDate = new Date()) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  const d = new Date(+m[1], +m[2] - 1, +m[3]),
    n = new Date(referenceDate);
  if (Number.isNaN(n.getTime())) return "—";
  let months =
    (n.getFullYear() - d.getFullYear()) * 12 + n.getMonth() - d.getMonth();
  if (n.getDate() < d.getDate()) months--;
  return `${Math.max(0, Math.floor(months / 12))}. ${Math.max(0, months % 12)}`;
}
const GRADE_ORDER = [
  "Kinder",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "SNED",
  "SPED",
];
function gradeRank(student) {
  const grade = String(student.section || student.grade || "")
    .split(" - ")[0]
    .trim();
  const rank = GRADE_ORDER.indexOf(grade);
  return rank === -1 ? GRADE_ORDER.length : rank;
}
function sexRank(sex) {
  return String(sex || "")
    .toUpperCase()
    .startsWith("M")
    ? 0
    : 1;
}
function sortBeneficiaries(list) {
  return [...list].sort(
    (a, b) =>
      gradeRank(a) - gradeRank(b) ||
      String(a.section || a.grade || "").localeCompare(
        String(b.section || b.grade || ""),
      ) ||
      sexRank(a.sex) - sexRank(b.sex) ||
      String(a.name || "").localeCompare(String(b.name || "")),
  );
}

const normalizedPersonName = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

function adviserNameForSection(advisers, section) {
  const familyName = normalizedPersonName(teacherFromSection(section));
  const grade = normalizedPersonName(gradeFromSection(section));
  const adviser = advisers.find(
    (person) =>
      normalizedPersonName(person.family_name) === familyName &&
      normalizedPersonName(person.grade_level) === grade,
  );
  if (!adviser) return null;
  const middleInitial = String(adviser.middle_name || "").trim();
  return {
    fullName: [adviser.first_name, adviser.middle_name, adviser.family_name]
      .filter(Boolean)
      .join(" "),
    displayName: [
      adviser.first_name,
      middleInitial ? `${middleInitial.charAt(0)}.` : "",
      adviser.family_name,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function normalizedLearnerName(value) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  // The previous-year workbook uses "LAST, FIRST M.I." while some current
  // records use "FIRST M.I. LAST". Sorting the normalized tokens allows both
  // formats to match without fuzzy/partial matching. Duplicate signatures are
  // still rejected by the importer as ambiguous.
  return normalized ? normalized.split(" ").sort().join(" ") : "";
}

function learnerNamesMatch(left, right) {
  const leftTokens = normalizedLearnerName(left).split(" ").filter(Boolean);
  const rightTokens = normalizedLearnerName(right).split(" ").filter(Boolean);
  if (leftTokens.length !== rightTokens.length) return false;

  const remaining = [...rightTokens];
  return leftTokens.every((token) => {
    const matchIndex = remaining.findIndex(
      (candidate) =>
        candidate === token ||
        (token.length === 1 && candidate.startsWith(token)) ||
        (candidate.length === 1 && token.startsWith(candidate)),
    );
    if (matchIndex === -1) return false;
    remaining.splice(matchIndex, 1);
    return true;
  });
}

function learnerNameScore(left, right) {
  const leftName = normalizedLearnerName(left);
  const rightName = normalizedLearnerName(right);
  if (!leftName || !rightName) return 0;
  if (leftName === rightName) return 120;
  if (learnerNamesMatch(left, right)) return 100;

  const leftTokens = leftName.split(" ");
  const rightTokens = rightName.split(" ");
  const shorter =
    leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;
  const longer = shorter === leftTokens ? rightTokens : leftTokens;
  const remaining = [...longer];
  let fullTokenMatches = 0;
  const allShorterTokensMatch = shorter.every((token) => {
    const matchIndex = remaining.findIndex(
      (candidate) =>
        candidate === token ||
        (token.length === 1 && candidate.startsWith(token)) ||
        (candidate.length === 1 && token.startsWith(candidate)),
    );
    if (matchIndex === -1) return false;
    if (token.length > 1 && remaining[matchIndex].length > 1)
      fullTokenMatches++;
    remaining.splice(matchIndex, 1);
    return true;
  });
  return allShorterTokensMatch && fullTokenMatches >= 2 ? 70 : 0;
}

function dateIdentity(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function sexIdentity(value) {
  const sex = String(value || "")
    .trim()
    .toUpperCase();
  return sex.startsWith("M") ? "M" : sex.startsWith("F") ? "F" : "";
}

function normalizedSchoolYear(value) {
  return String(value || "")
    .replace(/[–—]/g, "-")
    .trim();
}

function previousSchoolYear(value) {
  const match = normalizedSchoolYear(value).match(/^(\d{4})-(\d{4})$/);
  if (!match) return "";
  const start = Number(match[1]);
  return `${start - 1}-${start}`;
}

function previousYearBeneficiaryValue(student, schoolYear, config) {
  const priorYear = previousSchoolYear(schoolYear);
  const priorRecord = student.records?.find(
    (record) =>
      normalizedSchoolYear(record.sy) === priorYear && record.q === "Baseline",
  );

  // The Excel upload is a fallback only when the preceding year's Baseline
  // record is unavailable from Supabase/local sync.
  if (!priorRecord) return student.previousSbfpBeneficiary || "N";

  const heightCm = normalizeHeightCm(priorRecord.height);
  const bmi = calcBMI(priorRecord.weight, heightCm);
  const bmiStatus = bmi
    ? getBMIStatus(bmi, student.sex, student.birthdate, priorRecord.date)
    : null;
  const hazStatus = getHAZStatus(
    heightCm,
    student.sex,
    student.birthdate,
    priorRecord.date,
  );
  const priorStudent = {
    ...student,
    section: priorRecord.section || student.section,
  };
  return isOfficialBeneficiary(priorStudent, bmiStatus, hazStatus, config)
    ? "Y"
    : "N";
}

function excelText(cell) {
  if (cell?.text) return String(cell.text).trim();
  if (cell?.value && typeof cell.value === "object") {
    return String(cell.value.result ?? cell.value.text ?? "").trim();
  }
  return String(cell?.value ?? "").trim();
}

function formDetailsStorageKey(currentUser, schoolName) {
  const schoolKey = currentUser?.school_id || schoolName || "unknown-school";
  return `sbfp-form-details:${schoolKey}`;
}
function form2DetailsStorageKey(currentUser, schoolName) {
  return `${formDetailsStorageKey(currentUser, schoolName)}:form2`;
}
function initialForm2Details(currentUser, schoolName) {
  try {
    const saved = JSON.parse(
      localStorage.getItem(form2DetailsStorageKey(currentUser, schoolName)),
    );
    return saved && typeof saved === "object"
      ? { feedingStartDate: "", lastMile: "N", ...saved }
      : { feedingStartDate: "", lastMile: "N" };
  } catch {
    return { feedingStartDate: "", lastMile: "N" };
  }
}

function initialFormDetails(currentUser, schoolName) {
  const defaults = {
    division: currentUser?.division || "",
    cityBarangay: currentUser?.city || "",
    principal: currentUser?.principal_name || currentUser?.school_head || "",
    focalPerson:
      currentUser?.feeding_focal_person || currentUser?.username || "",
  };
  try {
    const saved = JSON.parse(
      localStorage.getItem(formDetailsStorageKey(currentUser, schoolName)),
    );
    return saved && typeof saved === "object"
      ? { ...defaults, ...saved }
      : defaults;
  } catch {
    return defaults;
  }
}

function yesNoCode(value) {
  const first = String(value || "")
    .trim()
    .charAt(0)
    .toUpperCase();
  return first === "Y" || first === "N" ? first : "";
}

function YesNoCell({
  value,
  selected,
  onSelectStart,
  onSelectEnter,
  onFill,
  readOnly,
}) {
  const handleKeyDown = (event) => {
    if (/^[yn]$/i.test(event.key)) {
      event.preventDefault();
      onFill(event.key.toUpperCase());
    }
  };
  return (
    <td
      className={`sbfp-yes-no-cell${selected ? " selected" : ""}${readOnly ? " read-only" : ""}`}
      tabIndex={readOnly ? -1 : 0}
      onMouseDown={readOnly ? undefined : onSelectStart}
      onMouseEnter={readOnly ? undefined : onSelectEnter}
      onKeyDown={readOnly ? undefined : handleKeyDown}
    >
      {yesNoCode(value)}
    </td>
  );
}

export default function SbfpForms({
  students = [],
  setStudents,
  currentUser,
  schoolName,
  readOnly = false,
  initialSchoolYear = "2026–2027",
  initialPeriod = "Baseline",
}) {
  const { requestPrint } = usePrintPreview();
  const nsPagesRef = useRef(null);
  const [form, setForm] = useState("nsReport"),
    [schoolYear, setSchoolYear] = useState(initialSchoolYear),
    [period, setPeriod] = useState(initialPeriod),
    [config, setConfig] = useState(DEFAULT_SBFP_CONFIG),
    [downloading, setDownloading] = useState(false);
  const summary = useMemo(
    () => buildNutritionReport(students, schoolYear, period),
    [students, schoolYear, period],
  );
  const [nsGrade, setNsGrade] = useState("All");
  const [nsClass, setNsClass] = useState("All");
  const [nsLearnerScope, setNsLearnerScope] = useState("all");
  const [formDetails, setFormDetails] = useState(() =>
    initialFormDetails(currentUser, schoolName),
  );
  const [yesNoEdits, setYesNoEdits] = useState({});
  const [selectedCells, setSelectedCells] = useState([]);
  const [importMessage, setImportMessage] = useState("");
  const [importingPrevious, setImportingPrevious] = useState(false);
  const [iecesAdvisers, setIecesAdvisers] = useState([]);
  const [form2Details, setForm2Details] = useState(() =>
    initialForm2Details(currentUser, schoolName),
  );
  const selectingCells = useRef(false);
  const previousYearFileInput = useRef(null);
  const isIeces = isIecesSchool(
    currentUser?.school_id || currentUser?.schoolId,
  );
  useEffect(() => {
    if (!isIeces) {
      setIecesAdvisers([]);
      return;
    }
    let active = true;
    fetchIecesAdvisers()
      .then((advisers) => {
        if (active) setIecesAdvisers(advisers);
      })
      .catch((error) =>
        console.warn(
          "Unable to load IECES advisers for NS Report:",
          error.message,
        ),
      );
    return () => {
      active = false;
    };
  }, [isIeces]);
  useEffect(() => {
    loadSbfpConfig().then(setConfig);
  }, []);
  useEffect(() => {
    setFormDetails(initialFormDetails(currentUser, schoolName));
    setForm2Details(initialForm2Details(currentUser, schoolName));
  }, [currentUser, schoolName]);
  const updateForm2Detail = (field, value) =>
    setForm2Details((previous) => {
      const next = { ...previous, [field]: value };
      try {
        localStorage.setItem(
          form2DetailsStorageKey(currentUser, schoolName),
          JSON.stringify(next),
        );
      } catch (error) {
        console.error("Unable to save Form 2 details locally.", error);
      }
      return next;
    });
  useEffect(() => {
    const finishSelection = () => {
      selectingCells.current = false;
    };
    window.addEventListener("mouseup", finishSelection);
    return () => window.removeEventListener("mouseup", finishSelection);
  }, []);
  const updateDetail = (field, value) =>
    setFormDetails((previous) => {
      const next = { ...previous, [field]: value };
      try {
        localStorage.setItem(
          formDetailsStorageKey(currentUser, schoolName),
          JSON.stringify(next),
        );
      } catch (error) {
        console.error("Unable to save the SBFP form details locally.", error);
      }
      return next;
    });
  const beneficiaries = useMemo(
    () =>
      sortBeneficiaries(
        students
          .map((student) => {
            const rec =
              student.records?.find(
                (record) => record.sy === schoolYear && record.q === period,
              ) || null;
            const heightCm = rec ? normalizeHeightCm(rec.height) : null;
            const bmi = rec ? calcBMI(rec.weight, heightCm) : null;
            return {
              ...student,
              rec,
              section: rec?.section || student.section,
              heightCm,
              bmi,
              previousSbfpBeneficiary: previousYearBeneficiaryValue(
                student,
                schoolYear,
                config,
              ),
              baz: bmi
                ? getBMIStatus(bmi, student.sex, student.birthdate, rec.date)
                : null,
              haz: rec
                ? getHAZStatus(
                    heightCm,
                    student.sex,
                    student.birthdate,
                    rec.date,
                  )
                : null,
            };
          })
          .filter((student) =>
            isOfficialBeneficiary(student, student.baz, student.haz, config),
          ),
      ),
    [students, schoolYear, period, config],
  );
  const nsReportStudents = useMemo(
    () =>
      sortBeneficiaries(
        students
          .filter(
            (student) =>
              nsLearnerScope !== "sbfp" ||
              isSbfpBeneficiary(student, schoolYear, config),
          )
          .map((student) => {
            const rec = student.records?.find(
              (record) => record.sy === schoolYear && record.q === period,
            );
            if (!rec) return null;
            const section = rec.section || student.section || student.grade;
            const orgAdviser = isIeces
              ? adviserNameForSection(iecesAdvisers, section)
              : null;
            const teacherName = rec.teacherName || orgAdviser?.fullName || "";
            const heightCm = normalizeHeightCm(rec.height);
            const bmi = calcBMI(rec.weight, heightCm);
            return {
              ...student,
              rec: {
                ...rec,
                teacherName,
                teacherDisplayName:
                  rec.teacherDisplayName || orgAdviser?.displayName || "",
              },
              section,
              heightCm,
              bmi,
              baz: bmi
                ? getBMIStatus(bmi, student.sex, student.birthdate, rec.date)
                : null,
              haz: getHAZStatus(
                heightCm,
                student.sex,
                student.birthdate,
                rec.date,
              ),
            };
          })
          .filter(Boolean),
      ),
    [students, schoolYear, period, isIeces, iecesAdvisers, nsLearnerScope, config],
  );
  const nsGradeOptions = useMemo(
    () =>
      [
        ...new Set(
          nsReportStudents
            .map((student) =>
              gradeFromSection(student.section || student.grade),
            )
            .filter(Boolean),
        ),
      ].sort((left, right) => {
        const leftRank = GRADE_ORDER.indexOf(left);
        const rightRank = GRADE_ORDER.indexOf(right);
        return (
          (leftRank < 0 ? 99 : leftRank) - (rightRank < 0 ? 99 : rightRank) ||
          left.localeCompare(right)
        );
      }),
    [nsReportStudents],
  );
  const nsClassOptions = useMemo(
    () =>
      [
        ...new Set(
          nsReportStudents
            .filter(
              (student) =>
                nsGrade === "All" ||
                gradeFromSection(student.section || student.grade) === nsGrade,
            )
            .map((student) => student.section || student.grade)
            .filter(Boolean),
        ),
      ].sort(),
    [nsReportStudents, nsGrade],
  );
  const displayedNsStudents = useMemo(
    () =>
      nsReportStudents.filter(
        (student) =>
          (nsGrade === "All" ||
            gradeFromSection(student.section || student.grade) === nsGrade) &&
          (nsClass === "All" || (student.section || student.grade) === nsClass),
      ),
    [nsReportStudents, nsGrade, nsClass],
  );
  const nsClasses = useMemo(
    () => buildNsReportClasses(displayedNsStudents, nsTeacherFor),
    [displayedNsStudents],
  );
  const nsMeta = {
    schoolName,
    address: formDetails.cityBarangay,
    period,
    schoolYear,
  };
  const feedingStartDate = form2Details.feedingStartDate;
  const feedingStartDateDisplay = formDate(feedingStartDate);
  const yesNoKey = (student, index, field) => `${student.id ?? index}:${field}`;
  const startCellSelection = (event, key) => {
    event.preventDefault();
    selectingCells.current = true;
    setSelectedCells([key]);
    event.currentTarget.focus();
  };
  const extendCellSelection = (key) => {
    if (!selectingCells.current) return;
    setSelectedCells((previous) =>
      previous.includes(key) ? previous : [...previous, key],
    );
  };
  const fillSelectedCells = (value, fallbackKey) => {
    const targets = selectedCells.length ? selectedCells : [fallbackKey];
    setYesNoEdits((previous) => {
      const next = { ...previous };
      targets.forEach((key) => {
        next[key] = value;
      });
      return next;
    });

    if (!setStudents || readOnly) return;

    const fieldMap = {
      dewormed: "dewormed",
      parentConsent: "parentConsent",
      member4ps: "member4ps",
      previousSbfp: "previousSbfpBeneficiary",
    };
    const updatesByStudentId = new Map();
    beneficiaries.forEach((student, index) => {
      Object.entries(fieldMap).forEach(([cellField, studentField]) => {
        const key = yesNoKey(student, index, cellField);
        if (targets.includes(key)) {
          const studentId = String(student.id);
          updatesByStudentId.set(studentId, {
            ...(updatesByStudentId.get(studentId) || {}),
            [studentField]: value,
          });
        }
      });
    });

    if (updatesByStudentId.size === 0) return;
    setStudents((previous) =>
      previous.map((student) => {
        const updates = updatesByStudentId.get(String(student.id));
        return updates ? { ...student, ...updates } : student;
      }),
    );
  };
  const exportBeneficiaries = beneficiaries.map((student, index) => ({
    ...student,
    dewormed:
      yesNoEdits[yesNoKey(student, index, "dewormed")] ??
      student.dewormed ??
      "Y",
    parentConsent:
      yesNoEdits[yesNoKey(student, index, "parentConsent")] ??
      student.parentConsent ??
      "Y",
    member4ps:
      yesNoEdits[yesNoKey(student, index, "member4ps")] ?? student.member4ps,
    previousSbfpBeneficiary:
      yesNoEdits[yesNoKey(student, index, "previousSbfp")] ??
      student.previousSbfpBeneficiary,
  }));
  const form2Rows = buildForm2Rows(exportBeneficiaries);
  const importPreviousYearForm = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !setStudents || readOnly || !isIeces) return;

    setImportingPrevious(true);
    setImportMessage("");
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      if (!workbook.worksheets.length)
        throw new Error("The workbook does not contain a worksheet.");

      let sheet = null;
      let headerRow = 0;
      let nameColumn = 0;
      let bestHeaderScore = -1;
      workbook.worksheets.forEach((candidateSheet) => {
        const scanRows = Math.min(candidateSheet.rowCount, 40);
        const scanColumns = Math.min(candidateSheet.columnCount, 30);
        for (let row = 1; row <= scanRows; row++) {
          for (let column = 1; column <= scanColumns; column++) {
            const header = excelText(
              candidateSheet.getCell(row, column),
            ).toUpperCase();
            if (!header.includes("NAME") || header.includes("SCHOOL")) continue;
            const score =
              (header.includes("BENEFICIAR") || header.includes("LEARNER")
                ? 10
                : 0) + (row >= 10 ? 2 : 0);
            if (score > bestHeaderScore) {
              sheet = candidateSheet;
              headerRow = row;
              nameColumn = column;
              bestHeaderScore = score;
            }
          }
        }
      });
      sheet ||= workbook.worksheets[1] || workbook.worksheets[0];

      let fourPsColumn = 0;
      const scanColumns = Math.min(sheet.columnCount, 30);
      if (!nameColumn) {
        // Official SBFP Form 1 stores learner names in column B.
        nameColumn = 2;
        headerRow = 13;
      }
      for (let row = Math.max(1, headerRow - 3); row <= headerRow + 3; row++) {
        for (let column = 1; column <= scanColumns; column++) {
          const header = excelText(sheet.getCell(row, column))
            .toUpperCase()
            .replace(/\s+/g, "");
          if (header.includes("4PS")) fourPsColumn = column;
        }
      }
      if (!fourPsColumn) fourPsColumn = 15;

      const uploadedByName = new Map();
      for (let row = headerRow + 1; row <= sheet.rowCount; row++) {
        const learnerNumber = excelText(sheet.getCell(row, 1));
        if (!/^\d+$/.test(learnerNumber)) continue;
        const name = normalizedLearnerName(
          excelText(sheet.getCell(row, nameColumn)),
        );
        if (!name) continue;
        const fourPs = excelText(sheet.getCell(row, fourPsColumn))
          .toUpperCase()
          .trim();
        uploadedByName.set(name, {
          fourPs: fourPs === "Y" || fourPs === "YES",
          sex: sexIdentity(excelText(sheet.getCell(row, 3))),
          birthdate: dateIdentity(sheet.getCell(row, 5).value),
        });
      }

      const matchesByStudentId = new Map();
      let ambiguous = 0;
      uploadedByName.forEach((uploaded, uploadedName) => {
        const candidates = students
          .map((student) => {
            const nameScore = learnerNameScore(student.name, uploadedName);
            const studentSex = sexIdentity(student.sex);
            const studentBirthdate = dateIdentity(student.birthdate);
            if (
              !nameScore ||
              (uploaded.sex && studentSex && uploaded.sex !== studentSex)
            )
              return null;

            const birthdateMatches =
              uploaded.birthdate &&
              studentBirthdate &&
              uploaded.birthdate === studentBirthdate;
            // A shortened/omitted-middle-name match needs the same birthdate.
            if (nameScore < 100 && !birthdateMatches) return null;
            return {
              student,
              score: nameScore + (birthdateMatches ? 40 : 0),
            };
          })
          .filter(Boolean)
          .sort((a, b) => b.score - a.score);

        const best = candidates[0];
        const tied = best && candidates[1]?.score === best.score;
        if (best && !tied) {
          const studentId = String(best.student.id);
          matchesByStudentId.set(studentId, {
            uploadedName,
            fourPs:
              uploaded.fourPs || matchesByStudentId.get(studentId)?.fourPs,
          });
        } else if (best) {
          ambiguous++;
        }
      });

      let matched = 0;
      let fourPsMatched = 0;
      let fourPsUpdated = 0;
      const matchedNames = new Set();
      setStudents((current) =>
        current.map((student) => {
          const uploaded = matchesByStudentId.get(String(student.id));
          if (!uploaded) return student;
          matched++;
          matchedNames.add(uploaded.uploadedName);
          if (uploaded.fourPs) fourPsMatched++;
          if (uploaded.fourPs && student.member4ps !== "Y") fourPsUpdated++;
          return {
            ...student,
            previousSbfpBeneficiary: "Y",
            member4ps: uploaded.fourPs ? "Y" : student.member4ps,
          };
        }),
      );
      setYesNoEdits({});
      const unmatched = [...uploadedByName.keys()].filter(
        (name) => !matchedNames.has(name),
      ).length;
      setImportMessage(
        `Imported ${matched} matched learner${matched === 1 ? "" : "s"}; ` +
          `${fourPsMatched} matched with 4Ps = Y (${fourPsUpdated} newly updated). ` +
          `${unmatched} unmatched` +
          (ambiguous
            ? `; ${ambiguous} ambiguous duplicate name${ambiguous === 1 ? "" : "s"}`
            : "") +
          ".",
      );
    } catch (error) {
      console.error("Unable to import the previous-year SBFP workbook.", error);
      setImportMessage(error.message || "Unable to read the Excel workbook.");
    } finally {
      setImportingPrevious(false);
    }
  };
  const download = async () => {
    setDownloading(true);
    try {
      await exportSbfpForm1Excel({
        beneficiaries: exportBeneficiaries,
        schoolName,
        schoolId: currentUser?.school_id,
        schoolYear,
        division: formDetails.division,
        cityBarangay: formDetails.cityBarangay,
        principalName: formDetails.principal,
        feedingFocalPerson: formDetails.focalPerson,
      });
    } catch (error) {
      console.error(error);
      window.alert(error.message || "Unable to create the SBFP Form 1 file.");
    } finally {
      setDownloading(false);
    }
  };
  const summaryDocument = nutritionSummaryDocument({
    meta: {
      schoolName,
      schoolId: currentUser?.school_id,
      sy: schoolYear,
      period,
      scope: "SBFP Summary — All Learners",
      logo: depedSeal,
      date: new Date().toLocaleDateString("en-PH"),
    },
    ...summary,
  }, "SBFP Summary");
  const downloadSummary = async () => {
    setDownloading(true);
    try {
      const meta = { schoolName, schoolYear, period };
      await exportNsReportExcel([], meta, {
        summary: {
          ...summary,
          title: "SBFP SUMMARY — ALL LEARNERS",
          date: new Date().toLocaleDateString("en-PH"),
        },
        filename: nsReportFilename([], meta).replace("NS_Report", "SBFP_Summary"),
      });
    } catch (error) {
      console.error(error);
      window.alert(error.message || "Unable to create the SBFP Summary file.");
    } finally {
      setDownloading(false);
    }
  };
  const downloadNsReport = async () => {
    setDownloading(true);
    try {
      await exportNsReportExcel(nsClasses, nsMeta);
    } catch (error) {
      console.error(error);
      window.alert(error.message || "Unable to create the NS Report file.");
    } finally {
      setDownloading(false);
    }
  };
  const downloadForm2 = async () => {
    setDownloading(true);
    try {
      await exportSbfpForm2Excel({
        beneficiaries: exportBeneficiaries,
        schoolName,
        schoolId: currentUser?.school_id,
        schoolYear,
        division: formDetails.division,
        cityBarangay: formDetails.cityBarangay,
        principalName: formDetails.principal,
        feedingFocalPerson: formDetails.focalPerson,
        feedingStartDate: feedingStartDateDisplay,
        lastMile: form2Details.lastMile,
      });
    } catch (error) {
      console.error(error);
      window.alert(error.message || "Unable to create the SBFP Form 2 file.");
    } finally {
      setDownloading(false);
    }
  };
  return (
    <section className="sbfp-forms-page">
      <div className="sbfp-forms-heading">
        <div>
          <h1>SBFP Forms</h1>
          <p>
            School-Based Feeding Program forms and nutritional summaries.
          </p>
        </div>
        <div className="sbfp-forms-controls">
          <div className="sbfp-forms-filters">
            {isIeces && !readOnly && (
              <div className="sbfp-previous-upload">
                <span>Previous-Year Data</span>
                <input
                  ref={previousYearFileInput}
                  className="sbfp-hidden-file-input"
                  type="file"
                  accept=".xlsx,.xlsm"
                  onChange={importPreviousYearForm}
                />
                <button
                  className="sbfp-upload-button"
                  type="button"
                  disabled={importingPrevious}
                  onClick={() => previousYearFileInput.current?.click()}
                >
                  {importingPrevious ? "Reading Excel…" : "Upload Form 1"}
                </button>
              </div>
            )}
            <label>
              School Year
              <select
                value={schoolYear}
                onChange={(e) => setSchoolYear(e.target.value)}
              >
                {SCHOOL_YEARS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Period
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                {QUARTERS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            {form === "nsReport" && (
              <>
                <label>
                  Learners
                  <LearnerScopeSelect
                    value={nsLearnerScope}
                    onChange={(value) => {
                      setNsLearnerScope(value);
                      setNsGrade("All");
                      setNsClass("All");
                    }}
                  />
                </label>
                <label>
                  Grade Level
                  <select
                    value={nsGrade}
                    onChange={(event) => {
                      setNsGrade(event.target.value);
                      setNsClass("All");
                    }}
                  >
                    <option value="All">All Grade Levels</option>
                    {nsGradeOptions.map((grade) => (
                      <option key={grade}>{grade}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Class
                  <select
                    value={nsClass}
                    onChange={(event) => setNsClass(event.target.value)}
                  >
                    <option value="All">All Classes</option>
                    {nsClassOptions.map((section) => (
                      <option key={section}>{section}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
          {isIeces && importMessage && (
            <p className="sbfp-import-message" role="status">
              {importMessage}
            </p>
          )}
        </div>
      </div>
      <div className="sbfp-form-tabs">
        <button
          className={form === "summary" ? "active" : ""}
          onClick={() => setForm("summary")}
        >
          SBFP Summary
        </button>
        <button
          className={form === "nsReport" ? "active" : ""}
          onClick={() => setForm("nsReport")}
        >
          NS Report
        </button>
        <button
          className={form === "form1" ? "active" : ""}
          onClick={() => setForm("form1")}
        >
          Form 1
        </button>
        <button
          className={form === "form2" ? "active" : ""}
          onClick={() => setForm("form2")}
        >
          Form 2
        </button>
      </div>
      {form === "summary" ? (
        <>
          <div className="sbfp-report-actions">
            <button className="sbfp-download-button" disabled={downloading || students.length === 0} onClick={downloadSummary} data-excel-download="true">
              {downloading ? "Preparing Summary…" : "Download SBFP Summary Excel"}
            </button>
            <button className="sbfp-download-button sbfp-print-button" disabled={students.length === 0} onClick={() => requestPrint(summaryDocument)}>
              Print SBFP Summary
            </button>
          </div>
          <p>All learners: {summary.grand.Total.enrolment}. Measurements reflect {period}, SY {schoolYear}.</p>
          <iframe title="SBFP Summary preview" srcDoc={summaryDocument.html} style={{ width: "100%", height: 720, border: "1px solid #ddd", background: "white" }} />
        </>
      ) : form === "nsReport" ? (
        <>
          <div className="sbfp-report-actions">
            <button
              className="sbfp-download-button"
              disabled={downloading || nsClasses.length === 0}
              onClick={downloadNsReport}
              data-excel-download="true"
            >
              {downloading ? "Preparing NS Report…" : "Download NS Report"}
            </button>
            <button
              className="sbfp-download-button sbfp-print-button"
              disabled={nsClasses.length === 0}
              onClick={() =>
                requestPrint({
                  element: nsPagesRef.current,
                  css: nsReportSheetCss,
                  title: `NS Report - ${period} SY ${schoolYear}`,
                })
              }
            >
              Print NS Report
            </button>
          </div>
          {nsClasses.length === 0 ? (
            <p className="sbfp-empty">
              No learner measurements found for the selected school year and
              period.
            </p>
          ) : (
            <div className="sbfp-form-sheet-wrap">
              <div className="nsr-pages" ref={nsPagesRef}>
                {nsClasses.map((reportClass) => (
                  <NsReportSheet
                    key={reportClass.section}
                    reportClass={reportClass}
                    schoolName={schoolName}
                    address={formDetails.cityBarangay}
                    period={period}
                    schoolYear={schoolYear}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : form === "form1" ? (
        <>
          <button
            className="sbfp-download-button"
            disabled={downloading}
            onClick={download}
            data-excel-download="true"
          >
            {downloading ? "Preparing Form 1…" : "Download Form 1"}
          </button>
          <div className="sbfp-form-sheet-wrap">
            <div className="sbfp-form-sheet">
              <p className="form-sheet-label">SBFP Form 1 (2020)</p>
              <h2>Department of Education</h2>
              <p>Region IX</p>
              <h3>
                Master List Beneficiaries for School-Based Feeding Program
                (SBFP) (SY{schoolYear})
              </h3>
              <div className="form-sheet-details">
                <span>
                  Division/Province:{" "}
                  <input
                    className="sbfp-inline-detail"
                    aria-label="Division or province"
                    readOnly={readOnly}
                    value={formDetails.division}
                    onChange={(event) =>
                      updateDetail("division", event.target.value)
                    }
                  />
                </span>
                <span>
                  Name of Principal:{" "}
                  <input
                    className="sbfp-inline-detail"
                    aria-label="Name of principal"
                    readOnly={readOnly}
                    value={formDetails.principal}
                    onChange={(event) =>
                      updateDetail("principal", event.target.value)
                    }
                  />
                </span>
                <span>
                  City/Municipality/Barangay:{" "}
                  <input
                    className="sbfp-inline-detail"
                    aria-label="City, municipality, or barangay"
                    readOnly={readOnly}
                    value={formDetails.cityBarangay}
                    onChange={(event) =>
                      updateDetail("cityBarangay", event.target.value)
                    }
                  />
                </span>
                <span>
                  Name of Feeding Focal Person:{" "}
                  <input
                    className="sbfp-inline-detail"
                    aria-label="Name of feeding focal person"
                    readOnly={readOnly}
                    value={formDetails.focalPerson}
                    onChange={(event) =>
                      updateDetail("focalPerson", event.target.value)
                    }
                  />
                </span>
                <span>
                  Name of School / School District: {schoolName || "Not set"}
                </span>
                <span>
                  School ID Number: {currentUser?.school_id || "Not set"}
                </span>
              </div>
              <div className="sbfp-table-scroll">
                <table className="sbfp-form-table">
                  <colgroup>
                    {Array.from({ length: 16 }, (_, index) => (
                      <col key={index} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th rowSpan="2">No.</th>
                      <th rowSpan="2">Name</th>
                      <th rowSpan="2">Sex</th>
                      <th rowSpan="2">Grade/ Section</th>
                      <th rowSpan="2">
                        Date of Birth
                        <br />
                        (MM/DD/YYYY)
                      </th>
                      <th rowSpan="2">
                        Date of Weighing / Measuring
                        <br />
                        (MM/DD/YYYY)
                      </th>
                      <th rowSpan="2">Age in Years / Months</th>
                      <th rowSpan="2">
                        Weight
                        <br />
                        (Kg)
                      </th>
                      <th rowSpan="2">
                        Height
                        <br />
                        (m)
                      </th>
                      <th rowSpan="2">BMI for 6 y.o. and above</th>
                      <th colSpan="2">Nutritional Status (NS)</th>
                      <th rowSpan="2">
                        Dewormed?
                        <br />
                        (yes or no)
                      </th>
                      <th rowSpan="2">
                        Parent's consent for milk?
                        <br />
                        (yes or no)
                      </th>
                      <th rowSpan="2">
                        Participation in 4Ps
                        <br />
                        (yes or no)
                      </th>
                      <th rowSpan="2">
                        Beneficiary of SBFP in Previous Years
                        <br />
                        (yes or no)
                      </th>
                    </tr>
                    <tr>
                      <th>BMI-A</th>
                      <th>HFA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {beneficiaries.map((student, index) => (
                      <tr key={student.id}>
                        <td>{index + 1}</td>
                        <td>{student.name}</td>
                        <td>{student.sex}</td>
                        <td>{student.section || student.grade}</td>
                        <td>{date(student.birthdate)}</td>
                        <td>{date(student.rec?.date)}</td>
                        <td>{age(student.birthdate)}</td>
                        <td>{student.rec?.weight ?? "—"}</td>
                        <td>{formatHeightMeters(student.heightCm)}</td>
                        <td>{student.bmi?.toFixed(2) ?? "—"}</td>
                        <td>{CODES[student.baz?.label] || "—"}</td>
                        <td>{CODES[student.haz?.label] || "—"}</td>
                        {[
                          ["dewormed", student.dewormed || "Y"],
                          ["parentConsent", student.parentConsent || "Y"],
                          ["member4ps", student.member4ps],
                          ["previousSbfp", student.previousSbfpBeneficiary],
                        ].map(([field, fetchedValue]) => {
                          const key = yesNoKey(student, index, field);
                          return (
                            <YesNoCell
                              key={field}
                              value={yesNoEdits[key] ?? fetchedValue}
                              selected={selectedCells.includes(key)}
                              onSelectStart={(event) =>
                                startCellSelection(event, key)
                              }
                              onSelectEnter={() => extendCellSelection(key)}
                              onFill={(value) => fillSelectedCells(value, key)}
                              readOnly={readOnly}
                            />
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {beneficiaries.length === 0 && (
                <p className="sbfp-empty">
                  No beneficiaries found for the selected school year and
                  period.
                </p>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <button
            className="sbfp-download-button"
            disabled={downloading}
            onClick={downloadForm2}
            data-excel-download="true"
          >
            {downloading ? "Preparing Form 2…" : "Download Form 2"}
          </button>
          <div className="sbfp-form-sheet-wrap">
            <div className="sbfp-form-sheet sbfp-form2-sheet">
              <p className="form-sheet-label">SBFP Form 2 (2026)</p>
              <h2>Department of Education</h2>
              <h3>
                SCHOOL-BASED FEEDING PROGRAM (SBFP) SUMMARY OF BENEFICIARIES
                &amp; START OF FEEDING (SY: {schoolYear})
              </h3>
              <div className="form2-details">
                <label>
                  Schools Division Office:{" "}
                  <input
                    className="sbfp-inline-detail"
                    readOnly={readOnly}
                    value={formDetails.division}
                    onChange={(event) =>
                      updateDetail("division", event.target.value)
                    }
                  />
                </label>
                <label>
                  City/Municipality/Barangay:{" "}
                  <input
                    className="sbfp-inline-detail"
                    readOnly={readOnly}
                    value={formDetails.cityBarangay}
                    onChange={(event) =>
                      updateDetail("cityBarangay", event.target.value)
                    }
                  />
                </label>
                <span>
                  Name of School / School District: {schoolName || "Not set"}
                </span>
                <span>
                  School ID Number: {currentUser?.school_id || "Not set"}
                </span>
                <label>
                  Date of Start of Feeding:{" "}
                  <input
                    className="sbfp-inline-detail"
                    type="text"
                    inputMode="numeric"
                    placeholder="MM/DD/YYYY"
                    value={feedingStartDateDisplay}
                    readOnly={readOnly}
                    title="Enter the feeding start date for all Form 2 rows"
                    onChange={(event) =>
                      updateForm2Detail("feedingStartDate", event.target.value)
                    }
                  />
                </label>
                <label>
                  Last Mile School:{" "}
                  <select
                    value={form2Details.lastMile}
                    disabled={readOnly}
                    onChange={(event) =>
                      updateForm2Detail("lastMile", event.target.value)
                    }
                  >
                    <option value="Y">Y</option>
                    <option value="N">N</option>
                  </select>
                </label>
              </div>
              <div className="sbfp-table-scroll form2-scroll">
                <table className="sbfp-form-table sbfp-form2-table">
                  <colgroup>
                    {Array.from({ length: 21 }, (_, index) => (
                      <col key={index} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th rowSpan="4">
                        Number of School Children by Grade Level
                      </th>
                      <th rowSpan="4">Sex</th>
                      <th colSpan="10">No. of Primary Targets</th>
                      <th colSpan="5">No. of Secondary Targets</th>
                      <th rowSpan="4">No. of Learners Dewormed</th>
                      <th rowSpan="4">No. of 4Ps Beneficiaries</th>
                      <th rowSpan="4">Previous-Year Beneficiaries</th>
                      <th rowSpan="4">Date Feeding Started/Ended</th>
                    </tr>
                    <tr>
                      <th colSpan="10">
                        Nutritional Status at Start/End of Feeding
                      </th>
                      <th rowSpan="3">
                        Adolescent Pregnant Learners / Mothers
                      </th>
                      <th rowSpan="3">PARDOs</th>
                      <th rowSpan="3">Stunted / Severely Stunted</th>
                      <th rowSpan="3">Indigent Learners</th>
                      <th rowSpan="3">Indigenous Peoples</th>
                    </tr>
                    <tr>
                      <th colSpan="5">WEIGHT</th>
                      <th colSpan="5">HEIGHT</th>
                    </tr>
                    <tr>
                      <th>SW</th>
                      <th>W</th>
                      <th>Normal</th>
                      <th>OW + O</th>
                      <th>Total</th>
                      <th>SS</th>
                      <th>S</th>
                      <th>Normal</th>
                      <th>Tall</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form2Rows.map((row, index) => (
                      <tr
                        key={`${row.label}-${row.sex}-${index}`}
                        className={row.sex === "Total" ? "form2-total-row" : ""}
                      >
                        {index % 3 === 0 && (
                          <td rowSpan="3" className="form2-grade-cell">
                            {row.label}
                          </td>
                        )}
                        {[
                          row.sex,
                          row.sw,
                          row.wasted,
                          row.normal,
                          row.over,
                          row.total,
                          row.ss,
                          row.stunted,
                          row.hNormal,
                          row.tall,
                          row.total,
                          row.adolescent,
                          row.pardo,
                          row.stuntedTotal,
                          row.indigent,
                          row.indigenous,
                          row.dewormed,
                          row.fourPs,
                          row.repeaters,
                          feedingStartDateDisplay,
                        ].map((value, cell) => (
                          <td key={cell}>
                            {cell === 19 && index === 0 ? (
                              <input
                                className="form2-feeding-date-input"
                                type="text"
                                inputMode="numeric"
                                placeholder="MM/DD/YYYY"
                                value={feedingStartDateDisplay}
                                readOnly={readOnly}
                                aria-label="Date feeding started or ended for all rows"
                                onChange={(event) =>
                                  updateForm2Detail(
                                    "feedingStartDate",
                                    event.target.value,
                                  )
                                }
                              />
                            ) : (
                              value
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form2-signatures">
                <span>Prepared by: {formDetails.focalPerson}</span>
                <span>Approved by: {formDetails.principal}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
