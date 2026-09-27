import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./PrintPreviewModal.module.css";

const DEBOUNCE_MS = 450;

// Every document in this app is laid out for Folio; other sizes need Fit to page.
const PAPER_SIZES = [
  { value: "match", label: "Folio (8.5 × 13 in)" },
  { value: "A4", label: "A4" },
  { value: "Letter", label: "Letter" },
];

const MARGIN_PRESETS = [
  { value: "match", label: "Document default" },
  { value: "normal", label: "Normal (1\")" },
  { value: "narrow", label: "Narrow (0.25\")" },
  { value: "custom", label: "Custom" },
];

// Validate page ranges before sending the job to Electron and
// disable Print instantly, without a round trip to the main process.
function validatePageRangeString(value, totalPages) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "Enter a page range, e.g. 1-3 or 1,3,5.";
  const parts = trimmed.split(",").map((part) => part.trim());
  if (!parts.length) return "Enter a page range, e.g. 1-3 or 1,3,5.";
  for (const part of parts) {
    const match = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) return `"${part}" is not a valid page or range.`;
    const from = parseInt(match[1], 10);
    const to = match[2] ? parseInt(match[2], 10) : from;
    if (from < 1 || to < from) return `"${part}" is not a valid page or range.`;
    if (totalPages && to > totalPages) return `Page ${to} is past the last page (${totalPages}).`;
  }
  return "";
}

// Expands a validated range string ("1-3, 5") into sorted, unique page numbers.
function expandPageRange(value) {
  const pages = new Set();
  for (const part of String(value).split(",")) {
    const [from, to = from] = part.trim().split("-").map(Number);
    for (let page = from; page <= to; page++) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let pdfjsModulePromise = null;
function loadPdfjs() {
  // Legacy PDF.js supports the portal's Electron Chromium version.
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = (async () => {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsModulePromise;
}

export default function PrintPreviewModal({ onClose, setup }) {
  const declared = setup;
  const [printers, setPrinters] = useState([]);
  const [printersError, setPrintersError] = useState("");
  const [settings, setSettings] = useState({
    printerName: "",
    copies: 1,
    pageRange: "all",
    pageRangeCustom: "",
    orientation: declared.orientation,
    paperSize: "match",
    margins: declared.margins,
    customMargins: declared.customMargins,
    documentPaper: declared.paper,
    documentMargins: declared.customMargins,
    scaleMode: "100",
    scalePercent: 100,
    colorMode: "color",
  });

  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [zoomMode, setZoomMode] = useState("page");
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState("");
  // Pending "continue to the next page?" question during page-by-page printing.
  const [stepPrompt, setStepPrompt] = useState(null);

  const canvasRef = useRef(null);
  const paperStageRef = useRef(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);
  const dialogRef = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.focus();
    return () => { requestIdRef.current++; previousFocus?.focus(); };
  }, []);
  useEffect(() => () => { pdfDoc?.destroy(); }, [pdfDoc]);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.printGetPrinters().then((result) => {
      if (cancelled) return;
      if (!result?.success) {
        setPrintersError(result?.error || "Could not list installed printers.");
        return;
      }
      setPrinters(result.printers || []);
      const defaultPrinter = result.printers?.find((p) => p.isDefault) || result.printers?.[0];
      if (defaultPrinter) {
        setSettings((prev) => ({ ...prev, printerName: defaultPrinter.name }));
      } else {
        setPrintersError("No printers are installed on this computer.");
      }
    }).catch((error) => { if (!cancelled) setPrintersError(error.message); });
    return () => { cancelled = true; };
  }, []);

  const generatePreview = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const result = await window.electronAPI.printRenderPreview({
        ...settings,
        totalPages: numPages,
      });
      if (requestId !== requestIdRef.current) return; // superseded by a newer request
      if (!result?.success) {
        setPreviewError(result?.error || "Could not generate a print preview.");
        setPreviewLoading(false);
        return;
      }
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs.getDocument({ data: base64ToUint8Array(result.base64), isEvalSupported: false }).promise;
      if (requestId !== requestIdRef.current) { await doc.destroy(); return; }
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setCurrentPage((prev) => Math.min(Math.max(prev, 1), doc.numPages));
      setPreviewLoading(false);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("Print preview generation failed:", error);
      setPreviewError(error.message || "Could not generate a print preview.");
      setPreviewLoading(false);
    }
  }, [settings, numPages]);

  // Regenerate whenever a setting that changes the rendered document fires —
  // debounced so dragging/typing (e.g. a custom scale percentage) doesn't
  // trigger a printToPDF() call per keystroke.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      generatePreview();
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.orientation,
    settings.colorMode,
    settings.paperSize,
    settings.margins,
    settings.customMargins.top,
    settings.customMargins.bottom,
    settings.customMargins.left,
    settings.customMargins.right,
    settings.scaleMode,
    settings.scalePercent,

  ]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    let renderTask;
    async function renderCurrentPage() {
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        // Backing store at devicePixelRatio so the preview stays sharp on
        // HiDPI displays — CSS size is the zoomed viewport, canvas.width/height
        // is that times the pixel ratio, matching the standard canvas HiDPI pattern.
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(viewport.width * dpr);
        canvas.height = Math.round(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
      } catch (error) {
        if (cancelled && error.name === "RenderingCancelledException") return;
        console.error("Print preview page rendering failed:", error);
        if (!cancelled) setPreviewError(error.message || "Could not render the preview page.");
      }
    }
    renderCurrentPage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDoc, currentPage, zoom]);

  // Fit calculations use the PDF's own default (scale 1) page size, so they
  // stay correct across orientation/paper-size changes without guessing mm
  // dimensions here too.
  const fitTo = useCallback(async (mode) => {
    if (!pdfDoc || !paperStageRef.current) return;
    const page = await pdfDoc.getPage(currentPage);
    if (!paperStageRef.current) return;
    const base = page.getViewport({ scale: 1 });
    const stage = paperStageRef.current;
    const style = getComputedStyle(stage);
    // Use the scroll area's content box, excluding the toolbar and real CSS
    // padding, so Fit page includes the bottom edge of the paper.
    const widthScale = Math.max(1, stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) / base.width;
    const heightScale = Math.max(1, stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) / base.height;
    setZoom(mode === "width" ? widthScale : Math.min(widthScale, heightScale));
  }, [pdfDoc, currentPage]);

  useEffect(() => {
    const stage = paperStageRef.current;
    if (!stage || !pdfDoc || zoomMode === "manual") return;
    const resize = new ResizeObserver(() => { fitTo(zoomMode); });
    resize.observe(stage);
    fitTo(zoomMode);
    return () => resize.disconnect();
  }, [pdfDoc, fitTo, zoomMode]);

  // Ctrl + mouse wheel zooms the preview (non-passive so the page itself doesn't zoom).
  useEffect(() => {
    const stage = paperStageRef.current;
    if (!stage) return;
    function handleWheel(event) {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoomMode("manual");
      setZoom((z) => Math.min(4, Math.max(0.25, z + (event.deltaY < 0 ? 0.1 : -0.1))));
    }
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, []);

  const pageRangeValidation = settings.pageRange === "custom"
    ? validatePageRangeString(settings.pageRangeCustom, numPages)
    : "";

  const canPrint = Boolean(settings.printerName) && printers.length > 0 && !previewLoading && !previewError && !pageRangeValidation && !printing;

  function updateSetting(patch) {
    if (Object.keys(patch).some(key => ["orientation", "paperSize", "margins", "customMargins", "scaleMode", "scalePercent", "colorMode"].includes(key))) {
      requestIdRef.current++;
      setPreviewLoading(true);
    }
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  function selectedPages() {
    if (settings.pageRange === "current") return [currentPage];
    if (settings.pageRange === "custom") return expandPageRange(settings.pageRangeCustom);
    return Array.from({ length: numPages }, (_, i) => i + 1);
  }

  const askToContinue = (message, page) =>
    new Promise((resolve) => {
      setCurrentPage(page);
      setStepPrompt({ message, page, resolve });
    });

  async function handlePrint() {
    if (!canPrint) return;
    setPrinting(true);
    setPrintError("");
    try {
      const pages = selectedPages();
      const stepped = typeof declared.pagePrompt === "function" && pages.length > 1;
      // Page-by-page mode repeats the whole page sequence for each copy, so
      // every sheet still gets its matching back.
      const jobs = stepped
        ? Array.from({ length: settings.copies }, () => pages).flat()
        : [null];
      for (let i = 0; i < jobs.length; i++) {
        const page = jobs[i];
        if (i > 0 && !(await askToContinue(declared.pagePrompt(page, numPages), page))) {
          setPrinting(false);
          return;
        }
        const result = await window.electronAPI.printExecute(
          page == null
            ? { ...settings, currentPage, totalPages: numPages }
            : { ...settings, copies: 1, pageRange: "custom", pageRangeCustom: String(page), currentPage, totalPages: numPages },
        );
        if (!result?.success) {
          setPrintError(result?.error || "Printing failed.");
          setPrinting(false);
          return;
        }
      }
      setPrinting(false);
      onClose();
    } catch (error) {
      setPrintError(error.message || "Printing failed.");
      setPrinting(false);
    }
  }

  const previewStatusMessage = useMemo(() => {
    if (previewLoading) return "Generating preview…";
    if (previewError) return previewError;
    return "";
  }, [previewLoading, previewError]);

  return (
    <div className={styles.overlay} role="presentation">
      <div ref={dialogRef} tabIndex={-1} className={styles.dialog} role="dialog" aria-modal="true" aria-label="Print Preview" onKeyDown={(event) => {
        if (event.key === "Escape" && !printing) onClose();
        if (event.key !== "Tab") return;
        const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')];
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
        <header className={styles.header}>
          <h2>Print Preview</h2>
          <button type="button" className={styles.closeIconBtn} disabled={printing} onClick={onClose} aria-label="Close print preview">
            ✕
          </button>
        </header>

        <div className={styles.body}>
          <aside className={styles.settingsPanel}>
            <fieldset className={styles.settingsScroll} disabled={printing}>
              <div className={styles.field}>
                <label htmlFor="pp-printer">Printer</label>
                <select
                  id="pp-printer"
                  value={settings.printerName}
                  onChange={(e) => updateSetting({ printerName: e.target.value })}
                  disabled={!printers.length}
                >
                  {printers.length === 0 && <option value="">No printers found</option>}
                  {printers.map((printer) => (
                    <option key={printer.name} value={printer.name}>
                      {printer.displayName}{printer.isDefault ? " (Default)" : ""}
                    </option>
                  ))}
                </select>
                {printersError && <p className={styles.errorText}>{printersError}</p>}
              </div>

              <div className={styles.field}>
                <label htmlFor="pp-copies">Copies</label>
                <input
                  id="pp-copies"
                  type="number"
                  min={1}
                  max={99}
                  value={settings.copies}
                  onChange={(e) => updateSetting({ copies: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })}
                />
              </div>

              <fieldset className={styles.field}>
                <legend>Page range</legend>
                <label className={styles.radioRow}>
                  <input
                    type="radio"
                    name="pageRange"
                    checked={settings.pageRange === "all"}
                    onChange={() => updateSetting({ pageRange: "all" })}
                  />
                  All pages
                </label>
                <label className={styles.radioRow}>
                  <input
                    type="radio"
                    name="pageRange"
                    checked={settings.pageRange === "current"}
                    onChange={() => updateSetting({ pageRange: "current" })}
                  />
                  Current page ({currentPage})
                </label>
                <label className={styles.radioRow}>
                  <input
                    type="radio"
                    name="pageRange"
                    checked={settings.pageRange === "custom"}
                    onChange={() => updateSetting({ pageRange: "custom" })}
                  />
                  Custom
                </label>
                {settings.pageRange === "custom" && (
                  <>
                    <input
                      type="text"
                      className={styles.rangeInput}
                      placeholder="e.g. 1-3, 5"
                      value={settings.pageRangeCustom}
                      onChange={(e) => updateSetting({ pageRangeCustom: e.target.value })}
                    />
                    {pageRangeValidation && <p className={styles.errorText}>{pageRangeValidation}</p>}
                  </>
                )}
              </fieldset>

              <div className={styles.field}>
                <label htmlFor="pp-orientation">Orientation</label>
                <select
                  id="pp-orientation"
                  value={settings.orientation}
                  onChange={(e) => updateSetting({ orientation: e.target.value })}
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="pp-papersize">Paper size</label>
                <select
                  id="pp-papersize"
                  value={settings.paperSize}
                  onChange={(e) => updateSetting({ paperSize: e.target.value })}
                >
                  {PAPER_SIZES.map((size) => (
                    <option key={size.value} value={size.value}>{size.label}</option>
                  ))}
                </select>
                {settings.paperSize !== "match" && settings.paperSize !== declared.paper && (
                  <p className={styles.hintText}>
                    This document is laid out for Folio. Use Fit to page when changing paper size.
                  </p>
                )}
              </div>

              <div className={styles.field}>
                <label htmlFor="pp-margins">Margins</label>
                <select
                  id="pp-margins"
                  value={settings.margins}
                  onChange={(e) => updateSetting({ margins: e.target.value })}
                >
                  {MARGIN_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>{preset.label}</option>
                  ))}
                </select>
                {settings.margins === "custom" && (
                  <div className={styles.marginGrid}>
                    {["top", "bottom", "left", "right"].map((side) => (
                      <label key={side} className={styles.marginField}>
                        {side[0].toUpperCase() + side.slice(1)}
                        <input
                          type="number"
                          min={0}
                          max={3}
                          step={0.1}
                          value={settings.customMargins[side]}
                          onChange={(e) => updateSetting({
                            customMargins: { ...settings.customMargins, [side]: Number(e.target.value) || 0 },
                          })}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.field}>
                <label htmlFor="pp-scale">Scale</label>
                <select
                  id="pp-scale"
                  value={settings.scaleMode}
                  onChange={(e) => updateSetting({ scaleMode: e.target.value })}
                >
                  <option value="100">100%</option>
                  <option value="fit">Fit to page</option>
                  <option value="custom">Custom</option>
                </select>
                {settings.scaleMode === "custom" && (
                  <input
                    type="number"
                    min={10}
                    max={200}
                    className={styles.scaleInput}
                    value={settings.scalePercent}
                    onChange={(e) => updateSetting({ scalePercent: Math.max(10, Math.min(200, Number(e.target.value) || 100)) })}
                  />
                )}
              </div>

              <div className={styles.field}>
                <label htmlFor="pp-color">Color</label>
                <select
                  id="pp-color"
                  value={settings.colorMode}
                  onChange={(e) => updateSetting({ colorMode: e.target.value })}
                >
                  <option value="color">Color</option>
                  <option value="grayscale">Grayscale</option>
                </select>
                <p className={styles.hintText}>Applies to both the preview and printout.</p>
              </div>
            </fieldset>

            {printError && <p className={styles.errorText}>{printError}</p>}

            <div className={styles.actions}>
              <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={printing}>
                Cancel
              </button>
              <button type="button" className={styles.printBtn} onClick={handlePrint} disabled={!canPrint}>
                {printing ? "Printing…" : "Print"}
              </button>
            </div>
          </aside>

          <section className={styles.previewPanel}>
            <div className={styles.previewToolbar}>
              <div className={styles.pageNav}>
                <button
                  type="button"
                  className={styles.navBtn}
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  ‹ Previous
                </button>
                <span className={styles.pageIndicator}>
                  Page {numPages ? currentPage : 0} of {numPages}
                </span>
                <button
                  type="button"
                  className={styles.navBtn}
                  disabled={currentPage >= numPages}
                  onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                >
                  Next ›
                </button>
              </div>
              <div className={styles.zoomControls}>
                <button type="button" className={styles.navBtn} onClick={() => { setZoomMode("manual"); setZoom((z) => Math.max(0.25, z - 0.1)); }}>−</button>
                <span className={styles.zoomIndicator}>{Math.round(zoom * 100)}%</span>
                <button type="button" className={styles.navBtn} onClick={() => { setZoomMode("manual"); setZoom((z) => Math.min(4, z + 0.1)); }}>+</button>
                <button type="button" className={styles.navBtn} onClick={() => { setZoomMode("width"); fitTo("width"); }}>Fit width</button>
                <button type="button" className={styles.navBtn} onClick={() => { setZoomMode("page"); fitTo("page"); }}>Fit page</button>
              </div>
            </div>

            {stepPrompt && (
              <div className={styles.stepPrompt} role="alertdialog" aria-live="assertive" aria-label="Next page">
                <strong>Ready for page {stepPrompt.page} of {numPages}?</strong>
                <p>{stepPrompt.message}</p>
                <div className={styles.stepActions}>
                  <button type="button" className={styles.cancelBtn} onClick={() => { setStepPrompt(null); stepPrompt.resolve(false); }}>
                    Stop printing
                  </button>
                  <button type="button" className={styles.printBtn} autoFocus onClick={() => { setStepPrompt(null); stepPrompt.resolve(true); }}>
                    Continue
                  </button>
                </div>
              </div>
            )}

            <div className={styles.paperStage} ref={paperStageRef}>
              {previewStatusMessage && (
                <div className={previewError ? styles.previewErrorBox : styles.previewLoadingBox}>
                  {previewLoading && <span className={styles.spinner} aria-hidden="true" />}
                  <span>{previewStatusMessage}</span>
                </div>
              )}
              <canvas
                ref={canvasRef}
                className={styles.pageCanvas}
                style={{ display: previewStatusMessage ? "none" : "block" }}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
