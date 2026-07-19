import { BrowserWindow, ipcMain } from "electron";
import path from "path";
import os from "os";
import fs from "fs";

const BMI_LABELS = ["Severely Wasted", "Wasted", "Normal", "Overweight", "Obese"];
const HFA_LABELS = ["Severely Stunted", "Stunted", "Normal", "Tall"];

function pct(n, d) {
  if (!d) return "0.00%";
  return ((n / d) * 100).toFixed(2) + "%";
}

function statCellsHtml(stats) {
  const cells = [];
  cells.push(`<td class="num">${stats.enrolment}</td>`);
  cells.push(`<td class="num">${stats.weighed}</td>`);
  cells.push(`<td class="num pct">${pct(stats.weighed, stats.enrolment)}</td>`);
  
  BMI_LABELS.forEach((l) => {
    cells.push(`<td class="num">${stats.bmi[l] || 0}</td>`);
    cells.push(`<td class="num pct">${pct(stats.bmi[l] || 0, stats.weighed)}</td>`);
  });
  
  HFA_LABELS.forEach((l) => {
    cells.push(`<td class="num">${stats.hfa[l] || 0}</td>`);
    cells.push(`<td class="num pct">${pct(stats.hfa[l] || 0, stats.takenHeight)}</td>`);
  });
  
  cells.push(`<td class="num">${stats.takenHeight}</td>`);
  cells.push(`<td class="num pct">${pct(stats.takenHeight, stats.enrolment)}</td>`);
  return cells.join("\n");
}

function gradeGroupHtml(gradeLabel, M, F, Total) {
  return `
    <tr>
      <td class="row-label" rowspan="3">${gradeLabel}</td>
      <td class="row-label">M</td>
      ${statCellsHtml(M)}
    </tr>
    <tr>
      <td class="row-label">F</td>
      ${statCellsHtml(F)}
    </tr>
    <tr class="row-total">
      <td class="row-label">Total</td>
      ${statCellsHtml(Total)}
    </tr>
  `;
}

function buildDepedReportHtml(payload) {
  const { meta, rows, grand } = payload;
  const bodyRows = rows.map((r) => gradeGroupHtml(r.grade, r.M, r.F, r.Total)).join("");
  const grandRows = `
    <tr class="row-total">
      <td class="row-label grand-total-label" rowspan="3">GRAND TOTAL</td>
      <td class="row-label">M</td>
      ${statCellsHtml(grand.M)}
    </tr>
    <tr class="row-total">
      <td class="row-label">F</td>
      ${statCellsHtml(grand.F)}
    </tr>
    <tr class="row-total">
      <td class="row-label">Total</td>
      ${statCellsHtml(grand.Total)}
    </tr>
  `;

  const bmiSubHeaders = BMI_LABELS.map((l) => `<th colspan="2">${l}</th>`).join("");
  const hfaSubHeaders = HFA_LABELS.map((l) => `<th colspan="2">${l}</th>`).join("");
  const noPctHeaders = (count) => Array.from({ length: count }, () => `<th>No.</th><th>%</th>`).join("");

  return `
    <div class="report-page-block">
      <div class="header">
        <p>Department of Education</p>
        <p>Bureau of Learner Support Services</p>
        <p>School Health Division</p>
        <h2>NUTRITIONAL STATUS REPORT OF ${(meta.schoolName || "").toUpperCase()}</h2>
        <p class="period">${(meta.period || "").toUpperCase()} SY ${meta.sy || ""}</p>
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
          <tr>${bmiSubHeaders}${hfaSubHeaders}</tr>
          <tr>
            <th>No.</th><th>%</th>
            ${noPctHeaders(BMI_LABELS.length)}
            ${noPctHeaders(HFA_LABELS.length)}
            <th>No.</th><th>%</th>
          </tr>
        </thead>
        <tbody>${bodyRows}${grandRows}</tbody>
      </table>
      <p class="footer">Date Printed: ${meta.date || ""}</p>
    </div>
  `;
}

function buildPortraitHtml(payload) {
  const groupedSections = {};
  payload.learners.forEach((learner) => {
    const section = learner.section || "Unassigned";
    if (!groupedSections[section]) {
      groupedSections[section] = [];
    }
    groupedSections[section].push(learner);
  });

  const pagesHtml = Object.entries(groupedSections)
    .map(([sectionName, learners], index) => `
    <section style="min-height: 12.3in; ${index > 0 ? "page-break-before: always; break-before: page;" : ""}">
      <div class="header">
        <h2>Department of Education</h2>
        <h3>School-Based Feeding Program (SBFP)</h3>
        <h4>Nutritional Status Report</h4>
      </div>
      <div class="meta-grid">
        <div>
          <div class="meta-item"><strong>School Name:</strong> ${payload.meta.schoolName}</div>
          <div class="meta-item"><strong>School ID:</strong> ${payload.meta.schoolId}</div>
          <div class="meta-item"><strong>Section:</strong> ${sectionName}</div>
        </div>
        <div style="text-align:right">
          <div class="meta-item"><strong>School Year:</strong> ${payload.meta.sy}</div>
          <div class="meta-item"><strong>Assessment Period:</strong> ${payload.meta.period}</div>
          <div class="meta-item"><strong>Date Generated:</strong> ${payload.meta.date}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:5%" class="center">NO.</th>
            <th>Learner's Name</th>
            <th style="width:6%" class="center">Sex</th>
            <th style="width:6%" class="center">Age</th>
            <th style="width:10%" class="center">WWT (KG)</th>
            <th style="width:10%" class="center">HHT (CM)</th>
            <th style="width:11%" class="center">BMI</th>
            <th style="width:14%" class="center">BMI Status</th>
            <th style="width:14%" class="center">HFA Status</th>
          </tr>
        </thead>
        <tbody>
          ${learners.map((l, idx) => `
            <tr>
              <td class="center">${idx + 1}</td>
              <td class="name-cell">${l.name}</td>
              <td class="center">${l.sex}</td>
              <td class="center">${l.age}</td>
              <td class="center">${l.weight}</td>
              <td class="center">${l.height}</td>
              <td class="center">${l.bmi}</td>
              <td class="center">${l.wfa}</td>
              <td class="center">${l.hfa}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `).join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { size: 8.5in 13in portrait !important; margin: 10mm !important; }
          body { font-family: 'Arial', sans-serif; color: #000; line-height: 1.2; margin: 0; font-size: 11px; }
          .header { text-align: center; margin-bottom: 8px; border-bottom: 1.5px solid #000; padding-bottom: 4px; }
          .header h2 { margin: 0 0 2px 0; font-size: 16px; text-transform: uppercase; }
          .header h3 { margin: 0 0 2px 0; font-size: 12px; }
          .header h4 { margin: 0; font-size: 11px; color: #333; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 10px; font-size: 11px; }
          .meta-item { margin-bottom: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 10.5px; }
          th, td { border: 1px solid #000; padding: 5px 4px; text-align: left; vertical-align: middle; }
          th { background-color: #f2f2f2; font-weight: bold; text-transform: uppercase; font-size: 9.5px; }
          .center { text-align: center; }
          .name-cell { font-size: 10px; line-height: 1.1; font-weight: bold; }
        </style>
      </head>
      <body>${pagesHtml}</body>
    </html>
  `;
}

async function processPrintRequest(event, payload) {
  try {
    if (!payload) {
      console.error("🚨 [IPC Main Error]: Received a null/undefined print payload.");
      return; 
    }

    let workerWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    workerWindow.on("page-title-updated", (ev) => ev.preventDefault());

    let htmlContent = "";
    let printOptions = {
      printBackground: true,
      pageSize: "Legal",
      margins: { marginType: "none" },
    };
    let previewConfig = { width: 850, height: 950, title: "Report Preview" };

    const isMultiPage = Array.isArray(payload);

    if (isMultiPage && payload.length === 0) {
      console.error("No pages generated for preview.");
      if (workerWindow) workerWindow.destroy();
      return;
    }

    const targetType = isMultiPage
      ? payload[0]?.reportType
      : payload.reportType;

    if (targetType === "landscape") {
      printOptions.landscape = true;
      previewConfig = { width: 1100, height: 800, title: "DepEd SBFP Nutritional Status Report Preview" };

      let sheets = "";
      if (isMultiPage) {
        sheets = payload
          .map(
            (page, idx) => `
          <div style="
            page-break-before:${idx === 0 ? "auto" : "always"};
            break-before:page;
            width:100%;
          ">
            ${buildDepedReportHtml(page)}
          </div>
          `
          )
          .join("");
      } else {
        sheets = `<div>${buildDepedReportHtml(payload)}</div>`;
      }

      htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              @page { size: legal landscape; margin: 10mm; }
              body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0; padding: 0; width: 100%; }
              .report-page-block { page-break-inside: avoid; break-inside: avoid; width: 100%; display: block; margin-bottom: 20px; }
              .header { text-align: center; margin-bottom: 10px; }
              .header p { margin: 0; font-size: 11px; line-height: 1.3; }
              .header h2 { margin: 4px 0 0; font-size: 15px; font-weight: bold; text-transform: uppercase; }
              .header .period { font-style: italic; font-weight: bold; margin-top: 2px; }
              table { width: 100%; border-collapse: collapse; font-size: 9px; table-layout: auto; margin-bottom: 5px; }
              .grade-col { width: 80px; min-width: 80px; white-space: normal !important; word-break: break-word; text-align: center; }
              th, td { border: 1px solid #333; padding: 2px 4px; text-align: center; }
              thead th { background: #EFF6FF; font-weight: bold; }
              td.row-label { font-weight: 600; }
              td.grade-col { text-align: center !important; vertical-align: middle !important; font-weight: 700; }
              tr.row-total { background: #F3F4F6; font-weight: bold; }
              td.pct { color: #444; }
              td.grand-total-label { white-space: normal; word-break: break-word; text-align: center; vertical-align: middle; font-size: 8px; line-height: 1.15; padding: 2px; }
              .footer { margin-top: 5px; font-size: 10px; text-align: right; }
            </style>
          </head>
          <body>${sheets}</body>
        </html>
      `;
    } else {
      htmlContent = buildPortraitHtml(payload);
      printOptions.landscape = false;
      previewConfig = { width: 850, height: 950, title: "DepEd SBFP 8.5x13 Report Preview" };
    }

    workerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    workerWindow.webContents.on("did-finish-load", async () => {
      try {
        const pdfBuffer = await workerWindow.webContents.printToPDF(printOptions);
        const previewPath = path.join(os.tmpdir(), "sbfp_report_preview.pdf");
        fs.writeFileSync(previewPath, pdfBuffer);

        const previewWindow = new BrowserWindow({
          ...previewConfig,
          parent: BrowserWindow.fromWebContents(event.sender),
          modal: true,
          webPreferences: { plugins: true },
        });
        previewWindow.on("page-title-updated", (ev) => ev.preventDefault());
        previewWindow.setTitle(previewConfig.title);

        previewWindow.loadURL(`file://${previewPath}`);
        workerWindow.destroy();
      } catch (err) {
        console.error("[Print Preview Core Error]:", err);
        if (workerWindow) workerWindow.destroy();
      }
    });
  } catch (globalErr) {
    console.error("[IPC Main Runtime Error]:", globalErr);
  }
}

export function setupPrintHandler() {
  // Listen to both potential channel names to maintain safe integration
  ipcMain.on("generate-print-preview", processPrintRequest);
  ipcMain.on("generate-pdf-preview", processPrintRequest);
}