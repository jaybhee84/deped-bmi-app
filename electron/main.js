import path from "path";
import os from "os";
import fs from "fs";
import { fileURLToPath } from "url";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { PDFDocument } from "pdf-lib";
import pkg from "electron-updater";

const { autoUpdater } = pkg;

import {
  saveStudents,
  loadStudents,
  saveSchool,
  loadSchool,
  clearSchool,
  saveSchoolLogo,
  loadSchoolLogo,
  deleteSchoolLogo,
} from "./database.js";

// IMPORT OUR NEW UNIFIED PRINT HANDLER
import { setupPrintHandler } from "./printHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =========================
// DISABLE HARDWARE ACCELERATION
// =========================
// Root fix for two symptoms that turned out to be the same underlying bug:
//   1. Garbled/ghosted rendering artifacts appearing after screen transitions
//      (e.g. right after logout).
//   2. Keyboard input silently getting "stuck" — a text field looks normal
//      but won't accept typing until the user switches away from the app
//      and back (which forces a full window repaint).
// Both are classic symptoms of GPU/compositor glitches, a known Electron-
// on-Windows issue (especially common in VMs, remote desktop sessions, or
// with certain GPU drivers). Disabling hardware acceleration forces
// Chromium to render entirely in software, which is slightly heavier on
// the CPU but eliminates this whole class of bug. Must be called before
// app.whenReady() / app is considered "ready".
app.disableHardwareAcceleration();

// =========================
// AUTO UPDATER
// =========================
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on("update-available", (info) => {
  console.log("[Updater] Update available:", info.version);
});

autoUpdater.on("update-downloaded", () => {
  console.log("[Updater] Update downloaded, will install on quit.");
  if (mainWindow) {
    mainWindow.webContents.send("update-ready");
  }
});

autoUpdater.on("error", (err) => {
  console.error("[Updater] Error:", err);
});

ipcMain.on("restart-app-for-update", () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle("app:getVersion", () => {
  return app.getVersion();
});

// =========================
// STUDENTS IPC
// =========================

ipcMain.handle("students:save", (_, students) => {
  saveStudents(students);
  return true;
});

ipcMain.handle("students:load", () => {
  return loadStudents();
});

// =========================
// SCHOOL IPC
// =========================

ipcMain.handle("school:save", (_, school) => {
  saveSchool(school);
  return true;
});

ipcMain.handle("school:load", () => {
  return loadSchool();
});

ipcMain.handle("school:clear", () => {
  clearSchool();
  return true;
});

// =========================
// SCHOOL LOGO IPC (separate from school info — does not disturb it)
// =========================

ipcMain.handle("school:saveLogo", (_, { schoolId, filename, dataUrl }) => {
  saveSchoolLogo(schoolId, filename, dataUrl);
  return true;
});

ipcMain.handle("school:loadLogo", (_, schoolId) => {
  return loadSchoolLogo(schoolId);
});

ipcMain.handle("school:deleteLogo", (_, schoolId) => {
  deleteSchoolLogo(schoolId);
  return true;
});


ipcMain.handle("app:checkForUpdates", async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      success: true,
      updateInfo: result?.updateInfo || null,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      error: error.message,
    };
  }
});
// =========================
// INITIALIZE PRINT HANDLER
// =========================

// This single line replaces all the old, duplicated PDF generation code
setupPrintHandler();

// =========================
// APPLICATION WINDOW INSTANCE
// =========================

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
  width: 1600,
  height: 900,
  minWidth: 1200,
  minHeight: 700,

  icon: path.join(
    __dirname,
    "../public/icon.ico"
  ),

  webPreferences: {
    preload: path.join(__dirname, "preload.js"),
    contextIsolation: true,
    nodeIntegration: false,
  },
});

  mainWindow.maximize();

  // Complements the renderer-side fix in Login.jsx for the known
  // Electron/Chromium bug where the first click after the window regains
  // OS focus can activate the window without also focusing the DOM
  // element underneath the cursor. Explicitly re-focusing webContents
  // here keeps DOM focus state in sync with window activation.
  mainWindow.on("focus", () => {
    mainWindow.webContents.focus();
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  } else {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  }
}

// =========================
// FOCUS RECOVERY (lightweight fallback only)
// =========================
// NOTE: previously this toggled mainWindow.setEnabled(false/true), which
// turned out to cause visible rendering corruption on some systems without
// actually fixing the underlying issue. The real root cause is GPU/
// hardware-acceleration compositor glitches (see app.disableHardwareAcceleration()
// near the top of this file) — that's the primary fix. This handler is kept
// only as a harmless, much gentler fallback.

ipcMain.on("force-refocus-window", () => {
  if (!mainWindow) return;
  mainWindow.blur();
  mainWindow.focus();
  mainWindow.webContents.focus();
});

app.whenReady().then(() => {
  createWindow();

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

autoUpdater.on("checking-for-update", () => {
  console.log("[Updater] Checking for updates...");
});

autoUpdater.on("update-available", (info) => {
  console.log("[Updater] Update available:", info.version);

  mainWindow?.webContents.send(
    "update-message",
    `Update available: ${info.version}`
  );
});

autoUpdater.on("update-not-available", (info) => {
  console.log("[Updater] No update available");

  mainWindow?.webContents.send(
    "update-message",
    "You already have the latest version."
  );
});

autoUpdater.on("error", (err) => {
  console.error("[Updater] Error:", err);

  mainWindow?.webContents.send(
    "update-message",
    `Update failed: ${err.message}`
  );
});