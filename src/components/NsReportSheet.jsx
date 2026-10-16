import React from "react";
import depedSeal from "../images/deped.png";
import { nsLongDate, nsShortDate } from "../utils/nsReportModel";
import "./NsReportSheet.css";

const fixed = (value, digits) => (Number.isFinite(value) ? value.toFixed(digits) : "—");

// Width of a name in em (Arial), so long names shrink to stay on one line.
let measureContext = null;
function textEm(text) {
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return 0;
  measureContext.font = "100px Arial, Helvetica, sans-serif";
  return measureContext.measureText(text).width / 100;
}

function TallyTable({ title, totalLabel, rows }) {
  return (
    <table className="nsr-tally-table">
      <thead>
        <tr><th>{title}</th><th>M</th><th>F</th><th>{totalLabel}</th></tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td className="nsr-tally-label">{row.label}</td>
            <td>{row.M}</td><td>{row.F}</td><td>{row.T}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// One class laid out once as the printed Folio page (8.5 × 13 in, 0.35 in
// margins). The screen shows this same sheet, so the display matches the print.
export default function NsReportSheet({ reportClass, schoolName, address, period, schoolYear, adviserValue, onAdviserChange, adviserChoices = [] }) {
  const { section, rows, weighingDate, preparedBy, defaultPreparedBy, bmiTally, hfaTally } = reportClass;
  // IECES picks from its org chart advisers; keep the current name listed even if it is not there.
  const choices = adviserChoices.length && adviserValue && !adviserChoices.includes(adviserValue)
    ? [adviserValue, ...adviserChoices]
    : adviserChoices;
  return (
    <article className="nsr-report">
      <header className="nsr-report-header">
        <img src={depedSeal} alt="Department of Education seal" className="nsr-seal" />
        <h2>NUTRITIONAL STATUS REPORT</h2>
        <h3>{schoolName || "School not set"}</h3>
        {address && <p>{address}</p>}
        <p>{period} SY {String(schoolYear || "").replace(/[–—]/g, "-")}</p>
      </header>

      <div className="nsr-reference-meta">
        <strong>Date of Weighing: {nsLongDate(weighingDate)}</strong>
        <strong>{section}</strong>
      </div>
      <table className="nsr-reference-table">
        <colgroup>
          {[25, 10, 6, 7, 3.5, 7, 3, 3, 6, 14, 15.5].map((width, index) => (
            <col key={index} style={{ width: `${width}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2}>Names</th><th rowSpan={2}>Birthday<br />mm/dd/yyyy</th>
            <th rowSpan={2}>Weight<br />(kg)</th><th rowSpan={2}>Height<br />(meters)</th>
            <th rowSpan={2}>Sex</th><th rowSpan={2}>Height²<br />(m²)</th>
            <th colSpan={2}>Age</th><th rowSpan={2}>Body<br />Mass<br />Index</th>
            <th rowSpan={2}>Nutritional Status</th><th rowSpan={2}>Height-For-Age</th>
          </tr>
          <tr><th>y</th><th>m</th></tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const name = `${index + 1}. ${row.name}`;
            return (
              <tr key={row.id ?? index}>
                <td className="nsr-reference-name">
                  <div><span style={{ "--name-em": textEm(name) || undefined }}>{name}</span></div>
                </td>
                <td>{nsShortDate(row.birthdate)}</td>
                <td>{row.weightKg ?? "—"}</td>
                <td>{fixed(row.heightMeters, 3)}</td>
                <td>{row.sex || "—"}</td>
                <td>{fixed(row.heightSquared, 4)}</td>
                <td>{row.years ?? "—"}</td>
                <td>{row.months ?? "—"}</td>
                <td>{fixed(row.bmi, 2)}</td>
                <td>{row.bmiStatus || "—"}</td>
                <td>{row.hfaStatus || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="nsr-tally-section">
        <TallyTable title="Body Mass Index" totalLabel="T" rows={bmiTally} />
        <div className="nsr-bmi-formula">
          <strong>Body Mass Index =</strong>
          <div className="nsr-bmi-fraction">
            <span>Weight (kgs)</span>
            <span>Height squared (m²)</span>
          </div>
        </div>
        <TallyTable title="HFA" totalLabel="TOTAL" rows={hfaTally} />
      </div>

      <div className="nsr-signature">
        <span className="nsr-signature-label">Prepared by:</span>
        <div className="nsr-signature-line" />
        <div className="nsr-signature-name-wrap">
          {/* Screen-only editor over the printed name; printing drops .no-print. */}
          {onAdviserChange && choices.length > 0 && (
            <select
              className="nsr-signature-input nsr-signature-select no-print"
              value={adviserValue ?? ""}
              onChange={(event) => onAdviserChange(event.target.value)}
              aria-label={`Class adviser for ${section}`}
              title="Choose the class adviser from the org chart"
            >
              {!adviserValue && <option value="">Select adviser</option>}
              {choices.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          )}
          {onAdviserChange && choices.length === 0 && (
            <input
              className="nsr-signature-input no-print"
              value={adviserValue ?? ""}
              placeholder={defaultPreparedBy || "Type adviser name"}
              onChange={(event) => onAdviserChange(event.target.value)}
              aria-label={`Class adviser for ${section}`}
              title="Click to edit the class adviser name"
              spellCheck={false}
            />
          )}
          <strong className="nsr-signature-name">{preparedBy || "—"}</strong>
        </div>
        <span className="nsr-signature-title">Class Adviser</span>
      </div>
    </article>
  );
}
