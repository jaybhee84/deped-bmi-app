export const RELEASE_NOTES = {
  '2.0.2': {
    silent: true,
  },
  '2.0.1': {
    silent: true,
  },
  '2.0.0': {
    title: 'v2.0.0',
    sections: [
      {
        heading: 'Measurement Data and Reports',
        items: [
          'Standardized learner height entry, display, CSV templates, and reports to metres while retaining compatibility with older centimetre records.',
          'Updated BMI calculations and height formatting across Baseline Entry, learner profiles, the database, nutritional reports, and SBFP beneficiary reports.',
        ],
      },
      {
        heading: 'SBFP Forms and Beneficiary Information',
        items: [
          'SBFP Form 1 now uses each learner’s Date Measured from Batch/Baseline Entry as the Date of Weighing or Measuring on screen and in Excel downloads.',
          'Added an official SBFP beneficiary criteria card showing automatic grade-level inclusion, nutritional-status criteria, and their SDO-configured grade scopes.',
        ],
      },
      {
        heading: 'School Information and Onboarding',
        items: [
          'Expanded the School Information layout and kept school names on a single responsive line.',
          'Connected District and Complete Address to onboarding and authoritative school records, with local caching for offline use.',
          'Standardized the displayed division as Division of Isabela City.',
        ],
      },
    ],
  },
  '1.10.1': {
    silent: true,
  },
  '1.9.1': {
    silent: true,
  },
  '1.8.1': {
    title: 'v1.8.1',
    sections: [
      {
        heading: 'SBFP Forms',
        items: [
          'Added editable SBFP Form 1 and Form 2 with layouts based on the official DepEd spreadsheet formats.',
          'Added automatic local saving for school-specific form details and protected school name and ID fields.',
          'Added multi-cell Y/N entry for yes-or-no columns, including selection and keyboard entry.',
          'Added formatted Excel downloads for both forms with abbreviated school filenames.',
          'Added read-only SBFP form viewing and Excel downloads for SDO personnel with school selection.',
        ],
      },
      {
        heading: 'Reports and Learner Records',
        items: [
          'Added learner nutritional-status history from Kinder through Grade 6 for Baseline, Midline, and Endline.',
          'Saved the learner section with new batch and profile health records for accurate grade-level history.',
          'Improved SBFP Form 2 headers, spacing, alignment, totals, signatories, and feeding-date presentation.',
          'Improved nutritional report controls and made SDO school selectors compact, alphabetical, and count-aware.',
        ],
      },
      {
        heading: 'Data and Interface Improvements',
        items: [
          'Limited SDO school databases and report selectors to the current elementary-school list.',
          'Added school counts across division-level school dropdowns.',
          'Improved BMI and height-for-age calculations for records whose height was stored in metres.',
          'Updated profile styling and prevented accidental closing of the health-record editor.',
        ],
      },
      {
        heading: 'Application Updates',
        items: [
          'Updates now download silently in the background and prompt only when ready to install.',
          'Added one-click silent installation followed by automatic app restart and relaunch.',
        ],
      },
    ],
  },
};
