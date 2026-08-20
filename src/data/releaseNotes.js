export const RELEASE_NOTES = {
  '3.0.0': {
    title: 'v3.0.0',
    sections: [
      {
        heading: 'Division-Scale Learner Synchronization',
        items: [
          'Supabase downloads now use pagination so school and division databases load every learner beyond the previous 1,000-row response limit.',
          'Learners remain recorded and accounted for in the Database even when measurements or nutritional-status data are incomplete.',
        ],
      },
      {
        heading: 'SBFP Data and Grade Support',
        items: [
          'Added SNED as a supported grade level across entry, database, dashboard, reports, registry numbers, and SBFP workflows.',
          'Added a Nutritional Status filter to SBFP Beneficiaries for faster review, reporting, printing, and CSV export.',
          'Parent consent now defaults to Y, remains editable in SBFP Forms and the Database, and synchronizes consistently with Supabase.',
        ],
      },
      {
        heading: 'Modern Learner Databases',
        items: [
          'Refreshed the School and SDO database screens with clearer learner counts, modern filter panels, compact Y/N status controls, and cleaner table styling.',
          'Improved responsive behavior and scrolling so wide learner records remain usable on laptops and smaller displays.',
        ],
      },
    ],
  },
  '2.0.9': {
    title: 'v2.0.9',
    sections: [
      {
        heading: 'Persistent SBFP Form Responses',
        items: [
          'Y/N entries made directly in SBFP Form 1 now save to the learner record locally and synchronize to the cloud instead of being discarded when leaving the form.',
          'Added persistent deworming status with Y as the default while allowing school users to change and save N.',
        ],
      },
    ],
  },
  '2.0.8': {
    title: 'v2.0.8',
    sections: [
      {
        heading: 'SBFP Excel Downloads',
        items: [
          'Fixed the Failed to fetch error when downloading SBFP Form 1 from the packaged desktop application.',
          'SBFP Form 1 and Form 2 now load their bundled Excel templates reliably in both the Electron app and browser development mode.',
        ],
      },
    ],
  },
  '2.0.7': {
    title: 'v2.0.7',
    sections: [
      {
        heading: 'Responsive SBFP Forms',
        items: [
          'SBFP Forms now fit within the available content area on laptops and smaller screens instead of clipping the right side.',
          'Wide Form 1 and Form 2 tables can now be scrolled horizontally and vertically while keeping the surrounding form layout visible.',
          'Improved filter wrapping, compact spacing, table height, and Form 2 signature alignment for narrow or short displays.',
        ],
      },
    ],
  },
  '2.0.6': {
    title: 'v2.0.6',
    sections: [
      {
        heading: 'Sync Queue Fix',
        items: [
          'Stale pending uploads are now removed automatically instead of leaving an unsynced counter that cannot finish.',
          'Added a confirmed stop button that clears pending uploads without deleting the learner records stored on the device or in the cloud.',
          'Manual uploads now remain scoped to the active school to prevent another class or school copy from being downloaded after syncing.',
        ],
      },
    ],
  },
  '2.0.5': {
    title: 'v2.0.5',
    sections: [
      {
        heading: 'Sync and Session Reliability',
        items: [
          'Pending Baseline Entry records now upload before cloud data is downloaded after login, preventing an older server copy from replacing unsynced local changes.',
          'Improved online-presence tracking and sign-out cleanup for more reliable user sessions.',
        ],
      },
    ],
  },
  '2.0.4': {
    title: 'v2.0.4',
    sections: [
      {
        heading: 'Dashboard and Sync Fixes',
        items: [
          'Fixed a blank screen that could appear after login while the Dashboard calculated nutritional-status charts from saved learner records.',
          'Corrected the sync indicator so it refreshes immediately after automatically uploading locally saved Baseline Entry data.',
        ],
      },
    ],
  },
  '2.0.3': {
    title: 'v2.0.3',
    sections: [
      {
        heading: 'Enrollment Totals',
        items: [
          'Total enrollment now uses matching school-year learner enrollment from the shared IECES Portal first, with official manual SBFP enrollment as the fallback when portal data is unavailable.',
          'Added school-year support to the shared learner registry so future enrollment periods can supply totals automatically without changing existing school-year figures.',
        ],
      },
      {
        heading: 'Nutritional Status Accuracy',
        items: [
          "BMI-for-age and height-for-age classifications now use each learner's age on the recorded Date Measured instead of their age on the current date.",
          'Applied measurement-date classification consistently across Baseline Entry, CSV previews, learner profiles, databases, dashboards, reports, and SBFP forms.',
        ],
      },
      {
        heading: 'Baseline Entry',
        items: [
          'Grade Level now starts clear and must be selected explicitly; the Session field appears only when Kinder is selected.',
          "Standardized Baseline Entry action buttons to the application's navy theme, including hover, active, focus, and disabled states.",
        ],
      },
    ],
  },
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
