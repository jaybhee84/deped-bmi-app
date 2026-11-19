// In-app Print Preview service (same flow as the IECES Portal). The renderer
// hands over a complete HTML document; it is loaded into a hidden, script-free
// window, rendered to PDF for the preview and printed from that same window,
// so what the preview shows is exactly what the printer receives.
import { BrowserWindow, ipcMain } from "electron";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from 'node:url';
import { execFile } from "child_process";
import { createRequire } from "module";
import { buildSettings, pageRanges } from "./print-settings.js";

const require = createRequire(import.meta.url);

// Prints the rendered PDF with SumatraPDF (bundled by pdf-to-printer), naming
// the driver's paper so the printer uses it. The .exe cannot run from inside
// app.asar, so it is unpacked (package.json "asarUnpack").
async function printPdfWithDriverPaper(contents, settings, printerName, paperKind, ranges) {
  const { print } = require("pdf-to-printer");
  const sumatraPdfPath = path
    .join(path.dirname(require.resolve("pdf-to-printer")), "SumatraPDF-3.4.6-32.exe")
    .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  const pdfFile = path.join(os.tmpdir(), `bmi-print-${crypto.randomUUID()}.pdf`);
  let pdf = await contents.printToPDF(settings.pdf);
  let pageCount;
  if (settings.pdf.landscape) {
    // Printers print the top of the sheet first. Draw each landscape page turned
    // clockwise onto an upright page, so the form's left edge (the DepEd seal)
    // is at the top and comes out first. "Flip landscape pages" turns it the
    // other way for printers that feed differently. The turn is drawn into the
    // content, not set as a /Rotate flag SumatraPDF may re-rotate.
    const { PDFDocument, degrees } = require("pdf-lib");
    const source = await PDFDocument.load(pdf);
    const upright = await PDFDocument.create();
    const pages = await upright.embedPages(source.getPages());
    pages.forEach((page) => {
      upright.addPage([page.height, page.width]).drawPage(page, settings.flipLandscape
        ? { x: page.height, y: 0, rotate: degrees(90) }
        : { x: 0, y: page.width, rotate: degrees(-90) });
    });
    pageCount = pages.length;
    pdf = await upright.save();
  }
  await fs.promises.writeFile(pdfFile, pdf, { mode: 0o600 });
  try {
    const options = {
      printer: printerName,
      // SumatraPDF only knows a few paper *names* (A4, Letter...) and silently
      // uses the default paper for others, so pass the driver's paper code.
      paperKind,
      // No orientation: printers feed paper upright and the EPSON driver ignores
      // a "landscape" request (the page came out shrunk). Without it SumatraPDF
      // turns a landscape page sideways onto the upright sheet at full size.
      // Only non-default settings: SumatraPDF 3.4.6 rejected "1x" and "noscale"
      // in testing. Its default "shrink" leaves a PDF that matches the paper as is.
      ...(settings.print.color === false ? { monochrome: true } : {}),
      sumatraPdfPath,
    };
    if (settings.pdf.landscape) {
      // Landscape jobs can come out right-page-first on printer drivers that
      // reverse pages; one-page jobs preserve the form's left-to-right order.
      const pages = ranges?.flatMap(({ from, to }) => Array.from({ length: to - from + 1 }, (_, i) => from + i + 1))
        ?? Array.from({ length: pageCount }, (_, i) => i + 1);
      let submitted = false;
      try {
        for (let copy = 0; copy < settings.print.copies; copy++) {
          for (const page of pages) {
            await print(pdfFile, { ...options, pages: String(page), copies: 1 });
            submitted = true;
          }
        }
      } catch (error) {
        if (submitted) error.partialPrint = true;
        throw error;
      }
    } else {
      await print(pdfFile, {
        ...options,
        ...(settings.print.copies > 1 ? { copies: settings.print.copies } : {}),
        ...(ranges ? { pages: ranges.map(({ from, to }) => (from === to ? `${from + 1}` : `${from + 1}-${to + 1}`)).join(",") } : {}),
      });
    }
  } finally {
    fs.promises.rm(pdfFile, { force: true }).catch(() => {});
  }
}

// Electron often reports no default printer on Windows, so read the one Windows
// uses from the registry ("EPSON L3250 Series,winspool,Ne06:").
function windowsDefaultPrinter() {
  if (process.platform !== "win32") return Promise.resolve("");
  return new Promise((resolve) => {
    execFile(
      "reg",
      ["query", String.raw`HKCU\Software\Microsoft\Windows NT\CurrentVersion\Windows`, "/v", "Device"],
      { windowsHide: true, timeout: 3000 },
      (error, stdout) =>
        resolve(error ? "" : (String(stdout).match(/Device\s+REG_SZ\s+([^,\r\n]+)/) || [])[1]?.trim() || ""),
    );
  });
}

// Paper sizes the printer's Windows driver offers, in inches. The printer name
// goes in through an environment variable so it is never parsed as script.
const PAPER_SIZE_SCRIPT = [
  "Add-Type -AssemblyName System.Drawing",
  "$p = New-Object System.Drawing.Printing.PrinterSettings",
  "$p.PrinterName = $env:BMI_PRINTER_NAME",
  "if ($p.IsValid) { $p.PaperSizes | ForEach-Object { \"$($_.PaperName)`t$($_.Width)`t$($_.Height)`t$($_.RawKind)\" } }",
].join("; ");
function printerPaperSizes(printerName) {
  if (process.platform !== "win32" || !printerName) return Promise.resolve([]);
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", PAPER_SIZE_SCRIPT],
      { windowsHide: true, timeout: 8000, env: { ...process.env, BMI_PRINTER_NAME: printerName } },
      (error, stdout) => {
        if (error) return resolve([]);
        const seen = new Set();
        resolve(String(stdout).split(/\r?\n/).flatMap((line) => {
          const [name, width, height, kind] = line.split("\t");
          // .NET reports hundredths of an inch; skip custom/zero-size entries.
          // kind is the driver's paper code (DMPAPER), e.g. 14 for 8.5 x 13 in.
          const size = { name: name?.trim(), width: Number(width) / 100, height: Number(height) / 100, kind: Number(kind) || 0 };
          if (!size.name || !(size.width >= 1 && size.height >= 1) || seen.has(size.name)) return [];
          seen.add(size.name);
          return [size];
        }));
      },
    );
  });
}

export function setupPrinting(getMainWindow) {
  let sourceWindow = null;
  let documentSetup = null;
  let tempFile = null;
  let queue = Promise.resolve();
  const enqueue = (action) => {
    const pending = queue.then(action).catch((error) => ({ success: false, error: error.message }));
    queue = pending.then(() => {});
    return pending;
  };
  const cleanup = () => {
    if (sourceWindow && !sourceWindow.isDestroyed()) sourceWindow.destroy();
    sourceWindow = null;
    documentSetup = null;
    if (tempFile) fs.rm(tempFile, { force: true }, () => {});
    tempFile = null;
  };
  function handle(channel, action) {
    ipcMain.handle(channel, (event, input) => {
      const main = getMainWindow();
      if (!main || event.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame) {
        return { success: false, error: "Printing is only available from the app window." };
      }
      return enqueue(() => action(input || {}, main));
    });
  }

  handle("print:prepare", async (input) => {
    cleanup();
    // Validate the document defaults before opening a renderer.
    buildSettings({}, input);
    if (typeof input.html !== "string" || !input.html) throw new Error("Nothing to print.");
    if (input.html.length > 40_000_000) throw new Error("The document is too large to print.");
    documentSetup = { paper: input.paper, margin: input.margin, orientation: input.orientation };
    sourceWindow = new BrowserWindow({ show: false, webPreferences: {
      sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false,
      partition: `print-${crypto.randomUUID()}`,
    } });
    sourceWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    sourceWindow.webContents.on("will-navigate", (event) => event.preventDefault());
    try {
      // Load from a temp file: embedded logos easily exceed Chromium's 2 MB
      // URL limit, which makes data: URLs fail with ERR_INVALID_URL.
      tempFile = path.join(os.tmpdir(), `bmi-print-${crypto.randomUUID()}.html`);
      sourceWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
        const allowed = details.url.startsWith('data:') ||
          (details.resourceType === 'mainFrame' && details.url === pathToFileURL(tempFile).href);
        callback({ cancel: !allowed });
      });
      await fs.promises.writeFile(tempFile, input.html, { encoding: 'utf8', mode: 0o600 });
      await sourceWindow.loadFile(tempFile);
    } catch (error) { cleanup(); throw error; }
    return { success: true };
  });

  handle("print:get-printers", async (_input, main) => {
    const [printers, windowsDefault] = await Promise.all([main.webContents.getPrintersAsync(), windowsDefaultPrinter()]);
    const known = printers.some((printer) => printer.name === windowsDefault);
    return {
      success: true,
      printers: printers.map((printer) => ({
        name: printer.name, displayName: printer.displayName || printer.name,
        isDefault: known ? printer.name === windowsDefault : Boolean(printer.isDefault),
      })),
    };
  });

  async function withPrintStyles(input, action) {
    if (!documentSetup || !sourceWindow || sourceWindow.isDestroyed()) {
      throw new Error("Reopen Print Preview to prepare the document.");
    }
    const contents = sourceWindow.webContents;
    const settings = buildSettings(input, documentSetup);
    // Apply identical page rules during PDF preview and physical printing.
    const key = await contents.insertCSS(settings.css);
    try { return await action(contents, settings); }
    finally { if (!contents.isDestroyed()) await contents.removeInsertedCSS(key); }
  }

  handle("print:render-preview", (input) => withPrintStyles(input, async (contents, settings) => {
    // Always preview the complete document: page selections refer to these page numbers.
    const buffer = await contents.printToPDF(settings.pdf);
    return { success: true, base64: buffer.toString("base64") };
  }));

  const paperSizeCache = new Map();
  const cachedPaperSizes = async (printerName) => {
    const name = String(printerName || "").slice(0, 256);
    if (!paperSizeCache.has(name)) paperSizeCache.set(name, await printerPaperSizes(name));
    return paperSizeCache.get(name);
  };

  handle("print:execute", (input) => withPrintStyles(input, async (contents, settings) => {
    const printers = await contents.getPrintersAsync();
    if (!printers.some((printer) => printer.name === input.printerName)) throw new Error("Choose an available printer.");
    const ranges = pageRanges(input);
    // Windows drivers often ignore a custom page size and print on their default
    // paper (A4 cuts off a Folio page). Print the exact preview PDF on the
    // driver's own paper of the same size instead.
    let driverPaperError = "";
    if (process.platform === "win32") {
      const { width, height } = settings.pdf.pageSize;
      const paper = (await cachedPaperSizes(input.printerName)).find((size) => size.kind > 0 &&
        Math.abs(size.width - width) < 0.03 && Math.abs(size.height - height) < 0.03);
      if (paper) {
        try {
          await printPdfWithDriverPaper(contents, settings, input.printerName, paper.kind, ranges);
          console.log(`[Print] SumatraPDF on "${paper.name}" (${input.printerName})` +
            (settings.pdf.landscape ? `, landscape turned ${settings.flipLandscape ? "counter-clockwise (flipped)" : "clockwise"}` : ""));
          return { success: true };
        } catch (error) {
          driverPaperError = `Printing on "${paper.name}" failed (${error?.message || error}).`;
          console.warn("[Print]", driverPaperError, "Using the standard print job.");
          if (error.partialPrint) return { success: false, error: driverPaperError };
        }
      }
    }
    console.log(`[Print] Standard print job (${input.printerName})` +
      (driverPaperError ? ` after: ${driverPaperError}` : ", no matching driver paper") +
      (settings.pdf.landscape ? "; the printer driver turns landscape pages itself" : ""));
    const result = await new Promise((resolve) => contents.print({
      ...settings.print, deviceName: input.printerName, silent: true,
      ...(ranges ? { pageRanges: ranges } : {}),
    }, (success, error) => resolve({ success, error })));
    if (result.success) return result;
    // Show both failures so the cause is visible, not only "Print job canceled".
    return { success: false, error: [driverPaperError, result.error || "Printing was canceled."].filter(Boolean).join(" Then: ") };
  }));

  handle("print:get-paper-sizes", async (input) => ({
    success: true, paperSizes: await cachedPaperSizes(input.printerName),
  }));

  handle("print:cleanup-preview", () => { cleanup(); return { success: true }; });
  return cleanup;
}
