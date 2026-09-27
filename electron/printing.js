// In-app Print Preview service (same flow as the IECES Portal). The renderer
// hands over a complete HTML document; it is loaded into a hidden, script-free
// window, rendered to PDF for the preview and printed from that same window,
// so what the preview shows is exactly what the printer receives.
import { BrowserWindow, ipcMain } from "electron";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { buildSettings, pageRanges } from "./print-settings.js";

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
    } });
    sourceWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    sourceWindow.webContents.on("will-navigate", (event) => event.preventDefault());
    try {
      // Load from a temp file: embedded logos easily exceed Chromium's 2 MB
      // URL limit, which makes data: URLs fail with ERR_INVALID_URL.
      tempFile = path.join(os.tmpdir(), `bmi-print-${crypto.randomUUID()}.html`);
      await fs.promises.writeFile(tempFile, input.html, "utf8");
      await sourceWindow.loadFile(tempFile);
    } catch (error) { cleanup(); throw error; }
    return { success: true };
  });

  handle("print:get-printers", async (_input, main) => ({
    success: true,
    printers: (await main.webContents.getPrintersAsync()).map((printer) => ({
      name: printer.name, displayName: printer.displayName || printer.name, isDefault: printer.isDefault,
    })),
  }));

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

  handle("print:execute", (input) => withPrintStyles(input, async (contents, settings) => {
    const printers = await contents.getPrintersAsync();
    if (!printers.some((printer) => printer.name === input.printerName)) throw new Error("Choose an available printer.");
    const ranges = pageRanges(input);
    const result = await new Promise((resolve) => contents.print({
      ...settings.print, deviceName: input.printerName, silent: true,
      ...(ranges ? { pageRanges: ranges } : {}),
    }, (success, error) => resolve({ success, error })));
    return result.success ? result : { success: false, error: result.error || "Printing was canceled." };
  }));

  handle("print:cleanup-preview", () => { cleanup(); return { success: true }; });
  return cleanup;
}
