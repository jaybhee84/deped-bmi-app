// ============================================================
// preload.js — ADD this to your existing contextBridge.exposeInMainWorld
// block (the one that already exposes window.sqlite, etc.)
// ============================================================

const { contextBridge, ipcRenderer } = require("electron");

// If you already have a contextBridge.exposeInMainWorld("sqlite", {...})
// call in this file, just add the printReport method into that same
// object (or a new one) instead of adding a second exposeInMainWorld
// call for the same key name.

contextBridge.exposeInMainWorld("electronAPI", {
  printReport: () => ipcRenderer.invoke("print-report"),
});
