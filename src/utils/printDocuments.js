// Print documents for the summary reports, rendered by the in-app Print
// Preview. All are laid out for Folio (8.5 × 13 in).
import { escapeHtml, htmlDocument } from "../components/PrintPreview/printDocument";

const BMI_LABELS = ["Severely Wasted", "Wasted", "Normal", "Overweight", "Obese"];
const HFA_LABELS = ["Severely Stunted", "Stunted", "Normal", "Tall"];

function pct(n, d) {
  if (!d) return "0.00%";
  return ((n / d) * 100).toFixed(2) + "%";
}

function statCellsHtml(stats) {
  const cells = [
    `<td class="num">${stats.enrolment}</td>`,
    `<td class="num">${stats.weighed}</td>`,
    `<td class="num pct">${pct(stats.weighed, stats.enrolment)}</td>`,
  ];
  BMI_LABELS.forEach((label) => {
    cells.push(`<td class="num">${stats.bmi[label] || 0}</td>`);
    cells.push(`<td class="num pct">${pct(stats.bmi[label] || 0, stats.weighed)}</td>`);
  });
  HFA_LABELS.forEach((label) => {
    cells.push(`<td class="num">${stats.hfa[label] || 0}</td>`);
    cells.push(`<td class="num pct">${pct(stats.hfa[label] || 0, stats.takenHeight)}</td>`);
  });
  cells.push(`<td class="num">${stats.takenHeight}</td>`);
  cells.push(`<td class="num pct">${pct(stats.takenHeight, stats.enrolment)}</td>`);
  return cells.join("");
}

function gradeGroupHtml(label, M, F, Total, grand = false) {
  const labelClass = grand ? "row-label grand-total-label" : "row-label grade-col";
  const rowClass = grand ? ' class="row-total"' : "";
  return `
    <tr${rowClass}><td class="${labelClass}" rowspan="3">${escapeHtml(label)}</td><td class="row-label">M</td>${statCellsHtml(M)}</tr>
    <tr${rowClass}><td class="row-label">F</td>${statCellsHtml(F)}</tr>
    <tr class="row-total"><td class="row-label">Total</td>${statCellsHtml(Total)}</tr>`;
}

function summaryPageHtml({ meta, rows, grand }) {
  const bmiHeaders = BMI_LABELS.map((label) => `<th colspan="2">${label}</th>`).join("");
  const hfaHeaders = HFA_LABELS.map((label) => `<th colspan="2">${label}</th>`).join("");
  const noPct = (count) => Array.from({ length: count }, () => "<th>No.</th><th>%</th>").join("");
  return `
    <section class="report-page-block">
      <div class="header">
        <p>Department of Education</p>
        <p>Bureau of Learner Support Services</p>
        <p>School Health Division</p>
        <h2>NUTRITIONAL STATUS REPORT OF ${escapeHtml(String(meta.schoolName || "").toUpperCase())}</h2>
        <p class="period">${escapeHtml(String(meta.period || "").toUpperCase())} SY ${escapeHtml(meta.sy || "")}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th rowspan="3" class="grade-col">Grade Levels</th>
            <th rowspan="3">Sex</th>
            <th rowspan="3">Enrolment</th>
            <th colspan="2" rowspan="2">Pupils Weighed</th>
            <th colspan="10">Body Mass Index (BMI)</th>
            <th colspan="8">Height-for-Age (HFA)</th>
            <th colspan="2" rowspan="2">Pupils Taken Height</th>
          </tr>
          <tr>${bmiHeaders}${hfaHeaders}</tr>
          <tr><th>No.</th><th>%</th>${noPct(BMI_LABELS.length)}${noPct(HFA_LABELS.length)}<th>No.</th><th>%</th></tr>
        </thead>
        <tbody>
          ${rows.map((row) => gradeGroupHtml(row.grade, row.M, row.F, row.Total)).join("")}
          ${gradeGroupHtml("GRAND TOTAL", grand.M, grand.F, grand.Total, true)}
        </tbody>
      </table>
      <p class="footer">Date Printed: ${escapeHtml(meta.date || "")}</p>
    </section>`;
}

const SUMMARY_CSS = `
  body { font-family: Arial, Helvetica, sans-serif; color: #000; }
  .report-page-block { break-inside: avoid; width: 100%; }
  .report-page-block + .report-page-block { break-before: page; }
  .header { text-align: center; margin-bottom: 10px; }
  .header p { margin: 0; font-size: 11px; line-height: 1.3; }
  .header h2 { margin: 4px 0 0; font-size: 15px; font-weight: bold; text-transform: uppercase; }
  .header .period { font-style: italic; font-weight: bold; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 5px; }
  th, td { border: 1px solid #333; padding: 2px 4px; text-align: center; }
  thead th { background: #EFF6FF; font-weight: bold; }
  .grade-col { width: 80px; white-space: normal; word-break: break-word; }
  td.row-label { font-weight: 600; }
  td.grade-col { font-weight: 700; vertical-align: middle; }
  tr.row-total { background: #F3F4F6; font-weight: bold; }
  td.pct { color: #444; }
  td.grand-total-label { white-space: normal; word-break: break-word; vertical-align: middle; font-size: 8px; line-height: 1.15; padding: 2px; }
  .footer { margin-top: 5px; font-size: 10px; text-align: right; }
`;

// Grade-level NS summary (one page per school), Folio landscape.
export function nutritionSummaryDocument(pages, title = "Nutritional Status Report") {
  const list = Array.isArray(pages) ? pages : [pages];
  return {
    orientation: "landscape",
    margin: 0.4,
    html: htmlDocument({
      title,
      orientation: "landscape",
      margin: 0.4,
      css: SUMMARY_CSS,
      body: list.map(summaryPageHtml).join(""),
    }),
  };
}

const LEARNER_LIST_CSS = `
  body { font-family: Arial, sans-serif; color: #000; line-height: 1.2; font-size: 11px; }
  section + section { break-before: page; }
  .header { text-align: center; margin-bottom: 8px; border-bottom: 1.5px solid #000; padding-bottom: 4px; }
  .header h2 { margin: 0 0 2px; font-size: 16px; text-transform: uppercase; }
  .header h3 { margin: 0 0 2px; font-size: 12px; }
  .header h4 { margin: 0; font-size: 11px; color: #333; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 10px; }
  .meta-item { margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 10.5px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid #000; padding: 5px 4px; text-align: left; vertical-align: middle; }
  th { background: #f2f2f2; font-weight: bold; text-transform: uppercase; font-size: 9.5px; }
  .center { text-align: center; }
  .name-cell { font-size: 10px; line-height: 1.1; font-weight: bold; }
`;

// SBFP learner list, one page group per section, Folio portrait.
export function learnerListDocument({ meta, learners }, title = "SBFP Nutritional Report") {
  const sections = new Map();
  learners.forEach((learner) => {
    const section = learner.section || "Unassigned";
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section).push(learner);
  });
  const body = [...sections.entries()].map(([section, list]) => `
    <section>
      <div class="header">
        <h2>Department of Education</h2>
        <h3>School-Based Feeding Program (SBFP)</h3>
        <h4>Nutritional Status Report</h4>
      </div>
      <div class="meta-grid">
        <div>
          <div class="meta-item"><strong>School Name:</strong> ${escapeHtml(meta.schoolName)}</div>
          <div class="meta-item"><strong>School ID:</strong> ${escapeHtml(meta.schoolId)}</div>
          <div class="meta-item"><strong>Section:</strong> ${escapeHtml(section)}</div>
        </div>
        <div style="text-align:right">
          <div class="meta-item"><strong>School Year:</strong> ${escapeHtml(meta.sy)}</div>
          <div class="meta-item"><strong>Assessment Period:</strong> ${escapeHtml(meta.period)}</div>
          <div class="meta-item"><strong>Date Generated:</strong> ${escapeHtml(meta.date)}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:5%" class="center">No.</th>
            <th>Learner's Name</th>
            <th style="width:6%" class="center">Sex</th>
            <th style="width:6%" class="center">Age</th>
            <th style="width:10%" class="center">Wt (kg)</th>
            <th style="width:10%" class="center">Ht (m)</th>
            <th style="width:11%" class="center">BMI</th>
            <th style="width:14%" class="center">BMI Status</th>
            <th style="width:14%" class="center">HFA Status</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((l, i) => `
            <tr>
              <td class="center">${i + 1}</td>
              <td class="name-cell">${escapeHtml(l.name)}</td>
              <td class="center">${escapeHtml(l.sex)}</td>
              <td class="center">${escapeHtml(l.age)}</td>
              <td class="center">${escapeHtml(l.weight)}</td>
              <td class="center">${escapeHtml(l.height)}</td>
              <td class="center">${escapeHtml(l.bmi)}</td>
              <td class="center">${escapeHtml(l.wfa)}</td>
              <td class="center">${escapeHtml(l.hfa)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </section>`).join("");
  return {
    orientation: "portrait",
    margin: 0.4,
    html: htmlDocument({ title, orientation: "portrait", margin: 0.4, css: LEARNER_LIST_CSS, body }),
  };
}
