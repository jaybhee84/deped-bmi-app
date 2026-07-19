export const RELEASE_NOTES = {
  "1.0.4": {
    date: "2026-07-19",
    title: "DepEd BMI App — Version 1.0.4",
    sections: [
      {
        heading: "🛠️ Cross-Platform Navigation Optimizations",
        items: [
          "Resolved macOS Window Trapping Bugs: Fixed an interface layout problem where Apple macOS platform display behaviors hid top-header native application control boundaries during high-resolution data previews.",
          "Expanded Context Bridge Capabilities: Exposed a secure closeWindow abstraction layer inside the Electron isolation system, mapping main process runtime actions cleanly to user interactions.",
          "Integrated Explicit Escape Actions: Embedded a dedicated \"❌ Close Preview\" action interface element on the SDO Division Reporting view. This allows users to drop back to the dashboard seamlessly on both Windows and macOS systems without relying on native title bars.",
        ],
      },
      {
        heading: "📊 SDO Dashboard: Division-Wide Reporting Overview",
        items: [
          "Added a 'Schools Reporting' pie chart to the SDO Dashboard, showing what percentage of all division schools have submitted learner data for the currently selected School Year and Period.",
          "The chart updates automatically whenever the Period or School Year filter is changed — no manual refresh needed.",
        ],
      },
      {
        heading: "✨ Improvements",
        items: [
          "Redesigned the SDO Dashboard stat cards (Total Learners, Normal, Wasted, etc.) into a cleaner, more compact layout.",
          "Renamed the 'With Records' stat card to 'Learners with Records' for clarity.",
          "Stat cards and the new Schools Reporting chart are now displayed side-by-side in an even 50/50 split, with the layout stacking vertically on smaller screens.",
        ],
      },
      {
        heading: "🐛 Fixes",
        items: [
          "Fixed a visual glitch where the reporting chart showed a stray green dot even when 0% of schools had reported.",
        ],
      },
    ],
  },
};