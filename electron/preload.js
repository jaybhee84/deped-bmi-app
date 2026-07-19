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