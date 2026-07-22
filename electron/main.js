import path from "path";
import os from "os";
import fs from "fs";
import https from "https";
import { fileURLToPath } from "url";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { PDFDocument } from "pdf-lib";
import pkg from "electron-updater";

const { autoUpdater } = pkg;

// 
// IMPORT LOCAL DATABASE ENGINE ATTRIBUTES
import {
  saveStudents,
  loadStudents,
  saveSchool,
  loadSchool,
  clearSchool,
  saveSchoolLogo,
  loadSchoolLogo,
  deleteSchoolLogo,
  initDatabase,
  getSchoolById,     
  getSchoolByName,
  saveSchoolLocally, 
  updateLocalProfile, 
  offlineLoginCheck,
  saveEnrolmentLocally,
  loadEnrolmentLocally,
  loadEnrolmentTotalsForSY,
  getDirtyEnrolmentRows,
  markEnrolmentClean,
  saveLogoToCache,
  loadLogoFromCache,
  loadAllCachedLogos,
  getCachedLogoKeys
} from "./database.js";

// IMPORT OUR NEW UNIFIED PRINT HANDLER
import { setupPrintHandler } from "./printHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// DISABLE HARDWARE ACCELERATION
// ==========================================
app.disableHardwareAcceleration();

// ==========================================
// AUTO UPDATER Configuration (Windows / Linux)
// 
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

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

autoUpdater.on("update-downloaded", () => {
  console.log("[Updater] Update downloaded, will install on quit.");
  if (mainWindow) {
    mainWindow.webContents.send("update-ready");
  }
});

autoUpdater.on("error", (err) => {
  console.error("[Updater] Error:", err);
  mainWindow?.webContents.send(
    "update-message",
    `Update failed: ${err.message}`
  );
});

ipcMain.on("restart-app-for-update", () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle("app:getVersion", () => {
  return app.getVersion();
});

// 
  try {
    saveEnrolmentLocally(schoolId, sy, data, total);
    return true;
  } catch (error) {
    console.error("IPC sbfp-enrolment:save error:", error);
    throw error;
  }
});


ipcMain.handle("sbfp-enrolment:load", (_, schoolId, sy) => {
  try {
    return loadEnrolmentLocally(schoolId, sy);
  } catch (error) {
    console.error("IPC sbfp-enrolment:load error:", error);
    throw error;
  }
});

ipcMain.handle("sbfp-enrolment:markClean", (_, schoolId, sy) => {
  try {
    markEnrolmentClean(schoolId, sy);
    return true;
  } catch (error) {
    console.error("IPC sbfp-enrolment:markClean error:", error);
    throw error;
  }
});

ipcMain.handle("sbfp-enrolment:dirty", () => {
  try {
    return getDirtyEnrolmentRows();
  } catch (error) {
    console.error("IPC sbfp-enrolment:dirty error:", error);
    throw error;
  }
});

ipcMain.handle("sbfp-enrolment:totals", (_, sy) => {
  try {
    return loadEnrolmentTotalsForSY(sy);
  } catch (error) {
    console.error("IPC sbfp-enrolment:totals error:", error);
    throw error;
  }
});

// ==========================================
// SCHOOL LOGO CACHE (bulk preload, name-keyed)
// 
// WINDOW INTERACTION ACTIONS (Cross-Platform Fix)
// ==========================================
ipcMain.on("close-current-window", (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  if (targetWindow) {
    targetWindow.close();
  }
});

// ==========================================
// INITIALIZE PRINT HANDLER
// ==========================================
setupPrintHandler();

// ==========================================
// APPLICATION WINDOW INSTANCE
// ==========================================

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    icon: path.join(__dirname, "../public/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.maximize();

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

// ==========================================
// FOCUS RECOVERY
// ==========================================
ipcMain.on("force-refocus-window", () => {
  if (!mainWindow) return;
  mainWindow.blur();
  mainWindow.focus();
  mainWindow.webContents.focus();
});

// ==========================================
// LIFECYCLE INITIALIZER
// ==========================================
app.whenReady().then(() => {
  initDatabase(); 
  createWindow();   

  if (app.isPackaged && !isMac) {
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