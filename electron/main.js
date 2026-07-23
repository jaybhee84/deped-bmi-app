import path from "path";
import os from "os";
import fs from "fs";
import https from "https";
import { fileURLToPath } from "url";
import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import { PDFDocument } from "pdf-lib";
import pkg from "electron-updater";

const { autoUpdater } = pkg;

// ==========================================
// PLATFORM FLAG
// ==========================================
const isMac = process.platform === "darwin";
const GITHUB_REPO = "jaybhee84/deped-bmi-app";

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

// IMPORT UNIFIED PRINT HANDLER
import { setupPrintHandler } from "./printHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// DISABLE HARDWARE ACCELERATION
// ==========================================
app.disableHardwareAcceleration();

// ==========================================
// AUTO UPDATER Configuration (Windows / Linux)
// ==========================================
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on("checking-for-update", () => {
  console.log("[Updater] Checking for updates...");
});

autoUpdater.on("update-available", (info) => {
  console.log("[Updater] Update available:", info.version);
  mainWindow?.webContents.send(
    "update-message",
    `Update available: v${info.version}. Downloading in background...`
  );
});

autoUpdater.on("update-not-available", (info) => {
  console.log("[Updater] No update available");
  mainWindow?.webContents.send(
    "update-message",
    "You already have the latest version."
  );
});

autoUpdater.on("update-downloaded", (info) => {
  console.log("[Updater] Update downloaded, prompting restart.");
  if (mainWindow) {
    mainWindow.webContents.send("update-ready", info);
  }

  // Native prompt asking the user to restart and install immediately
  dialog
    .showMessageBox(mainWindow, {
      type: "info",
      title: "Update Ready",
      message: `Version v${info.version} has been downloaded. Restart the application now to apply the update?`,
      buttons: ["Restart & Install", "Later"],
      defaultId: 0,
      cancelId: 1,
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
});

autoUpdater.on("error", (err) => {
  console.error("[Updater] Error:", err);
  mainWindow?.webContents.send(
    "update-message",
    `Update failed: ${err.message}`
  );
});

ipcMain.on("restart-app-for-update", () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle("app:getVersion", () => {
  return app.getVersion();
});

// ==========================================
// UNIFIED "CHECK FOR UPDATES" HANDLER
// ==========================================
ipcMain.handle("app:checkForUpdates", async () => {
  if (isMac) {
    try {
      return await checkForUpdatesMac();
    } catch (error) {
      console.error("[Updater][mac] check failed:", error);
      return { success: false, platform: "darwin", error: error.message };
    }
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    const currentVersion = app.getVersion();
    const latestVersion = result?.updateInfo?.version || currentVersion;
    const updateAvailable = latestVersion !== currentVersion;

    return {
      success: true,
      platform: process.platform,
      currentVersion,
      latestVersion,
      updateAvailable,
      updateInfo: result?.updateInfo || null,
    };
  } catch (error) {
    console.error("[Updater] Check failed:", error);
    return {
      success: false,
      platform: process.platform,
      error: error.message,
    };
  }
});

// ==========================================
// MACOS MANUAL UPDATE FLOW
// ==========================================

function githubGetJson(urlPath) {
  return new Promise((resolve, reject) => {
    https
      .get(
        {
          hostname: "api.github.com",
          path: urlPath,
          headers: {
            "User-Agent": "deped-bmi-app",
            Accept: "application/vnd.github+json",
          },
        },
        (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`GitHub API responded ${res.statusCode}`));
            res.resume();
            return;
          }
          let raw = "";
          res.on("data", (chunk) => (raw += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(raw));
            } catch (e) {
              reject(e);
            }
          });
        }
      )
      .on("error", reject);
  });
}

function downloadFile(url, destPath, onProgress, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "deped-bmi-app" } }, (res) => {
        const isRedirect = [301, 302, 303, 307, 308].includes(res.statusCode);
        if (isRedirect && res.headers.location && redirectsLeft > 0) {
          res.resume();
          downloadFile(res.headers.location, destPath, onProgress, redirectsLeft - 1)
            .then(resolve, reject);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Download failed with status ${res.statusCode}`));
          res.resume();
          return;
        }

        const total = parseInt(res.headers["content-length"], 10) || 0;
        let downloaded = 0;
        const file = fs.createWriteStream(destPath);

        res.on("data", (chunk) => {
          downloaded += chunk.length;
          if (onProgress && total) {
            onProgress(Math.round((downloaded / total) * 100));
          }
        });

        res.pipe(file);
        file.on("finish", () => file.close(() => resolve(destPath)));
        file.on("error", reject);
      })
      .on("error", reject);
  });
}

async function checkForUpdatesMac() {
  const data = await githubGetJson(`/repos/${GITHUB_REPO}/releases/latest`);
  const latestVersion = String(data.tag_name || "").replace(/^v/, "");
  const currentVersion = app.getVersion();
  const dmgAsset = (data.assets || []).find((a) => a.name.endsWith(".dmg"));

  return {
    success: true,
    platform: "darwin",
    currentVersion,
    latestVersion,
    updateAvailable: Boolean(latestVersion) && latestVersion !== currentVersion,
    dmgUrl: dmgAsset?.browser_download_url || null,
    dmgName: dmgAsset?.name || null,
  };
}

ipcMain.handle("app:downloadUpdateMac", async (event, { dmgUrl, dmgName }) => {
  if (!dmgUrl || !dmgName) {
    return { success: false, error: "Missing dmgUrl/dmgName." };
  }

  const win = BrowserWindow.fromWebContents(event.sender);
  const destPath = path.join(app.getPath("downloads"), dmgName);

  try {
    await downloadFile(dmgUrl, destPath, (pct) => {
      win?.webContents.send("update-download-progress", pct);
    });
    await shell.openPath(destPath);
    return { success: true, path: destPath };
  } catch (error) {
    console.error("[Updater][mac] download failed:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("app:openReleasesPage", async () => {
  await shell.openExternal(`https://github.com/${GITHUB_REPO}/releases/latest`);
  return true;
});

// ==========================================
// HYBRID ARCHITECTURE REGISTRIES
// ==========================================

ipcMain.handle("get-school-by-id", async (event, schoolId) => {
  try {
    const row = getSchoolById(schoolId);
    return row || null;
  } catch (error) {
    console.error("IPC get-school-by-id error:", error);
    throw error;
  }
});

ipcMain.handle("get-school-by-name", async (event, schoolName) => {
  try {
    const row = getSchoolByName(schoolName);
    return row || null;
  } catch (error) {
    console.error("IPC get-school-by-name error:", error);
    throw error;
  }
});

ipcMain.handle("save-school-locally", async (event, school) => {
  try {
    saveSchoolLocally(school);
    return true;
  } catch (error) {
    console.error("IPC save-school-locally error:", error);
    throw error;
  }
});

ipcMain.handle("update-local-profile", async (event, profileData) => {
  try {
    updateLocalProfile(profileData);
    return true;
  } catch (error) {
    console.error("IPC update-local-profile error:", error);
    throw error;
  }
});

ipcMain.handle("offline-login-check", async (event, { email, password }) => {
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
// SCHOOL LOGO CACHE
// ==========================================

ipcMain.handle("logo-cache:save", (_, { schoolKey, filename, dataUrl }) => {
  try {
    saveLogoToCache(schoolKey, filename, dataUrl);
    return true;
  } catch (error) {
    console.error("IPC logo-cache:save error:", error);
    throw error;
  }
});

ipcMain.handle("logo-cache:load", (_, schoolKey) => {
  try {
    return loadLogoFromCache(schoolKey);
  } catch (error) {
    console.error("IPC logo-cache:load error:", error);
    throw error;
  }
});

ipcMain.handle("logo-cache:loadAll", () => {
  try {
    return loadAllCachedLogos();
  } catch (error) {
    console.error("IPC logo-cache:loadAll error:", error);
    throw error;
  }
});

ipcMain.handle("logo-cache:keys", () => {
  try {
    return getCachedLogoKeys();
  } catch (error) {
    console.error("IPC logo-cache:keys error:", error);
    throw error;
  }
});

// ==========================================
// WINDOW INTERACTION ACTIONS
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