// Run with Vite running (npm run dev): npx electron tests/electron-print-preview.mjs
// Uses synthetic documents and a stub print method: never submits a printer job.
import { app, BrowserWindow } from "electron";
import path from "node:path";
import fs from "node:fs";
import assert from "node:assert/strict";
import { setupPrinting } from "../electron/printing.js";

const output = path.resolve("out/print-preview-check");
fs.mkdirSync(path.join(output, "profile"), { recursive: true });
app.setPath("userData", path.join(output, "profile"));
app.disableHardwareAcceleration();
let main;
const cleanup = setupPrinting(() => main);
setTimeout(() => { console.error("Electron integration test exceeded 60 seconds."); cleanup(); app.exit(1); }, 60000).unref();
const run = (code) => main.webContents.executeJavaScript(code);
async function until(code, label) {
  for (let i = 0; i < 150; i++) {
    if (await run(code)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${label}\n${await run("(document.querySelector('[role=dialog]')?.innerText || 'NO DIALOG').slice(0, 400)")}`);
}
const ratio = (w, h) => `(() => { const c = document.querySelector('canvas'); return c && c.width > 0 && Math.abs(c.width / c.height - ${w} / ${h}) < .01; })()`;

app.whenReady().then(async () => {
  try {
    main = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: {
      preload: path.resolve("electron/preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true,
    } });
    main.webContents.on("console-message", (event) => { if (event.level === "error" || event.level === "warning") console.log("renderer:", event.message); });
    await main.loadURL("http://localhost:5173/tests/print-preview.html");
    await until("!!document.getElementById('open-ns')", "fixture mount");
    await run("window.alert = (message) => console.error('PREVIEW ALERT:', message); true");
    assert.ok(await run("typeof window.electronAPI?.printPrepare === 'function'"), "preload exposes the print API");
    main.webContents.getPrintersAsync = async () => [{ name: "Test printer", displayName: "Test printer", isDefault: true }];

    // NS Report for a whole school: one Folio portrait page per class.
    const alerts = [];
    main.webContents.on("console-message", (event) => { if (event.message.includes("PREVIEW ALERT")) alerts.push(event.message); });
    await run("document.getElementById('open-ns').click()");
    await until("/Page 1 of [0-9]{2}/.test(document.body.innerText) && document.querySelector('canvas')?.width > 0", "NS report render");
    assert.deepEqual(alerts, [], "no preview errors");
    await until(ratio(8.5, 13), "Folio portrait proportions");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    fs.writeFileSync(path.join(output, "ns-dialog.png"), (await main.webContents.capturePage()).toPNG());
    const ns = await run("window.electronAPI.printRenderPreview({})");
    assert.ok(ns.success, ns.error);
    fs.writeFileSync(path.join(output, "ns-report.pdf"), Buffer.from(ns.base64, "base64"));

    const source = BrowserWindow.getAllWindows().find((window) => window !== main);
    source.webContents.getPrintersAsync = main.webContents.getPrintersAsync;
    let job;
    source.webContents.print = (options, callback) => { job = options; callback(true); };
    await run("[...document.querySelectorAll('button')].find(b => b.textContent === 'Print').click()");
    await until("!document.querySelector('[role=dialog]')", "dialog close after stub print");
    assert.deepEqual(job.pageSize, { width: 215900, height: 330200 }, "prints on Folio");
    assert.equal(job.landscape, false);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(source.isDestroyed(), "isolated document cleaned up");

    // Summary: Folio landscape.
    await run("document.getElementById('open-summary').click()");
    await until("document.body.innerText.includes('Page 1 of 1') && document.querySelector('canvas')?.width > 0", "summary render");
    await until(ratio(13, 8.5), "Folio landscape proportions");
    const summary = await run("window.electronAPI.printRenderPreview({})");
    fs.writeFileSync(path.join(output, "summary.pdf"), Buffer.from(summary.base64, "base64"));
    await run("document.querySelector('[aria-label=\"Close print preview\"]').click()");

    console.log(`PASS: NS report and summary preview on Folio, stub print, cleanup. Output in ${output}`);
    cleanup(); main.destroy(); app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup(); app.exit(1);
  }
});
