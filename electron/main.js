import path from "path";
import os from "os";
import fs from "fs";
import https from "https";
import { fileURLToPath } from "url";
import { app, BrowserWindow, ipcMain, shell, dialog, Menu } from "electron";
import db from './database.js';
import { migrateProtectedData, protectData, readProtectedData } from './protected-data.js';
import { validateMacUpdate } from './security.js';
import { PDFDocument } from "pdf-lib";
import pkg from "electron-updater";

const { autoUpdater } = pkg;

// ==========================================
// PLATFORM FLAG
// ==========================================
const isMac = process.platform === "darwin";
const GITHUB_REPO = "buzzjay84/deped-bmi-app";

// IMPORT LOCAL DATABASE ENGINE ATTRIBUTES
import {
  saveStudents,
  loadStudents,
  getDirtyStudents,
  markStudentsClean,
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
  deleteLocalProfile,
  offlineLoginCheck,
  saveEnrolmentLocally,
  loadEnrolmentLocally,
  loadEnrolmentTotalsForSY,
  getDirtyEnrolmentRows,
  markEnrolmentClean,
  saveLogoToCache,
  loadLogoFromCache,
  loadAllCachedLogos,
  getCachedLogoKeys,
} from "./database.js";

// IN-APP PRINT PREVIEW SERVICE
import { setupPrinting } from "./printing.js";

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
// Download silently, but only install after the user explicitly confirms.
autoUpdater.autoInstallOnAppQuit = false;

let downloadedUpdate = null;
let updatePromptOpen = false;
let updateInstallStarted = false;

function installDownloadedUpdate() {
  if (!downloadedUpdate || updateInstallStarted) return;

  updateInstallStarted = true;
  mainWindow?.webContents.send("update-installing", downloadedUpdate);
  // Run the downloaded NSIS installer silently, then launch the updated app.
  autoUpdater.quitAndInstall(true, true);
}

autoUpdater.on("checking-for-update", () => {
  console.log("[Updater] Checking for updates...");
});

autoUpdater.on("update-available", (info) => {
  console.log("[Updater] Update available:", info.version);
  mainWindow?.webContents.send(
    "update-message",
    `Update available: v${info.version}. Downloading in background...`,
  );
});

autoUpdater.on("update-not-available", (info) => {
  console.log("[Updater] No update available");
  mainWindow?.webContents.send(
    "update-message",
    "You already have the latest version.",
  );
});

autoUpdater.on("update-downloaded", (info) => {
  console.log("[Updater] Update downloaded, prompting restart.");
  downloadedUpdate = info;
  if (mainWindow) {
    mainWindow.webContents.send("update-ready", info);
  }

  if (updatePromptOpen) return;
  updatePromptOpen = true;

  // Prompt only after the complete installer is safely downloaded.
  dialog
    .showMessageBox(mainWindow, {
      type: "info",
      title: "Update Ready to Install",
      message: `Version v${info.version} is ready to install.`,
      detail:
        "Install now? The app will close, install the update, and relaunch automatically.",
      buttons: ["Install & Restart", "Later"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    .then((result) => {
      if (result.response === 0) {
        installDownloadedUpdate();
      }
    })
    .finally(() => {
      updatePromptOpen = false;
    });
});

autoUpdater.on("error", (err) => {
  console.error("[Updater] Error:", err);
  mainWindow?.webContents.send(
    "update-message",
    `Update failed: ${err.message}`,
  );
});

function handleAppIpc(channel, action) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
      throw new Error('Only the app window may access local data.');
    }
    return action(event, ...args);
  });
}

ipcMain.on("restart-app-for-update", (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return;
  installDownloadedUpdate();
});

handleAppIpc("app:getVersion", () => {
  return app.getVersion();
});

const BUNDLED_TEMPLATE_FILES = new Set([
  "NS REPORT.xlsx",
  "SBFP FORM 1.xlsx",
  "SBFP FORM 2.xlsx",
]);

handleAppIpc("assets:loadTemplate", async (_, filename) => {
  if (!BUNDLED_TEMPLATE_FILES.has(filename)) {
    throw new Error("The requested template is not allowed.");
  }

  const templateDirectories = app.isPackaged
    ? [path.join(app.getAppPath(), "dist", "templates")]
    : [
        path.join(app.getAppPath(), "public", "templates"),
        path.join(app.getAppPath(), "dist", "templates"),
      ];

  for (const directory of templateDirectories) {
    const templatePath = path.join(directory, filename);
    if (fs.existsSync(templatePath)) {
      return fs.promises.readFile(templatePath);
    }
  }

  throw new Error(`Bundled template not found: ${filename}`);
});

// ==========================================
// UNIFIED "CHECK FOR UPDATES" HANDLER
// ==========================================
handleAppIpc("app:checkForUpdates", async () => {
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
        },
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
          downloadFile(
            res.headers.location,
            destPath,
            onProgress,
            redirectsLeft - 1,
          ).then(resolve, reject);
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

handleAppIpc("app:downloadUpdateMac", async (event, { dmgUrl, dmgName }) => {
  try { validateMacUpdate(dmgUrl, dmgName, GITHUB_REPO); }
  catch { return { success: false, error: 'Invalid update download.' }; }
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

handleAppIpc("app:openReleasesPage", async () => {
  await shell.openExternal(`https://github.com/${GITHUB_REPO}/releases/latest`);
  return true;
});

// ==========================================
// HYBRID ARCHITECTURE REGISTRIES & USER AUTH
// ==========================================

handleAppIpc("user:saveLocally", async (event, { user, password }) => {
  try {
    updateLocalProfile({
      id: user.id,
      email: user.email,
      username: user.username || user.firstname || "",
      role: user.role,
      school_id: user.school_id,
      ...user,
      password,
    });
    return { success: true };
  } catch (error) {
    console.error("IPC user:saveLocally error:", error);
    return { success: false, error: error.message };
  }
});

handleAppIpc("get-school-by-id", async (event, schoolId) => {
  try {
    const row = getSchoolById(schoolId);
    return row || null;
  } catch (error) {
    console.error("IPC get-school-by-id error:", error);
    throw error;
  }
});

handleAppIpc("get-school-by-name", async (event, schoolName) => {
  try {
    const row = getSchoolByName(schoolName);
    return row || null;
  } catch (error) {
    console.error("IPC get-school-by-name error:", error);
    throw error;
  }
});

handleAppIpc("save-school-locally", async (event, school) => {
  try {
    saveSchoolLocally(school);
    return true;
  } catch (error) {
    console.error("IPC save-school-locally error:", error);
    throw error;
  }
});

handleAppIpc("update-local-profile", async (event, profileData) => {
  try {
    updateLocalProfile(profileData);
    return true;
  } catch (error) {
    console.error("IPC update-local-profile error:", error);
    throw error;
  }
});

handleAppIpc("profile:deleteLocal", async (event, identity) => {
  try {
    return { success: true, deleted: deleteLocalProfile(identity) };
  } catch (error) {
    console.error("IPC profile:deleteLocal error:", error);
    return { success: false, error: error.message };
  }
});

handleAppIpc("offline-login-check", async (event, { email, password }) => {
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

handleAppIpc("students:save", (_, payload) => {
  const students = Array.isArray(payload) ? payload : payload.students;
  const isDirty = Array.isArray(payload) ? false : payload.isDirty;
  saveStudents(students, isDirty);
  return true;
});

handleAppIpc("students:load", () => {
  return loadStudents();
});

handleAppIpc("students:getDirty", () => {
  return getDirtyStudents();
});

handleAppIpc("students:markClean", () => {
  markStudentsClean();
  return true;
});

handleAppIpc("school:save", (_, { school, userId }) => {
  saveSchool(school, userId);
  return true;
});

handleAppIpc("school:load", (_, userId) => {
  return loadSchool(userId);
});

handleAppIpc("school:loadWithLogo", (_, userId) => {
  const schoolData = loadSchool(userId);
  if (!schoolData || !schoolData.school_id) return null;
  const logoUrl = loadSchoolLogo(schoolData.school_id);
  return {
    ...schoolData,
    logo_url: logoUrl || null,
  };
});

handleAppIpc("school:clear", () => {
  clearSchool();
  return true;
});

handleAppIpc("school:saveLogo", (_, { schoolId, filename, dataUrl }) => {
  saveSchoolLogo(schoolId, filename, dataUrl);
  return true;
});

handleAppIpc("school:loadLogo", (_, schoolId) => {
  return loadSchoolLogo(schoolId);
});

handleAppIpc("school:deleteLogo", (_, schoolId) => {
  deleteSchoolLogo(schoolId);
  return true;
});

// ==========================================
// SBFP ENROLMENT (offline-first local SQLite)
// ==========================================

handleAppIpc("sbfp-enrolment:save", (_, schoolId, sy, data, total) => {
  try {
    saveEnrolmentLocally(schoolId, sy, data, total);
    return true;
  } catch (error) {
    console.error("IPC sbfp-enrolment:save error:", error);
    throw error;
  }
});

handleAppIpc("sbfp-enrolment:load", (_, schoolId, sy) => {
  try {
    return loadEnrolmentLocally(schoolId, sy);
  } catch (error) {
    console.error("IPC sbfp-enrolment:load error:", error);
    throw error;
  }
});

handleAppIpc("sbfp-enrolment:markClean", (_, schoolId, sy) => {
  try {
    markEnrolmentClean(schoolId, sy);
    return true;
  } catch (error) {
    console.error("IPC sbfp-enrolment:markClean error:", error);
    throw error;
  }
});

handleAppIpc("sbfp-enrolment:dirty", () => {
  try {
    return getDirtyEnrolmentRows();
  } catch (error) {
    console.error("IPC sbfp-enrolment:dirty error:", error);
    throw error;
  }
});

handleAppIpc("sbfp-enrolment:totals", (_, sy) => {
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

handleAppIpc("logo-cache:save", (_, { schoolKey, filename, dataUrl }) => {
  try {
    saveLogoToCache(schoolKey, filename, dataUrl);
    return true;
  } catch (error) {
    console.error("IPC logo-cache:save error:", error);
    throw error;
  }
});

handleAppIpc("logo-cache:load", (_, schoolKey) => {
  try {
    return loadLogoFromCache(schoolKey);
  } catch (error) {
    console.error("IPC logo-cache:load error:", error);
    throw error;
  }
});

handleAppIpc("logo-cache:loadAll", () => {
  try {
    return loadAllCachedLogos();
  } catch (error) {
    console.error("IPC logo-cache:loadAll error:", error);
    throw error;
  }
});

handleAppIpc("logo-cache:keys", () => {
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
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return;
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  if (targetWindow) {
    targetWindow.close();
  }
});

// ==========================================
// APPLICATION WINDOW INSTANCE
// ==========================================

let mainWindow;
for (const [channel, action] of [['storage:seal', protectData], ['storage:open', readProtectedData]]) {
  ipcMain.on(channel, (event, value) => {
    try {
      if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame ||
          typeof value !== 'string' || value.length > 50_000_000) throw new Error('Invalid protected storage request.');
      event.returnValue = { value: action(value) };
    } catch (error) { event.returnValue = { error: error.message }; }
  });
}

// ==========================================
// INITIALIZE PRINT PREVIEW SERVICE
// ==========================================
const cleanupPrinting = setupPrinting(() => mainWindow);
app.on("before-quit", cleanupPrinting);

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
      sandbox: true,
    },
  });

  mainWindow.maximize();
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

  mainWindow.on("closed", () => {
    cleanupPrinting();
    mainWindow = null;
  });

  mainWindow.on("focus", () => {
    mainWindow.webContents.focus();
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  } else {
    mainWindow.loadURL(process.env.ELECTRON_DEV_URL || "http://localhost:5173");
    mainWindow.webContents.openDevTools();
  }
}

// ==========================================
// MENU BAR
// ==========================================
function buildMenu() {
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" } : { role: "quit" }],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(!app.isPackaged ? [{ type: "separator" }, { role: "toggleDevTools" }] : []),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Check for Updates\u2026",
          click: async () => {
            if (!mainWindow) return;
            mainWindow.webContents.send("update-message", "Checking for updates\u2026");
            try {
              if (isMac) {
                const result = await checkForUpdatesMac();
                if (!result.success) {
                  dialog.showMessageBox(mainWindow, {
                    type: "error",
                    title: "Update Check Failed",
                    message: `Could not check for updates: ${result.error || "Unknown error"}`,
                    buttons: ["OK"],
                  });
                  return;
                }
                if (!result.updateAvailable) {
                  dialog.showMessageBox(mainWindow, {
                    type: "info",
                    title: "No Updates Available",
                    message: `You are already on the latest version (v${result.currentVersion}).`,
                    buttons: ["OK"],
                  });
                  return;
                }
                const { response } = await dialog.showMessageBox(mainWindow, {
                  type: "info",
                  title: "Update Available",
                  message: `Version v${result.latestVersion} is available (you have v${result.currentVersion}).`,
                  detail: result.dmgUrl
                    ? "Click Download to save the installer, or View Release to open the releases page."
                    : "Click View Release to download the latest version.",
                  buttons: result.dmgUrl
                    ? ["Download", "View Release", "Later"]
                    : ["View Release", "Later"],
                  defaultId: 0,
                  cancelId: result.dmgUrl ? 2 : 1,
                });
                if (result.dmgUrl && response === 0) {
                  mainWindow.webContents.send("update-message", "Downloading update\u2026");
                } else if (
                  (result.dmgUrl && response === 1) ||
                  (!result.dmgUrl && response === 0)
                ) {
                  shell.openExternal(`https://github.com/${GITHUB_REPO}/releases/latest`);
                }
              } else {
                const checkResult = await autoUpdater.checkForUpdates();
                const currentVersion = app.getVersion();
                const latestVersion = checkResult?.updateInfo?.version || currentVersion;
                if (latestVersion === currentVersion) {
                  dialog.showMessageBox(mainWindow, {
                    type: "info",
                    title: "No Updates Available",
                    message: `You are already on the latest version (v${currentVersion}).`,
                    buttons: ["OK"],
                  });
                }
              }
            } catch (err) {
              console.error("[Menu] Check for updates failed:", err);
              dialog.showMessageBox(mainWindow, {
                type: "error",
                title: "Update Check Failed",
                message: `Could not check for updates: ${err.message}`,
                buttons: ["OK"],
              });
            }
          },
        },
        { type: "separator" },
        {
          label: "View Release Notes",
          click: () => {
            shell.openExternal(`https://github.com/${GITHUB_REPO}/releases/latest`);
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}


// ==========================================
// FOCUS RECOVERY
// ==========================================
ipcMain.on("force-refocus-window", (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return;
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
  migrateProtectedData(db);
  createWindow();
  buildMenu();

  if (app.isPackaged && !isMac) {
    // autoDownload handles the transfer; no OS notification is shown here.
    autoUpdater.checkForUpdates().catch((error) => {
      console.error("[Updater] Startup update check failed:", error);
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch(error => {
  dialog.showErrorBox('Unable to open protected data', error.message);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
