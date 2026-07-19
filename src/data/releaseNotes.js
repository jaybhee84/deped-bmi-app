export const RELEASE_NOTES = {
  "1.0.4": {
    // ...your existing 1.0.4 entry
  },
  "1.0.5": {
    date: "2026-07-19", // update to today's actual push date
    title: "DepEd BMI App — Version 1.0.5",
    sections: [
      {
        heading: "🛠️ Fixes",
        items: [
          "Fixed macOS auto-update failures by adding a ZIP build target alongside the DMG installer, so electron-updater can properly detect and apply updates on Mac.",
        ],
      },
    ],
  },
};