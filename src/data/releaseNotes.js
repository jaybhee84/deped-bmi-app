export const RELEASE_NOTES = {
  '4.0.0': {
    title: 'v4.0.0',
    sections: [
      {
        heading: 'Transferred and Not in School Learners',
        items: [
          'For Midline and Endline, type Transferred or Not in School in the Weight or Height column of the CSV. The learner is saved for that period with 0 weight and height and that note.',
          'These learners remain SBFP beneficiaries through Endline and appear in Nutritional Status, SBFP Beneficiaries, the Database, and the learner profile with their note.',
          'A learner recorded this way is no longer counted as weighed or measured in the summary report.',
        ],
      },
      {
        heading: 'CSV Template',
        items: [
          'The downloaded template now shows the class name on its first row.',
          'Learners already noted as Transferred or Not in School come prefilled in the template, including a Midline note carried into Endline.',
        ],
      },
      {
        heading: 'Nutritional Status Report (SDO)',
        items: [
          'Enrolment now counts the learners actually in the database, matching the Dashboard, instead of the old manually typed enrolment.',
          'SPED is removed; those learners are reported under SNED, and learners are grouped by their section.',
          'Numbers and percentages in the Excel download and the printout are centered.',
        ],
      },
    ],
  },
  '3.0.9': {
    title: 'v3.0.9',
    sections: [
      {
        heading: 'Print Preview',
        items: [
          'New in-app Print Preview for every report: choose the printer, copies, pages, paper, margins, scale, and color, with page-by-page preview and Ctrl + scroll zoom.',
          'All printouts are now laid out for Folio (8.5 × 13 in) paper.',
          'Reports with many classes or logos no longer fail with "The document is too large to print."',
        ],
      },
      {
        heading: 'Nutritional Status Report',
        items: [
          'The NS Report on screen is now the actual Folio page that prints, one class per page, with the DepEd seal, one-line learner names, BMI and HFA tallies, and the class adviser under "Prepared by".',
          'Added a Print NS Report button, and the Excel download now matches the printed layout with one worksheet per class.',
        ],
      },
      {
        heading: 'SBFP Beneficiaries Filter',
        items: [
          'Dashboard, Database, Nutritional Status, and the NS Report can now show SBFP Beneficiaries only — learners who qualified at the school year’s Baseline.',
          'CSV measurement upload has a Learners filter: SBFP beneficiaries can be uploaded for Baseline, Midline, and Endline; all learners for Baseline and Endline.',
          'Nutritional Status now also shows male/female totals, height-for-age counts, and a "No data" count so the numbers always add up.',
        ],
      },
      {
        heading: 'Sync and Display',
        items: [
          'Changes and deletions made in the online database now appear on every open device automatically, while unsaved local edits are uploaded first.',
          'Long school names now wrap on the Information page, which also shows the BuzzJay logo.',
        ],
      },
    ],
  },
  '3.0.8': {
    title: 'v3.0.8',
    sections: [
      {
        heading: 'Learner Records',
        items: [
          'Learner ID columns now show the registry number automatically when a learner has no LRN yet, so every row stays identifiable.',
          'Search by name, LRN, or registry number in both the school and SDO learner databases.',
          'LRNs recorded in the IECES portal now sync into BMI automatically, accepting both 12- and 13-digit formats.',
        ],
      },
      {
        heading: 'Allowed Users',
        items: [
          'Adding a registration email now also sets whether that account registers as School-Based or SDO Based, so it lands in the right role even from the wrong register card.',
          'Removing a user now fully deletes their Supabase sign-in, registered profile, and allowlist entry in one action instead of leaving orphaned accounts behind.',
          'Added a manual refresh button and a live "last updated" status to the Allowed Users list.',
        ],
      },
    ],
  },
  '3.0.7': {
    title: 'v3.0.7',
    sections: [
      {
        heading: 'Nutritional Status Reports',
        items: [
          'Added a class-based Nutritional Status Report preview and Excel download with learner measurements, BMI and height-for-age classifications, summary counts, and adviser details.',
          'Improved folio-page sizing, column widths, merged headers, equal row heights, signature spacing, and print-ready Excel formatting.',
          'Excel reports now keep one blank row after the final learner, remove unused template rows and artifacts, and use a floating BMI formula image that does not disturb worksheet borders.',
        ],
      },
      {
        heading: 'School Dashboard Charts',
        items: [
          'Replaced the school-based dashboard line graphs with the same animated period bars and percentage comparisons used by the SDO dashboard.',
          'Added click-to-enlarge chart cards for Baseline, Midline, Endline, and combined period comparisons.',
          'Corrected school chart category mappings so Normal Height, Severely Stunted, Severely Wasted, and Obese counts display independently and accurately.',
        ],
      },
      {
        heading: 'Data and Classification Improvements',
        items: [
          'Improved measurement-date age handling and nutritional-status classification consistency across data entry, reports, and exported workbooks.',
          'Improved IECES adviser and school-report information used in class-based outputs.',
        ],
      },
    ],
  },
  '3.0.6': {
    title: 'v3.0.6',
    sections: [
      {
        heading: 'Managed School User Access',
        items: [
          'Added an SDO Allowed Users page for managing authorized DepEd email addresses and viewing registered School-Based accounts.',
          'Registered-user details now include the full name, email, school name and logo, position, online status, and last activity.',
          'BMI registration now uses bmi_allowed_users as the authoritative email allowlist, while registered profiles remain in bmi_profiles.',
        ],
      },
      {
        heading: 'Clearer SDO Dashboard Analytics',
        items: [
          'Replaced misleading category line profiles with animated count bars and percentage-based stacked period comparisons.',
          'Added clear no-data states and an enrolment reconciliation summary for learners without complete height and weight measurements.',
          'Corrected total learner calculations to use IECES enrolled learners and the Baseline learner entries saved under each other school ID.',
        ],
      },
      {
        heading: 'Interface Improvements',
        items: [
          'Improved sidebar contrast, navigation ordering, icons, and profile-card alignment.',
          'Enhanced the SDO Information page with a responsive creator image panel.',
          'Improved grade-level table headings, legends, school details, and responsive column layouts.',
        ],
      },
    ],
  },
  '3.0.5': {
    title: 'v3.0.5',
    sections: [
      {
        heading: 'New Database and Migration of Data',
        items: [
          'Standalone Data in place.',
        ],
      },
    ],
  },
  '3.0.4': {
    title: 'v3.0.4',
    sections: [
      {
        heading: 'Shared Owner Access',
        items: [
          'The IECES system owner can now sign in to DepEd BMI with the same secured account used by the Dashboard Manager.',
          'Missing owner access is initialized automatically after successful authentication without storing or hardcoding a password.',
        ],
      },
    ],
  },
  '3.0.3': {
    title: 'v3.0.3',
    sections: [
      {
        heading: 'Flexible Sign In',
        items: [
          'Users can now sign in with either their username or registered email address.',
        ],
      },
    ],
  },
  '3.0.2': {
    title: 'v3.0.2',
    sections: [
      {
        heading: 'Managed Registration Access',
        items: [
          'Registration now requires the email address to be approved for DepEd BMI in the IECES Dashboard Manager.',
          'Email addresses are normalized before account and profile creation for consistent access checks.',
        ],
      },
    ],
  },
  '3.0.1': {
    title: 'v3.0.1',
    sections: [
      {
        heading: 'Consistent SBFP Configuration',
        items: [
          'Added SNED to SDO SBFP settings and made beneficiary lists, reports, forms, and dashboards consistently follow the grade levels and nutritional-status criteria configured by the SDO.',
          'Dashboard learner totals and nutrition-report enrollment totals now come directly from current learner records instead of the retired manual enrollment entries.',
          'Added SBFP Beneficiaries and clickable No Data summaries to both school and SDO dashboards.',
        ],
      },
      {
        heading: 'Previous-Year Beneficiary Data',
        items: [
          'SBFP forms now determine previous-year beneficiary status from the immediately preceding school year Baseline record when that data is available.',
          'Added an IECES-only Previous-Year Form 1 Excel import as a fallback when prior-year records are unavailable, with conservative name, sex, and birthdate matching.',
          'Matched Form 1 learners are marked as previous-year beneficiaries, and uploaded 4Ps membership is carried into the current learner record when marked Yes.',
        ],
      },
      {
        heading: 'Forms and Reporting Improvements',
        items: [
          'Form 2 now allows the feeding start date to be entered manually once and automatically displays the same date for all beneficiary rows and Excel exports.',
          'Improved the SBFP Forms filter and upload layout for clearer use on smaller screens.',
          'Baseline, Midline, and Endline nutritional classifications remain tied to each saved measurement record and measurement date.',
        ],
      },
    ],
  },
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
