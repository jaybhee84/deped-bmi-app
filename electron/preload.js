const { contextBridge, ipcRenderer } = require("electron");

console.log("PRELOAD LOADED");

// =========================
// SQLITE DATA INTERACTION LAYER
// =========================
contextBridge.exposeInMainWorld("sqlite", {
  test: () => "SQLite Ready",

  // STUDENTS
  saveStudents: (students) =>
    ipcRenderer.invoke(
      "students:save",
      students
    ),

  loadStudents: () =>
    ipcRenderer.invoke(
      "students:load"
    ),

  // SCHOOLS
  saveSchool: (school, userId) =>
    ipcRenderer.invoke(
      "school:save",
      { school, userId }
    ),

  loadSchool: (userId) =>
    ipcRenderer.invoke(
      "school:load",
      userId
    ),

  loadSchoolWithLogo: (userId) =>
    ipcRenderer.invoke(
      "school:loadWithLogo",
      userId
    ),
  
  clearSchool: () =>
    ipcRenderer.invoke(
      "school:clear"
    ),

  // SBFP CONFIG
  loadSbfpConfig: () =>
    ipcRenderer.invoke(
      "sbfpConfig:load"
    ),

  saveSbfpConfig: (config) =>
    ipcRenderer.invoke(
      "sbfpConfig:save",
      config
    ),

  // SCHOOL LOGO
  saveSchoolLogo: (payload) =>
    ipcRenderer.invoke(
      "school:saveLogo",
      payload
    ),

  loadSchoolLogo: (schoolId) =>
    ipcRenderer.invoke(
      "school:loadLogo",
      schoolId
    ),

  deleteSchoolLogo: (schoolId) =>
    ipcRenderer.invoke(
      "school:deleteLogo",
      schoolId
    ),

  // SBFP ENROLMENT (offline-first local SQLite — mirrors sbfp_enrolment in
  // Supabase). These back the window.sqlite.saveEnrolment / loadEnrolment /
  // markEnrolmentClean / getDirtyEnrolment calls already made throughout
  // sbfpConfig.js; without them those calls silently resolved to undefined.
  saveEnrolment: (schoolId, sy, data, total) =>
    ipcRenderer.invoke(
      "sbfp-enrolment:save",
      schoolId,
      sy,
      data,
      total
    ),

  loadEnrolment: (schoolId, sy) =>
    ipcRenderer.invoke(
      "sbfp-enrolment:load",
      schoolId,
      sy
    ),

  markEnrolmentClean: (schoolId, sy) =>
    ipcRenderer.invoke(
      "sbfp-enrolment:markClean",
      schoolId,
      sy
    ),

  getDirtyEnrolment: () =>
    ipcRenderer.invoke(
      "sbfp-enrolment:dirty"
    ),

  getEnrolmentTotals: (sy) =>
    ipcRenderer.invoke(
      "sbfp-enrolment:totals",
      sy
    ),
<<<<<<< HEAD

  // SCHOOL LOGO CACHE (bulk preload, name-keyed — see logoCache.js)
  saveLogoToCache: (schoolKey, filename, dataUrl) =>
    ipcRenderer.invoke(
      "logo-cache:save",
      { schoolKey, filename, dataUrl }
    ),

  loadLogoFromCache: (schoolKey) =>
    ipcRenderer.invoke(
      "logo-cache:load",
      schoolKey
    ),

  loadAllCachedLogos: () =>
    ipcRenderer.invoke(
      "logo-cache:loadAll"
    ),

  getCachedLogoKeys: () =>
    ipcRenderer.invoke(
      "logo-cache:keys"
    ),
=======
>>>>>>> 3492e0e17071ff1ffc19b4d75d43e6ecc25deb13
});

// =========================
// GENERIC IPC BRIDGE
// =========================
contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  },
});

// =========================
// PRINT, PREVIEW & SYSTEM APIS
// =========================
contextBridge.exposeInMainWorld("electronAPI", {
  // Generates print preview using single or multi-page formats
  generatePrintPreview: (payload) => ipcRenderer.send("generate-pdf-preview", payload),
  
  // Triggers final printed hardcopies from the native dialogue engine
  printReport: () => ipcRenderer.invoke("print-report"),

  // Application Details & Updater Callbacks
  getAppVersion: () =>
    ipcRenderer.invoke("app:getVersion"),
  
  checkForUpdates: () =>
    ipcRenderer.invoke("app:checkForUpdates"),
<<<<<<< HEAD

  // macOS-only manual update path (no code signing yet, so no silent
  // Squirrel.Mac self-update). Mirrors checkForUpdates' shape: main.js
  // returns { platform: "darwin", updateAvailable, dmgUrl, dmgName, ... }
  // from app:checkForUpdates when running on mac, and this downloads +
  // opens that .dmg so the user can drag-install it.
  downloadUpdateMac: (payload) =>
    ipcRenderer.invoke("app:downloadUpdateMac", payload),

  openReleasesPage: () =>
    ipcRenderer.invoke("app:openReleasesPage"),

  onDownloadProgress: (callback) => {
    const listener = (_, percent) => callback(percent);
    ipcRenderer.on("update-download-progress", listener);
    return () => ipcRenderer.removeListener("update-download-progress", listener);
  },
=======
>>>>>>> 3492e0e17071ff1ffc19b4d75d43e6ecc25deb13

  forceRefocusWindow: () => ipcRenderer.send("force-refocus-window"),
  
  // WINDOW ACTIONS (New cross-platform window management addition)
  closeWindow: () => ipcRenderer.send("close-current-window"),

  onUpdateMessage: (callback) => {
    const listener = (_, message) => callback(message);
    ipcRenderer.on("update-message", listener);
    return () => ipcRenderer.removeListener("update-message", listener);
  },

  onUpdateReady: (callback) => ipcRenderer.on("update-ready", callback),
  restartForUpdate: () => ipcRenderer.send("restart-app-for-update"),
});