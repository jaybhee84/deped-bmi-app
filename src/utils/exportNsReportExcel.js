import { strToU8, zipSync } from "fflate";
import { getSchoolAbbreviation } from "./schoolLogoMap";

// Builds the Nutritional Status Report as .xlsx with the same layout as the
// on-screen Folio sheet and its printout (see NsReportSheet.jsx): one
// worksheet per class, built from buildNsReportClasses(). An optional first
// "Summary" worksheet holds the grade-level summary of the same learners.

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const COLS = "ABCDEFGHIJK".split("");
// Printed table proportions, widened so Arial headers fit Excel's character widths.
const WIDTHS = [27, 11.5, 7, 8.5, 4.3, 7.5, 3.3, 3.3, 6.5, 15, 16];
const EMU_PER_PX = 9525;
const SEAL_PX = 48; // 36pt
// Excel paper size 14 is "Folio 8.5 x 13 in".
const FOLIO_PAPER = 14;

const xml = (value) => String(value ?? "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const documentXml = (body) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`;
const numeric = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const SUMMARY_BMI = ["Severely Wasted", "Wasted", "Normal", "Overweight", "Obese"];
const SUMMARY_HFA = ["Severely Stunted", "Stunted", "Normal", "Tall"];

// Use UTC calendar dates so exports do not shift birthdays with the user's timezone.
function excelDate(value) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!iso) return null;
  const [year, month, day] = iso.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return (date.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
}

// "June 09, 2026", as printed after "Date of Weighing:".
function longDate(value) {
  const serial = excelDate(value);
  if (serial == null) return "—";
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return date.toLocaleDateString("en-US", { month: "long", day: "2-digit", year: "numeric", timeZone: "UTC" });
}

// Style indexes into STYLES_XML's cellXfs.
const S = {
  plain: 0, title: 1, subtitle: 2, metaLeft: 3, metaRight: 4, th: 5, thBold: 6,
  name: 7, center: 8, date: 9, dec3: 10, dec4: 11, dec2: 12, tallyTh: 13, tallyTd: 14,
  formula: 15, signLabel: 16, signLine: 17, signName: 18, signTitle: 19,
  pct: 20, totalNum: 21, totalPct: 22, sumTh: 23, right: 24,
};

const font = (size, { bold = false, color = "FF000000" } = {}) =>
  `<font>${bold ? "<b/>" : ""}<sz val="${size}"/><color rgb="${color}"/><name val="Arial"/><family val="2"/></font>`;
const thin = (color) => `<left style="thin"><color rgb="${color}"/></left><right style="thin"><color rgb="${color}"/></right><top style="thin"><color rgb="${color}"/></top><bottom style="thin"><color rgb="${color}"/></bottom>`;
const xf = (fontId, { fill = 0, border = 0, numFmt = 0, h = "center", v = "center", wrap = false, shrink = false } = {}) =>
  `<xf numFmtId="${numFmt}" fontId="${fontId}" fillId="${fill}" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${h}" vertical="${v}"${wrap ? ' wrapText="1"' : ""}${shrink ? ' shrinkToFit="1"' : ""}/></xf>`;

const STYLES_XML = `<styleSheet xmlns="${NS}">
<numFmts count="4"><numFmt numFmtId="164" formatCode="mm/dd/yyyy"/><numFmt numFmtId="165" formatCode="0.000"/><numFmt numFmtId="166" formatCode="0.0000"/><numFmt numFmtId="167" formatCode="0.00"/></numFmts>
<fonts count="7">${[
  font(10), font(10, { bold: true }), font(11), font(11, { bold: true }),
  font(7), font(11, { color: "FF374151" }), font(11, { bold: true, color: "FF111827" }),
].join("")}</fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2EDE9"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="4"><border><left/><right/><top/><bottom/><diagonal/></border><border>${thin("FF000000")}<diagonal/></border><border>${thin("FF999999")}<diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF333333"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="25">${[
  xf(0, { h: "general" }),
  xf(6), xf(5), xf(1, { h: "left" }), xf(1, { h: "right" }),
  xf(0, { border: 1, wrap: true }), xf(1, { border: 1, wrap: true }),
  xf(0, { border: 1, h: "left", shrink: true }), xf(0, { border: 1 }),
  xf(0, { border: 1, numFmt: 164 }), xf(0, { border: 1, numFmt: 165 }), xf(0, { border: 1, numFmt: 166 }), xf(0, { border: 1, numFmt: 167 }),
  xf(1, { border: 2, fill: 2 }), xf(0, { border: 2 }),
  xf(4, { h: "left" }), xf(2, { h: "left", v: "bottom" }), xf(0, { border: 3 }), xf(6), xf(5),
  // Summary sheet: percentage (built-in format 10 is 0.00%), total rows, header.
  xf(0, { border: 1, numFmt: 10 }), xf(1, { border: 1, fill: 2 }), xf(1, { border: 1, fill: 2, numFmt: 10 }),
  xf(1, { border: 1, fill: 2, wrap: true }), xf(0, { h: "right" }),
].join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cellXml(address, style, value) {
  const attrs = `r="${address}" s="${style}"`;
  if (value == null || value === "") return `<c ${attrs}/>`;
  if (typeof value === "number") return `<c ${attrs}><v>${value}</v></c>`;
  if (Array.isArray(value)) {
    // Rich text runs: [[text, bold], ...]
    const runs = value.map(([text, bold]) => `<r><rPr>${bold ? "<b/>" : ""}<sz val="7"/><rFont val="Arial"/></rPr><t xml:space="preserve">${xml(text)}</t></r>`).join("");
    return `<c ${attrs} t="inlineStr"><is>${runs}</is></c>`;
  }
  // Inline strings also keep names beginning with '=' from becoming formulas.
  return `<c ${attrs} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function cleanSheetName(value, used) {
  const base = String(value || "Nutritional Status")
    .replace(/[\u0000-\u001F[\]:*?/\\]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31).replace(/'+$/g, "") || "Nutritional Status";
  let name = base;
  let number = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` ${number++}`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(name.toLowerCase());
  return name;
}

// One worksheet: { xml, endRow, h1, h2, sealRow }.
function buildSheet(reportClass, meta, hasSeal) {
  const { rows, bmiTally, hfaTally } = reportClass;
  const sheetRows = [];
  const merges = [];
  let r = 0;
  // Adds one row. cells: { A: [style, value], ... }; every column gets a cell so borders render.
  const add = (height, cells = {}, fill = S.plain) => {
    r++;
    const xmlCells = COLS.map((col) => {
      const [style, value] = cells[col] || [fill, null];
      return cellXml(`${col}${r}`, style, value);
    }).join("");
    sheetRows.push(`<row r="${r}" ht="${height}" customHeight="1">${xmlCells}</row>`);
    return r;
  };
  const merge = (from, to, row, row2 = row) => merges.push(`${from}${row}:${to}${row2}`);
  const across = (style, value) => ({ A: [style, value] });

  // Header: seal above the centered title block.
  const sealRow = add(hasSeal ? 40 : 6);
  const titleLines = [
    [S.title, "NUTRITIONAL STATUS REPORT"],
    [S.title, meta.schoolName || "School not set"],
    ...(meta.address ? [[S.subtitle, meta.address]] : []),
    [S.subtitle, `${meta.period} SY ${String(meta.schoolYear || "").replace(/[–—]/g, "-")}`],
  ];
  for (const [style, text] of titleLines) merge("A", "K", add(14, across(style, text)));
  add(6);
  const metaRow = add(15, {
    A: [S.metaLeft, `Date of Weighing: ${longDate(reportClass.weighingDate)}`],
    F: [S.metaRight, reportClass.section],
  });
  merge("A", "E", metaRow); merge("F", "K", metaRow);

  // Table header (two rows, "Age" spans y / m).
  const h1 = add(27, {
    A: [S.th, "Names"], B: [S.th, "Birthday\nmm/dd/yyyy"], C: [S.th, "Weight\n(kg)"], D: [S.th, "Height\n(meters)"],
    E: [S.th, "Sex"], F: [S.th, "Height²\n(m²)"], G: [S.th, "Age"], H: [S.th, null], I: [S.th, "Body\nMass\nIndex"],
    J: [S.thBold, "Nutritional\nStatus"], K: [S.thBold, "Height-For-Age"],
  }, S.th);
  const h2 = add(13, { G: [S.thBold, "y"], H: [S.thBold, "m"], J: [S.thBold, null], K: [S.thBold, null] }, S.th);
  for (const col of "ABCDEFIJK") merge(col, col, h1, h2);
  merge("G", "H", h1);

  rows.forEach((row, i) => {
    add(13.5, {
      A: [S.name, `${i + 1}. ${row.name}`], B: [S.date, excelDate(row.birthdate) ?? "—"], C: [S.center, numeric(row.weightKg) ?? "—"],
      D: [S.dec3, numeric(row.heightMeters) ?? "—"], E: [S.center, row.sex || "—"], F: [S.dec4, numeric(row.heightSquared) ?? "—"],
      G: [S.center, row.years ?? "—"], H: [S.center, row.months ?? "—"], I: [S.dec2, numeric(row.bmi) ?? "—"],
      J: [S.center, row.bmiStatus || "—"], K: [S.center, row.hfaStatus || "—"],
    });
  });

  // Exactly one empty row after the last learner, then the tallies side by side:
  // BMI in A–D, HFA in F–K (label F:H).
  add(13.5);
  const th = add(13.5, {
    A: [S.tallyTh, "Body Mass Index"], B: [S.tallyTh, "M"], C: [S.tallyTh, "F"], D: [S.tallyTh, "T"],
    F: [S.tallyTh, "HFA"], G: [S.tallyTh, null], H: [S.tallyTh, null], I: [S.tallyTh, "M"], J: [S.tallyTh, "F"], K: [S.tallyTh, "TOTAL"],
  });
  merge("F", "H", th);
  bmiTally.forEach((bmi, i) => {
    const cells = { A: [S.tallyTd, bmi.label], B: [S.tallyTd, bmi.M], C: [S.tallyTd, bmi.F], D: [S.tallyTd, bmi.T] };
    const hfa = hfaTally[i];
    if (hfa) {
      Object.assign(cells, {
        F: [S.tallyTd, hfa.label], G: [S.tallyTd, null], H: [S.tallyTd, null],
        I: [S.tallyTd, hfa.M], J: [S.tallyTd, hfa.F], K: [S.tallyTd, hfa.T],
      });
    }
    const row = add(13.5, cells);
    if (hfa) merge("F", "H", row);
  });
  const formula = add(12, { A: [S.formula, [["Body Mass Index = ", true], ["Weight (kgs) / Height squared (m²)", false]]] });
  merge("A", "E", formula);

  // Signature block on the right, with one blank line under "Prepared by:".
  add(12);
  const label = add(15, { J: [S.signLabel, "Prepared by:"] }); merge("J", "K", label);
  add(15);
  const line = add(15, { J: [S.signLine, null], K: [S.signLine, null] }); merge("J", "K", line);
  const nameRow = add(15, { J: [S.signName, reportClass.preparedBy || "—"] }); merge("J", "K", nameRow);
  const titleRow = add(15, { J: [S.signTitle, "Class Adviser"] }); merge("J", "K", titleRow);
  const endRow = r;

  const columns = WIDTHS.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("");
  const sheet = `<worksheet xmlns="${NS}" xmlns:r="${REL}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:K${endRow}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${h2}" topLeftCell="A${h2 + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${h2 + 1}" sqref="A${h2 + 1}"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${columns}</cols><sheetData>${sheetRows.join("")}</sheetData><mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.35" right="0.35" top="0.35" bottom="0.35" header="0.2" footer="0.2"/><pageSetup paperSize="${FOLIO_PAPER}" orientation="portrait" fitToWidth="1" fitToHeight="0"/>${hasSeal ? '<drawing r:id="rId1"/>' : ""}</worksheet>`;
  return { xml: sheet, endRow, h1, h2, sealRow, lastCol: "K" };
}

// Summary worksheet (A–Y): grade level by sex, as on the printed summary.
const SUMMARY_COLS = "ABCDEFGHIJKLMNOPQRSTUVWXY".split("");
const SUMMARY_WIDTHS = [13, 6, 10, ...Array(22).fill(7.6)];

// summary: { title, date, rows: [{ grade, M, F, Total }], grand: { M, F, Total } },
// each of M / F / Total being { enrolment, weighed, takenHeight, bmi, hfa }.
function buildSummarySheet(summary, meta, hasSeal = false) {
  const sheetRows = [];
  const merges = [];
  let r = 0;
  const add = (height, cells = {}, fill = S.plain) => {
    r++;
    const xmlCells = SUMMARY_COLS.map((col) => {
      const [style, value] = cells[col] || [fill, null];
      return cellXml(`${col}${r}`, style, value);
    }).join("");
    sheetRows.push(`<row r="${r}" ht="${height}" customHeight="1">${xmlCells}</row>`);
    return r;
  };
  const merge = (from, to, row, row2 = row) => merges.push(`${from}${row}:${to}${row2}`);

  const sealRow = hasSeal ? add(40) : null;
  const titleLines = [
    [S.subtitle, "Department of Education"],
    [S.subtitle, "Bureau of Learner Support Services"],
    [S.subtitle, "School Health Division"],
    [S.title, `NUTRITIONAL STATUS REPORT OF ${String(meta.schoolName || "School not set").toUpperCase()}`],
    [S.subtitle, `${String(meta.period || "").toUpperCase()} SY ${String(meta.schoolYear || "").replace(/[–—]/g, "-")}`],
    ...(summary.title ? [[S.title, summary.title]] : []),
  ];
  for (const [style, text] of titleLines) merge("A", "Y", add(15, { A: [style, text] }));
  add(6);

  // Three header rows; every statistic is a "No." and "%" pair.
  const pairs = (first, labels) => Object.fromEntries(labels.map((label, i) => [SUMMARY_COLS[first + i * 2], [S.sumTh, label]]));
  const h1 = add(18, {
    A: [S.sumTh, "Grade Levels"], B: [S.sumTh, "Sex"], C: [S.sumTh, "Enrolment"], D: [S.sumTh, "Pupils Weighed"],
    F: [S.sumTh, "Body Mass Index (BMI)"], P: [S.sumTh, "Height-for-Age (HFA)"], X: [S.sumTh, "Pupils Taken Height"],
  }, S.sumTh);
  const h2 = add(28, { ...pairs(5, SUMMARY_BMI), ...pairs(15, SUMMARY_HFA) }, S.sumTh);
  const h3 = add(15, Object.fromEntries(SUMMARY_COLS.slice(3).map((col, i) => [col, [S.sumTh, i % 2 ? "%" : "No."]])), S.sumTh);
  for (const col of "ABC") merge(col, col, h1, h3);
  merge("D", "E", h1, h2); merge("X", "Y", h1, h2);
  merge("F", "O", h1); merge("P", "W", h1);
  for (let i = 5; i < 23; i += 2) merge(SUMMARY_COLS[i], SUMMARY_COLS[i + 1], h2);

  const ratio = (n, d) => (d ? n / d : 0);
  const statCells = (label, stats, total) => {
    const num = total ? S.totalNum : S.center;
    const pct = total ? S.totalPct : S.pct;
    const values = [
      stats.enrolment,
      stats.weighed, ratio(stats.weighed, stats.enrolment),
      ...SUMMARY_BMI.flatMap((key) => [stats.bmi[key] || 0, ratio(stats.bmi[key] || 0, stats.weighed)]),
      ...SUMMARY_HFA.flatMap((key) => [stats.hfa[key] || 0, ratio(stats.hfa[key] || 0, stats.takenHeight)]),
      stats.takenHeight, ratio(stats.takenHeight, stats.enrolment),
    ];
    const cells = { B: [num, label] };
    // Column C is the enrolment count; after it the values alternate No., %.
    values.forEach((value, i) => { cells[SUMMARY_COLS[i + 2]] = [i && i % 2 === 0 ? pct : num, value]; });
    return cells;
  };
  const group = (label, { M, F, Total }, grand = false) => {
    const labelStyle = grand ? S.totalNum : S.thBold;
    const first = add(15, { A: [labelStyle, label], ...statCells("M", M, grand) }, labelStyle);
    add(15, statCells("F", F, grand), labelStyle);
    const last = add(15, statCells("Total", Total, true), labelStyle);
    merge("A", "A", first, last);
  };
  summary.rows.forEach((row) => group(row.grade, row));
  group("GRAND TOTAL", summary.grand, true);

  if (summary.date) {
    add(6);
    merge("A", "Y", add(15, { A: [S.right, `Date Generated: ${summary.date}`] }));
  }
  const endRow = r;

  const columns = SUMMARY_WIDTHS.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("");
  const sheet = `<worksheet xmlns="${NS}" xmlns:r="${REL}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:Y${endRow}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${h3}" topLeftCell="A${h3 + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${h3 + 1}" sqref="A${h3 + 1}"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${columns}</cols><sheetData>${sheetRows.join("")}</sheetData><mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.4" right="0.4" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="${FOLIO_PAPER}" orientation="landscape" fitToWidth="1" fitToHeight="0"/>${hasSeal ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
  return { xml: sheet, endRow, h1, h2: h3, sealRow, lastCol: "Y", widths: SUMMARY_WIDTHS };
}

function sealDrawingXml(sealRow, widths = WIDTHS) {
  // Center the seal horizontally over the sheet's used width.
  const colPx = widths.map((w) => Math.trunc(w * 7 + 5));
  let x = (colPx.reduce((a, b) => a + b, 0) - SEAL_PX) / 2;
  let col = 0;
  while (x >= colPx[col]) x -= colPx[col++];
  const size = SEAL_PX * EMU_PER_PX;
  return `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}"><xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>${Math.round(x * EMU_PER_PX)}</xdr:colOff><xdr:row>${sealRow - 1}</xdr:row><xdr:rowOff>${2 * EMU_PER_PX}</xdr:rowOff></xdr:from><xdr:ext cx="${size}" cy="${size}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="DepEd seal"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${size}" cy="${size}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;
}

/**
 * Create the report workbook. `classes` comes from buildNsReportClasses();
 * meta = { schoolName, address, period, schoolYear }. `seal` is optional PNG
 * bytes for the DepEd seal. `summary` (see buildSummarySheet) adds a first
 * "Summary" worksheet ahead of the class sheets.
 */
export function createNsReportWorkbook(classes, meta, seal = null, summary = null) {
  const list = classes.length || summary ? classes : [{
    section: "No Learners", rows: [], weighingDate: "", preparedBy: "",
    bmiTally: [], hfaTally: [],
  }];
  const files = {};
  const addXml = (name, content) => { files[name] = strToU8(documentXml(content)); };
  const relationships = (entries) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join("")}</Relationships>`;

  const usedNames = new Set();
  const builtSheets = [
    ...(summary ? [{ ...buildSummarySheet(summary, meta, Boolean(seal)), name: cleanSheetName("Summary", usedNames), seal: Boolean(seal) }] : []),
    ...list.map((reportClass) => ({
      ...buildSheet(reportClass, meta, Boolean(seal)),
      name: cleanSheetName(reportClass.section, usedNames),
      seal: Boolean(seal),
    })),
  ];
  const sheets = builtSheets.map((built, index) => {
    const n = index + 1;
    addXml(`xl/worksheets/sheet${n}.xml`, built.xml);
    if (built.seal) {
      addXml(`xl/worksheets/_rels/sheet${n}.xml.rels`, relationships([["rId1", "drawing", `../drawings/drawing${n}.xml`]]));
      addXml(`xl/drawings/_rels/drawing${n}.xml.rels`, relationships([["rId1", "image", "../media/seal.png"]]));
      addXml(`xl/drawings/drawing${n}.xml`, sealDrawingXml(built.sealRow, built.widths));
    }
    return { ...built, n };
  });
  if (seal) files["xl/media/seal.png"] = seal;

  const overrides = sheets.map(({ n, seal: hasSeal }) =>
    `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    (hasSeal ? `<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : ""),
  ).join("");
  addXml("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`);
  addXml("_rels/.rels", relationships([["rId1", "officeDocument", "xl/workbook.xml"]]));
  addXml("xl/_rels/workbook.xml.rels", relationships([
    ...sheets.map(({ n }) => [`rId${n}`, "worksheet", `worksheets/sheet${n}.xml`]),
    [`rId${sheets.length + 1}`, "styles", "styles.xml"],
  ]));
  addXml("xl/styles.xml", STYLES_XML);
  const definedNames = sheets.map(({ n, name, endRow, h1, h2, lastCol }) => {
    const printName = xml(`'${name.replace(/'/g, "''")}'`);
    return `<definedName name="_xlnm.Print_Area" localSheetId="${n - 1}">${printName}!$A$1:$${lastCol}$${endRow}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="${n - 1}">${printName}!$${h1}:$${h2}</definedName>`;
  }).join("");
  addXml("xl/workbook.xml", `<workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets>${sheets.map(({ n, name }) => `<sheet name="${xml(name)}" sheetId="${n}" r:id="rId${n}"/>`).join("")}</sheets><definedNames>${definedNames}</definedNames></workbook>`);
  return zipSync(files, { level: 6 });
}

// <School>_NS_Report_<Period>_<school-year start>[_<Adviser>].xlsx, e.g.
// IECES_NS_Report_Baseline_2026_ROSALIE_E_POLIQUIT.xlsx for a single class.
export function nsReportFilename(classes, meta) {
  // Accents are dropped (Peña -> Pena) so the name is safe on every file system.
  const slug = (value) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const school = getSchoolAbbreviation(meta.schoolName) || slug(meta.schoolName) || "School";
  const startYear = /\d{4}/.exec(String(meta.schoolYear || ""))?.[0] || "";
  const adviser = classes.length === 1 ? slug(classes[0].preparedBy).toUpperCase() : "";
  return `${[slug(school), "NS_Report", slug(meta.period), startYear, adviser].filter(Boolean).join("_")}.xlsx`;
}

// The source seal is large; a 192px copy keeps the file small and still prints sharp at 36pt.
async function loadSeal() {
  try {
    const { default: sealUrl } = await import("../images/deped.png");
    const image = new Image();
    image.src = sealUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 192;
    canvas.getContext("2d").drawImage(image, 0, 0, 192, 192);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null; // The report is still useful without the seal.
  }
}

// options: { summary, filename } - a first Summary sheet and a file name
// other than the NS Report default.
export async function exportNsReportExcel(classes, meta, { summary = null, filename = "" } = {}) {
  const bytes = createNsReportWorkbook(classes, meta, await loadSeal(), summary);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || nsReportFilename(classes, meta);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Let the browser/Electron consume the download before releasing its bytes.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
