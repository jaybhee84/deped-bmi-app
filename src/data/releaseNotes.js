export const RELEASE_NOTES = {
  "1.1.3": {
    title: "v1.1.3",
    sections: [
      {
        heading: "✨ Improvements",
        items: [
          "Auto-Updater Integration: Windows builds now download updates in the background and prompt you with a native dialog to restart and install once ready",
          "Real-Time Download Progress: Added live percentage progress feedback directly in the sidebar during updates",
          "Scrollable Release Notes Modal: Redesigned the release notes window with a scrollable content area so the 'Continue' button stays pinned at the bottom",
          "Seamless Window Focus: Improved window refocusing behavior so the main app automatically regains focus after dismissing update dialogs",
        ],
      },
      {
        heading: "🛠 Fixes",
        items: [
          "Fixed an issue where checking for updates on Windows would complete successfully but fail to trigger the download or installation prompt",
          "Fixed missing version comparison metadata in the Windows auto-updater background checks",
          "Fixed Release Notes modal expanding beyond screen boundaries and blocking access to the action button on long update logs",
        ],
      },
    ],
  },
};