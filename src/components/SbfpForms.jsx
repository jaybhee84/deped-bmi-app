import React, { useEffect, useMemo, useRef, useState } from "react";
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
function age(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  const d = new Date(+m[1], +m[2] - 1, +m[3]),
    n = new Date();
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
  currentUser,
  schoolName,
  readOnly = false,
  initialSchoolYear = "2026–2027",
  initialPeriod = "Baseline",
}) {
  const [form, setForm] = useState("form1"),
    [schoolYear, setSchoolYear] = useState(initialSchoolYear),
    [period, setPeriod] = useState(initialPeriod),
    [config, setConfig] = useState(DEFAULT_SBFP_CONFIG),
    [downloading, setDownloading] = useState(false);
  const [formDetails, setFormDetails] = useState(() =>
    initialFormDetails(currentUser, schoolName),
  );
  const [yesNoEdits, setYesNoEdits] = useState({});
  const [selectedCells, setSelectedCells] = useState([]);
  const [form2Details, setForm2Details] = useState(() =>
    initialForm2Details(currentUser, schoolName),
  );
  const selectingCells = useRef(false);
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
              heightCm,
              bmi,
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
  const batchFeedingDate = useMemo(
    () =>
      beneficiaries
        .map((student) => student.rec?.date)
        .filter(Boolean)
        .sort()[0] || "",
    [beneficiaries],
  );
  const feedingStartDate = batchFeedingDate || form2Details.feedingStartDate;
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
  };
  const exportBeneficiaries = beneficiaries.map((student, index) => ({
    ...student,
    dewormed:
      yesNoEdits[yesNoKey(student, index, "dewormed")] ?? student.dewormed,
    parentConsent:
      yesNoEdits[yesNoKey(student, index, "parentConsent")] ??
      student.parentConsent,
    member4ps:
      yesNoEdits[yesNoKey(student, index, "member4ps")] ?? student.member4ps,
    previousSbfpBeneficiary:
      yesNoEdits[yesNoKey(student, index, "previousSbfp")] ??
      student.previousSbfpBeneficiary,
  }));
  const form2Rows = buildForm2Rows(exportBeneficiaries);
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
            Official School-Based Feeding Program forms for qualified
            beneficiaries.
          </p>
        </div>
        <div className="sbfp-forms-filters">
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
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {QUARTERS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="sbfp-form-tabs">
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
      {form === "form1" ? (
        <>
          <button
            className="sbfp-download-button"
            disabled={downloading}
            onClick={download}
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
                          ["dewormed", student.dewormed],
                          ["parentConsent", student.parentConsent],
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
                    readOnly={readOnly || Boolean(batchFeedingDate)}
                    title={
                      batchFeedingDate
                        ? "Date loaded from Batch Entry"
                        : "No Batch Entry date found; enter a date"
                    }
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
                          <td key={cell}>{value}</td>
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
