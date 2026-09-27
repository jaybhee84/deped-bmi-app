// Page setup shared by the in-app Print Preview and the physical print job.
// Every document in this app is laid out for Folio (8.5 × 13 in).
const PAPERS = { Folio: [8.5, 13], A4: [210 / 25.4, 297 / 25.4], Letter: [8.5, 11] };

function number(value, fallback, min, max) {
  const result = value == null ? fallback : Number(value);
  if (!Number.isFinite(result) || result < min || result > max) throw new Error("Invalid print setting.");
  return result;
}

export function buildSettings(input = {}, document = {}) {
  const nativePaper = document.paper || "Folio";
  const paper = !input.paperSize || input.paperSize === "match" ? nativePaper : input.paperSize;
  if (!PAPERS[paper] || !PAPERS[nativePaper]) throw new Error("Unsupported paper size.");
  const defaultMargin = number(document.margin, 0, 0, 3);
  const margins = {};
  for (const side of ["top", "right", "bottom", "left"]) {
    const preset = input.margins || "match";
    const value = { match: defaultMargin, none: 0, normal: 1, narrow: 0.25, custom: input.customMargins?.[side] }[preset];
    if (value == null) throw new Error("Invalid margins.");
    margins[side] = number(value, 0, 0, 3);
  }
  const orientation = input.orientation || document.orientation;
  const landscape = orientation === "landscape";
  const nativeLandscape = document.orientation === "landscape";
  const [width, height] = landscape ? [...PAPERS[paper]].reverse() : PAPERS[paper];
  const [nativeWidth, nativeHeight] = nativeLandscape ? [...PAPERS[nativePaper]].reverse() : PAPERS[nativePaper];
  let scale = 1;
  if (input.scaleMode === "custom") scale = number(input.scalePercent, 100, 10, 200) / 100;
  if (input.scaleMode === "fit") scale = Math.min(
    (width - margins.left - margins.right) / (nativeWidth - 2 * defaultMargin),
    (height - margins.top - margins.bottom) / (nativeHeight - 2 * defaultMargin),
    2,
  );
  if (scale < 0.1) throw new Error("Margins leave too little space on this paper.");
  const copies = Math.round(number(input.copies, 1, 1, 99));
  const css = `@media print {
    @page { size: ${width}in ${height}in !important; margin: ${margins.top}in ${margins.right}in ${margins.bottom}in ${margins.left}in !important; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; ${input.colorMode === "grayscale" ? "filter: grayscale(1) !important;" : ""} }
  }`;
  return {
    css,
    pdf: { printBackground: true, landscape, preferCSSPageSize: true, scale,
      pageSize: paper === "Folio" ? { width: 8.5, height: 13 } : paper, margins },
    print: { printBackground: true, landscape, color: input.colorMode !== "grayscale",
      pageSize: paper === "Folio" ? { width: 215900, height: 330200 } : paper,
      // Electron's print margins are pixels, whereas PDF margins are inches.
      margins: { marginType: "custom", ...Object.fromEntries(Object.entries(margins).map(([side, inches]) => [side, Math.round(inches * 96)])) },
      scaleFactor: Math.round(scale * 100), copies, collate: true },
  };
}

export function pageRanges(input) {
  if (!input.pageRange || input.pageRange === "all") return null;
  const total = number(input.totalPages, 0, 1, 100000);
  const text = input.pageRange === "current" ? String(input.currentPage) : String(input.pageRangeCustom || "").trim();
  const pages = new Set();
  for (const part of text.split(",")) {
    const match = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!match) throw new Error("Enter a valid page range, such as 1-3, 5.");
    const from = Number(match[1]); const to = Number(match[2] || match[1]);
    if (from < 1 || to < from || to > total) throw new Error(`Page range must be within 1–${total}.`);
    for (let page = from; page <= to; page++) pages.add(page - 1);
  }
  const ranges = [];
  for (const page of [...pages].sort((a, b) => a - b)) {
    const last = ranges[ranges.length - 1];
    if (last && last.to + 1 === page) last.to = page;
    else ranges.push({ from: page, to: page });
  }
  return ranges;
}
