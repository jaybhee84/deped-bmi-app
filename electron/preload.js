const { contextBridge, ipcRenderer } = require("electron");

console.log("PRELOAD LOADED");

contextBridge.exposeInMainWorld("sqlite", {
  test: () => "SQLite Ready",

  // =========================
  // STUDENTS
  // =========================

  saveStudents: (students) =>
    ipcRenderer.invoke(
      "students:save",
      students
    ),

  loadStudents: () =>
    ipcRenderer.invoke(
      "students:load"
    ),

  // =========================
  // SCHOOLS
  // =========================

  // `userId` scopes this device's cached school to whichever account set
  // it up, so a second account on the same device doesn't inherit it.
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

    // =========================
  // SBFP CONFIG
  // =========================

  loadSbfpConfig: () =>
    ipcRenderer.invoke(
      "sbfpConfig:load"
    ),

  saveSbfpConfig: (config) =>
    ipcRenderer.invoke(
      "sbfpConfig:save",
      config
    ),
  
  clearSchool: () =>
    ipcRenderer.invoke(
      "school:clear"
    ),

  // =========================
  // SCHOOL LOGO (separate from school info)
  // =========================

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
// PRINT & PREVIEW
// =========================

contextBridge.exposeInMainWorld("electronAPI", {
  // Unified secure channel to send data for both portrait and landscape previews
  generatePrintPreview: (payload) => ipcRenderer.send("generate-pdf-preview", payload),

  getAppVersion: () =>
    ipcRenderer.invoke("app:getVersion"),
  
  checkForUpdates: () =>
  ipcRenderer.invoke("app:checkForUpdates"),

  // Forces the OS window to properly re-acquire keyboard focus.
  // Works around a known Windows/Electron bug where the window appears
  // active but Chromium keeps routing keyboard input to a stale window
  // state — symptom: clicking an input does nothing, and even Tab alone
  // doesn't fully fix it until the user switches away and back. Call this
  // right after any screen transition where that's been observed (e.g.
  // logout back to the Login screen).
  forceRefocusWindow: () => ipcRenderer.send("force-refocus-window"),
onUpdateMessage: (callback) => {
  const listener = (_, message) => callback(message);
  ipcRenderer.on("update-message", listener);
  return () => ipcRenderer.removeListener("update-message", listener);
},

  // NEW: auto-update
  onUpdateReady: (callback) => ipcRenderer.on("update-ready", callback),
  restartForUpdate: () => ipcRenderer.send("restart-app-for-update"),
});

