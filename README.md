# DepEd BMI App

Desktop nutritional-status and School-Based Feeding Program (SBFP) management system for DepEd schools and Schools Division Office personnel.

The application helps schools record learner measurements, calculate nutritional classifications, identify SBFP beneficiaries, prepare official forms, and synchronize school data for division-level monitoring. It is designed to remain useful during unreliable connectivity by keeping a local SQLite copy and synchronizing with Supabase when a connection is available.

## Main features

### School workspace

- Dashboard with enrollment and nutritional-status summaries.
- Learner database with profiles and measurement history.
- Baseline Entry for batch encoding of learner measurements and health information.
- Automatic BMI-for-age and height-for-age classification using the learner's age on the measurement date.
- SBFP beneficiary identification using nutritional status and SDO-configured grade-level criteria.
- Editable SBFP Form 1 and Form 2 with Excel downloads.
- Nutritional-status reports for Baseline, Midline, and Endline periods.
- School information, signatories, enrollment totals, and school-logo management.
- CSV import/export and offline data entry.

### SDO / division workspace

- Consolidated dashboard across connected elementary schools.
- Read-only access to school learner databases.
- Consolidated reports with school, school-year, and assessment-period filters.
- School-level SBFP form viewing and downloads.
- Central configuration for SBFP beneficiary criteria and school information.

### Desktop and synchronization

- Windows and macOS desktop packages built with Electron.
- Local SQLite storage for offline access.
- Supabase-backed authentication, cloud storage, and multi-device synchronization.
- School-scoped upload queues and conflict-safe synchronization.
- Background update checks and packaged-app release updates.
- Responsive SBFP forms for laptop and smaller-screen use.

## Technology

- React 19 and Vite 8
- Electron 43
- SQLite through `better-sqlite3`
- Supabase
- ExcelJS, Papa Parse, PDF-Lib, and QR Code React
- GitHub Actions and electron-builder

## Requirements

For local development:

- Node.js 22 or newer
- npm
- A supported Windows or macOS development environment
- Network access for cloud synchronization features

## Installation for users

Download the latest installer from the [GitHub Releases](https://github.com/jaybhee84/deped-bmi-app/releases) page.

- Windows: download and run the `.exe` installer.
- macOS: download the `.dmg`, then drag the app into the Applications folder.

User accounts and school assignments are managed by the authorized DepEd system administrator. Do not use development or shared credentials in a production school workspace.

## Local development

Clone the repository and install dependencies:

```bash
git clone https://github.com/jaybhee84/deped-bmi-app.git
cd deped-bmi-app
npm install
```

Start the web development server:

```bash
npm run dev
```

Start Vite and Electron together:

```bash
npm run dev:electron
```

## Supabase configuration

The application supports these Vite environment variables:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-anon-key
```

Create a local `.env` file when using a separate Supabase project. Environment files are ignored by Git. Use only a publishable/anonymous client key in the renderer; never place a Supabase service-role key in the application.

Database changes are stored in [`supabase/migrations`](supabase/migrations). Apply the required migrations to the target Supabase project before testing cloud-backed features.

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run dev:electron` | Start Vite and launch the Electron desktop shell. |
| `npm run build` | Create the production web bundle in `dist`. |
| `npm run lint` | Run Oxlint checks. |
| `npm run preview` | Preview the production web bundle. |
| `npm run dist` | Build desktop installers with electron-builder. |
| `npm run release` | Build and publish a release through electron-builder and GitHub CLI. |

## Data flow

1. A school user signs in and is bound to an authorized school workspace.
2. Learner information and measurements are stored locally so encoding can continue offline.
3. Pending records are queued for the active school.
4. When online, pending local changes upload before newer cloud data is downloaded.
5. Division users receive consolidated, read-only views of synchronized school data.

Before importing, replacing, or clearing a large dataset, export a backup and verify the active school and school year.

## Reports and exports

The app produces learner and nutritional-status outputs including:

- CSV learner-data exports and imports.
- Nutritional-status reports by assessment period.
- SBFP beneficiary lists.
- Official-style SBFP Form 1 and Form 2 Excel workbooks.
- Printable learner and program reports.

Generated output should be reviewed by the responsible school or division personnel before official submission.

## Building desktop packages

Create the production bundle first:

```bash
npm run build
```

Then create platform packages:

```bash
npx electron-builder --win --publish never
npx electron-builder --mac --publish never
```

macOS packages should normally be built on macOS, and Windows packages on Windows. GitHub Actions builds both platforms for releases.

## Release process

Releases are automated by [`.github/workflows/release.yml`](.github/workflows/release.yml):

1. Update the version in `package.json` and `package-lock.json`.
2. Add the matching entry to `src/data/releaseNotes.js`.
3. Run `npm run lint` and `npm run build`.
4. Push the release commit to `main`.
5. GitHub Actions builds Windows and macOS packages, validates updater metadata, and publishes the versioned GitHub release.

## Privacy and responsible use

This application handles learner and school information. Deployments should follow applicable DepEd data-privacy policies and local access-control procedures. Limit accounts to authorized personnel, protect exported files, and avoid placing real learner data in issues, screenshots, test fixtures, or source-control commits.

## Project structure

```text
electron/              Electron main process, preload bridge, SQLite, and printing
public/                Icons, static assets, and Excel templates
scripts/               Release and validation utilities
src/components/        React screens and UI components
src/context/           Shared React context
src/data/              In-app release notes
src/utils/             Calculations, synchronization, exports, and Supabase helpers
supabase/migrations/   Cloud database migrations
```

## License and support

No open-source license is currently declared for this repository. Unless a license is added, the source code remains under the copyright holder's default rights.

For bugs or enhancement requests, use the repository's [GitHub Issues](https://github.com/jaybhee84/deped-bmi-app/issues) page and remove all learner-identifying information before submitting logs or screenshots.
