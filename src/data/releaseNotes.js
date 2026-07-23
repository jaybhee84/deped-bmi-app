export const RELEASE_NOTES = {
  "1.1.2": {
  title: "v1.1.2",
  sections: [
    {
      heading: "✨ Improvements",
      items: [
        "Baseline Entry and CSV uploads no longer require a birthdate, weight, or height to save — learners with incomplete measurements can now be saved and completed later instead of being silently skipped",
        "Height values pasted or uploaded in meters (e.g. 1.20) are now automatically converted to centimeters to match the app's stored format",
        "Learner names in the Dashboard's \"Learners with Incomplete Data\" table are now clickable — double-click a name to jump straight to that learner's profile with the Add Health Record form already open",
        "The Database table now shows Weight and Height columns directly, placed right before Latest BMI",
        "SBFP Beneficiaries' Export CSV now includes the full computed report (BMI, Nutritional Status, Height Status, Reason for Inclusion) instead of a mostly-blank template",
        "Added a Section filter to SBFP Beneficiaries that appears once a specific Grade Level is selected, so you can narrow beneficiaries down to one class",
      ],
    },
    {
      heading: "🛠 Fixes",
      items: [
        "Fixed the \"Learners with Incomplete Data\" table on the Dashboard where the Age column was oversized and empty while the Grade Level - Section and Remarks columns were cut off, forcing an awkward horizontal scroll",
        "Fixed the Age column losing its vertical centering on rows that wrap to two lines",
        "Fixed the Add Health Record form on a learner's Profile defaulting to outdated school year/period values (2025–2026 / Q1), which could cause a new measurement to be saved under the wrong period",
        "Fixed saved weight/height not showing up on the Profile page — a new measurement was being added as a duplicate record instead of replacing the existing one for that period, and the page was still displaying the old, incomplete record",
        "Removed the unreliable Import CSV feature from SBFP Beneficiaries",
      ],
    },
  ],
},
};