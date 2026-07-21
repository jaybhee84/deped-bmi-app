import path from "path";
import os from "os";
import fs from "fs";
import { fileURLToPath } from "url";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { PDFDocument } from "pdf-lib";
import pkg from "electron-updater";

const { autoUpdater } = pkg;

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
  markEnrolmentClean
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
// AUTO UPDATER Configuration
// ==========================================
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

// ==========================================
// HYBRID ARCHITECTURE REGISTRIES
// ==========================================

ipcMain.handle('get-school-by-id', async (event, schoolId) => {
  try {
    const row = getSchoolById(schoolId);
    return row || null;
  } catch (error) {
    console.error("IPC get-school-by-id error:", error);
    throw error;
  }
});

ipcMain.handle('get-school-by-name', async (event, schoolName) => {
  try {
    const row = getSchoolByName(schoolName);
    return row || null;
  } catch (error) {
    console.error("IPC get-school-by-name error:", error);
    throw error;
  }
});

ipcMain.handle('save-school-locally', async (event, school) => {
  try {
    saveSchoolLocally(school);
    return true;
  } catch (error) {
    console.error("IPC save-school-locally error:", error);
    throw error;
  }
});

ipcMain.handle('update-local-profile', async (event, profileData) => {
  try {
    updateLocalProfile(profileData);
    return true;
  } catch (error) {
    console.error("IPC update-local-profile error:", error);
    throw error;
  }
});

ipcMain.handle('offline-login-check', async (event, { email, password }) => {
  try {
    return offlineLoginCheck(email, password);
  } catch (error) {
    console.error("IPC offline-login-check error:", error);
    return { success: false, message: error.message };
  }
});

// ==========================================
// STUDENTS & LEGACY SCHOOL IPC
// ==========================================

ipcMain.handle("students:save", (_, students) => {
  saveStudents(students);
  return true;
});

ipcMain.handle("students:load", () => {
  return loadStudents();
});

ipcMain.handle("school:save", (_, { school, userId }) => {
  saveSchool(school, userId);
  return true;
});

ipcMain.handle("school:load", (_, userId) => {
  return loadSchool(userId);
});

ipcMain.handle("school:loadWithLogo", (_, userId) => {
  const schoolData = loadSchool(userId);
  if (!schoolData || !schoolData.school_id) return null;
  const logoUrl = loadSchoolLogo(schoolData.school_id);
  return {
    ...schoolData,
    logo_url: logoUrl || null
  };
});

ipcMain.handle("school:clear", () => {
  clearSchool();
  return true;
});

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

// ==========================================
// SBFP ENROLMENT (offline-first local SQLite)
// ==========================================
// These back window.sqlite.saveEnrolment / loadEnrolment /
// markEnrolmentClean / getDirtyEnrolment, which sbfpConfig.js already
// calls on every save/load. Without these handlers those calls hit
// nothing on the main-process side and silently no-op, so enrolment
// never actually persisted locally offline.

ipcMain.handle("sbfp-enrolment:save", (_, schoolId, sy, data, total) => {
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