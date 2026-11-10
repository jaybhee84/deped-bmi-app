# Security and bug audit — 10 November 2026

What this repo does: DepEd BMI App stores learner health and identity records, computes nutritional status, prepares school reports, and synchronizes school and division workspaces. This review assumes one authorized staff member per desktop session and concurrent school users sharing Supabase. It prioritizes disclosure of learner data, privilege changes, data loss, and incorrect reports.

This is a source and local-runtime review, not a certification or a claim that every bug has been found. Existing uncommitted changes were preserved. No live learner records, production credentials, or deployed databases were changed.

## Must fix — source fixes completed; cloud changes require deployment

1. **Shared administrator credentials shipped in the app** ([Login.jsx](src/components/Login.jsx), [migration](supabase/migrations/20261110000000_harden_bmi_permissions.sql)).
   - **What this is:** A hidden login used fixed passwords and a shared division account.
   - **Problem:** Anyone extracting the client bundle could authenticate as that account. Hiding a screen does not protect credentials.
   - **Fix:** Removed both passwords. Administrator login now uses an individual online account and checks its division profile. The migration bans the exposed account, removes its sessions, profile, and allowlist entry; account-management attribution uses the actual signed-in identity.
   - **If we skip it:** Old distributed builds still contain working credentials until the server account is revoked. **Treat that credential as compromised and apply the server change urgently.**

2. **School users could promote their own role** ([baseline policy](supabase/migrations/20260801000000_create_bmi_baseline.sql), [permission guard](supabase/migrations/20261110000000_harden_bmi_permissions.sql)).
   - **What this is:** The profile update policy checked ownership of a row, but not which columns changed.
   - **Problem:** A school user could update their own `role` to `division`, then pass the manager checks used by other tables. The later profile-insert policy also did not restrict assigned roles.
   - **Fix:** Added a server trigger blocking self-service identity and role changes, validates roles against administrator assignments, and removed direct client profile insertion. Signup still creates profiles through its server trigger.
   - **If we skip it:** Client-side role checks cannot stop direct API calls. **The migration must be applied for this fix to exist in production.**

3. **Users could bind themselves to an arbitrary school** ([Settings.jsx](src/components/Settings.jsx), [Allowed Users](src/components/SDOAllowedUsers.jsx), [migration](supabase/migrations/20261110000000_harden_bmi_permissions.sql)).
   - **What this is:** Changing a profile's `school_id` changes its row-level data access.
   - **Problem:** Self-updating that field could grant access to another school's learners.
   - **Fix:** School users may bind only to an administrator-approved school. Added an assignment selector to Allowed Users. The migration preserves existing assignments for review; it does not prove those historical assignments were authorized.
   - **If we skip it:** A legitimate login can become a cross-school data disclosure. Administrators must review existing roles and school assignments before trusting them.

4. **Learner photos were public and broadly writable** ([Profile.jsx](src/components/Profile.jsx), [photo function](supabase/functions/upload-learner-photo/index.ts), [migration](supabase/migrations/20261110000000_harden_bmi_permissions.sql)).
   - **What this is:** The `profiles` bucket exposed public URLs; broad policies allowed authenticated users to overwrite images.
   - **Problem:** A copied URL bypassed application login, and predictable filenames could collide.
   - **Fix:** Prepared a private bucket and school-scoped upload/read policies. Photos use random filenames, a 5 MB type/size limit, and ten-minute authorized links refreshed while the profile is open. The school-project function verifies learner access before signing a link. Existing stored public URLs serve only as object locators after the bucket becomes private.
   - **If we skip it:** Existing public links remain usable. Apply the division migration and the separate [school bucket change](supabase/tests/private-school-photos.sql); inspect additional live policies and coordinate other portal consumers first. Previously downloaded copies cannot be recalled.

5. **Local learner records and cached tokens were plaintext** ([protected-data.js](electron/protected-data.js), [database.js](electron/database.js), [secureStorage.js](src/utils/secureStorage.js)).
   - **What this is:** SQLite stored learner JSON directly, and browser storage held persistent caches and Supabase tokens.
   - **Problem:** Copying the app's profile exposed readable health records, identities, and credentials.
   - **Fix:** Learner/enrolment JSON, full offline profiles, cached email/username values, and persistent browser caches now use Electron's OS-protected storage. Existing learner/enrolment rows migrate transactionally. SQLite secure deletion, checkpointing, and compaction reduce legacy plaintext remnants. No plaintext fallback is allowed for encrypted records; unavailable OS encryption stops startup. Browser-only recovery keeps new tokens in memory.
   - **If we skip it:** Device or backup theft exposes readable application records. This is **payload encryption, not full database or disk encryption**: IDs, school metadata, dirty flags, and identity lookup digests remain visible. Use BitLocker/FileVault and protected backups. SSD remnants, historical backups, browser history, and exported documents are outside this migration's erasure guarantees.

6. **Offline passwords were stored and compared as plaintext** ([auth.js](src/utils/auth.js), [security.js](electron/security.js), [database.js](electron/database.js)).
   - **What this is:** Browser storage contained `{profile, password}`, and SQLite's `password_hash` could hold the password itself.
   - **Problem:** Reading the cache disclosed reusable account passwords. Offline access also had no renewal boundary.
   - **Fix:** Removed plaintext browser credential caches and the default local administrator password. Desktop caching now uses random-salt scrypt verifiers. Offline profiles expire after seven days; repeated failures are delayed after five attempts. The obsolete offline cache is reset, requiring one online sign-in after upgrading. Passwords are omitted from returned and encrypted cached profiles.
   - **If we skip it:** A copied profile compromises online accounts as well as local records. Offline revocation is not instantaneous; a previously authorized disconnected device can retain access until renewal expires. Process-local attempt limits reset when the app restarts.

7. **Update downloads accepted renderer-controlled paths and used the wrong release repository** ([security.js](electron/security.js), [main.js](electron/main.js)).
   - **What this is:** The Mac download handler accepted a URL and output filename from the renderer.
   - **Problem:** A filename containing `../` could write outside Downloads, and an arbitrary URL could deliver an unwanted file. Mac update checks pointed at the private source repository instead of the public release repository.
   - **Fix:** Restricted the initial download URL to HTTPS release assets in the configured public repository; filenames must be a matching simple `.dmg` basename. Corrected the repository.
   - **If we skip it:** A compromised renderer can abuse file downloads, and Mac users miss releases. Release signing remains a deployment requirement; URL validation is not code-signature verification.

8. **Desktop trust boundaries were incomplete** ([main.js](electron/main.js), [index.html](index.html)).
   - **What this is:** Most IPC handlers did not verify the sending window/frame, and the main window lacked navigation and popup restrictions.
   - **Problem:** Untrusted frames could attempt privileged local operations. There was no page content security policy to constrain injected scripts.
   - **Fix:** Added main-window/main-frame checks to handled application IPC, explicit renderer sandboxing, popup/navigation restrictions, denied permission requests, and a content security policy. Protected storage has a narrow bridge with size/type checks. Existing context isolation and disabled Node integration remain enabled.
   - **If we skip it:** A renderer vulnerability has a larger path into local data. An attacker controlling the unlocked OS account remains outside the protection provided by this boundary.

9. **Privileged proxy reads could embed additional tables** ([handler.mjs](supabase/functions/school-data/handler.mjs)).
   - **What this is:** School-project requests use a server-only service key after checking the caller.
   - **Problem:** Embedded PostgREST selections on metadata tables could traverse related tables beyond the intended selection restrictions.
   - **Fix:** Rejected embedded/aliased selections on the service-key path. Added a regression test proving the request fails before forwarding. Existing learner-column and school-scope tests continue to pass.
   - **If we skip it:** Service credentials bypass normal row policies, so every permitted query shape becomes part of the security boundary. Deploy the updated function.

10. **Print documents could request external or local resources** ([printing.js](electron/printing.js)).
    - **What this is:** HTML is rendered in a hidden, script-disabled window and temporarily written to disk.
    - **Problem:** Script disabling alone does not prevent image/CSS requests that can expose report content or read unintended resources.
    - **Fix:** Added an isolated print session that permits only the exact main document and embedded data resources, plus restrictive temporary-file creation permissions where supported. Existing sandboxing, HTML escaping, size limits, and cleanup remain in place.
    - **If we skip it:** An imported value or future report change could introduce an unwanted request. Temporary HTML is still plaintext while printing; an app/OS crash may leave a file. Windows temp-folder ACLs and full-disk encryption remain necessary.

11. **JSON import merged unrelated learners and mutated existing state** ([mergeStudentImport.js](src/utils/mergeStudentImport.js), [ExportImport.jsx](src/components/ExportImport.jsx)).
    - **What this is:** Imports matched on LRN even when both learners had no LRN.
    - **Problem:** Unidentified learners could merge, malformed records could crash the update, and duplicate incoming measurements could be appended. A foreign-school export could enter the active workspace.
    - **Fix:** Validate learner shape before scheduling the update; merge only a real 12-digit LRN, preserve immutable state, deduplicate measurements, generate UUIDs, enforce active-school scope, and limit input file size. Added regression tests.
    - **If we skip it:** Imports silently attach one learner's measurements to another or contaminate a school's data. Imports are not a replacement for verified backups or identity review.

12. **Profile measurements bypassed shared numeric validation** ([Profile.jsx](src/components/Profile.jsx), [measurementInput.js](src/utils/measurementInput.js)).
    - **What this is:** Profile editing used `parseFloat`, unlike the validated measurement-import path.
    - **Problem:** Inputs such as trailing text or invalid heights could produce saved measurements and misleading nutritional results.
    - **Fix:** Reused the shared weight and height parsers and added a read-only guard. Existing parser tests cover malformed values, infinity, and height conversion.
    - **If we skip it:** Editing a profile can reintroduce measurements that imports correctly reject. This review did not independently clinically validate the reference growth tables.

13. **Missing consent and deworming values were presented as Yes** ([BatchEntry.jsx](src/components/BatchEntry.jsx), [Database.jsx](src/components/Database.jsx), [syncService.js](src/utils/syncService.js), [SbfpForms.jsx](src/components/SbfpForms.jsx)).
    - **What this is:** New rows, cloud fallbacks, and form displays used `Y` without an explicit entry.
    - **Problem:** A blank source could become an affirmative consent or health statement.
    - **Fix:** New/missing values now default to `N` across entry, synchronization, display, and the new database migration. Existing explicit values are preserved.
    - **If we skip it:** Reports claim actions or consent that have not been recorded. Historical automatically populated Yes values require human review; the app cannot reconstruct their evidence.

14. **School settings lost their user binding and reported failed saves as success** ([Settings.jsx](src/components/Settings.jsx), [migration](supabase/migrations/20261110000000_harden_bmi_permissions.sql)).
    - **What this is:** Settings called user-bound SQLite methods without the user ID and ignored a failed cloud save.
    - **Problem:** The next load rejected the local school; failed binding still changed the visible school. Fresh baseline schemas also lacked school columns used by the save payload.
    - **Fix:** Pass the user ID on local reads/writes, stop on cloud/binding failures, prohibit changing assignments offline, and add the missing school schema columns.
    - **If we skip it:** Users see a saved or selected school that does not match their actual authorization or persisted settings.

15. **Password recovery pointed at localhost and had no mounted reset page** ([Login.jsx](src/components/Login.jsx), [main.jsx](src/main.jsx), [ResetPassword.jsx](src/components/ResetPassword.jsx)).
    - **What this is:** Every reset email redirected to a development server URL, while the reset component was unused.
    - **Problem:** Installed users could receive a link with no reachable working reset page.
    - **Fix:** Mounted the browser reset route, require a configured HTTPS recovery website for packaged desktop use, validate the URL, and add password confirmation, minimum length, and in-flight handling. Unconfigured installations now show an actionable error instead of sending a broken link.
    - **If we skip it:** Users cannot recover accounts reliably. A real recovery website and Supabase redirect allowlist/email delivery must still be configured and tested.

16. **Mobile capture advertised a route that does not exist in this repository** ([Profile.jsx](src/components/Profile.jsx), [MobileCaptureModal.jsx](src/components/MobileCaptureModal.jsx)).
    - **What this is:** The desktop built a LAN QR URL for `/capture/:id`, with no implemented receiving route.
    - **Problem:** Packaged `file:` pages produce an unusable address; the external QR service also received the learner identifier in the URL.
    - **Fix:** Disabled the unavailable phone-capture entry point; manual image upload remains available. The retained standalone modal uses local QR rendering and the correct realtime `photo_url` field if a capture service is implemented later.
    - **If we skip it:** Users are directed into a broken capture flow. No public mobile capture service was invented or deployed during this audit.

17. **Learner state was written twice and disk failures were unhandled** ([App.jsx](src/App.jsx)).
    - **What this is:** The change handler and a second state effect both saved learner snapshots.
    - **Problem:** Loads could mark rows dirty again, and failed writes could create unhandled promise rejections while users believed data was saved.
    - **Fix:** Removed the duplicate effect. Local write failures now give an explicit instruction to keep the app open and export a backup. Existing synchronization failures remain errors, and transactional replacement is regression-tested.
    - **If we skip it:** Users can close the app after an unsuccessful local save and lose recent edits. Exported backups are plaintext and require separate protection.

18. **Dependencies had known vulnerabilities and release jobs skipped tests** ([package-lock.json](package-lock.json), [package.json](package.json), [release workflow](.github/release-repo/build-from-private.yml)).
    - **What this is:** The initial npm audit reported 24 affected packages, including one critical and 15 high-severity entries.
    - **Problem:** Vulnerable parsers, runtime/build tooling, and transitive dependencies were installed; release jobs ran lint/build without the regression suite.
    - **Fix:** Applied compatible updates and scoped overrides for minimatch and ExcelJS's UUID dependency instead of downgrading major application libraries. Final npm audit reports zero known vulnerabilities. Added unit tests to both platform build jobs in the local release-workflow copy.
    - **If we skip it:** Known vulnerable versions and regressions can ship again. Zero advisories is a dated registry result, not proof of exploit resistance; copy the workflow to the public release repository before relying on it.

## Required deployment and operational work

1. Review the migration in a staging copy first. It bans a compromised shared account, changes authorization and photo access, and preserves existing school assignments for review. Run [bmi_security.sql](supabase/tests/bmi_security.sql) there; it checks self-promotion, identity changes, cross-school binding, and row access with synthetic, rolled-back fixtures.
2. Apply `supabase/migrations/20261110000000_harden_bmi_permissions.sql` to the division project. Do not apply the whole division migration to the separate school/portal project. For that project's learner-photo bucket, review its other consumers and apply the separate private-bucket statement. Review **all** additional storage/database policies: PostgreSQL permissive policies combine with OR, so an extra permissive live policy can defeat the source policies.
3. Deploy the updated `school-data` and `upload-learner-photo` functions together with the application. Test uploads and private-photo access as two different schools and a division account. The service-role key must stay in function secrets. Confirm school-project and division-project settings match the intended routing mode.
4. Review every existing division role, allowlist entry, and school assignment for evidence of prior misuse. Revoke affected sessions and rotate any independently exposed credentials. Removing a password from the newest app does not remove it from older downloads or Git history.
5. Configure Supabase password length, compromised-password protection where available, authentication rate limits, email verification, administrator MFA, backups, and recovery procedures. These server settings were not available in this workspace and were not claimed as enabled. Client UI validation cannot replace server rules.
6. Host the web bundle at an approved HTTPS recovery site with `/reset-password` routed to the application. Build the desktop app with `VITE_PASSWORD_RESET_URL=https://your-approved-host/reset-password` and allow that exact URL in Supabase Auth. Test the complete email flow with a staging account. Browser recovery deliberately keeps new tokens in memory.
7. Build and manually inspect Windows and macOS installer agreement screens. The agreement is wired to NSIS and DMG and bundled as `resources/license.txt`. ZIP distribution and silent updates do not provide the same installation acceptance flow. Keep a versioned acceptance record through your deployment process if legally required.
8. Add trusted Windows code-signing and macOS signing/notarization through release secrets. No signing identity was provided; the existing unsigned release setup was not silently replaced with a nonworking certificate requirement. A signed, controlled release pipeline is necessary for a strong software-supply-chain claim.
9. Protect devices with disk encryption and individual OS accounts. Restrict exports/printouts and verify encrypted backup restore under the **same OS credential/keychain context**. Copying the encrypted database to a different user/device may make it unreadable. Never reset or overwrite a failing encrypted database as a recovery shortcut.
10. Have institutional legal counsel review [LICENSE-AGREEMENT.txt](LICENSE-AGREEMENT.txt) before distribution. The agreement limits liability only where law permits; it does not eliminate privacy duties or liability that cannot be waived. See the [National Privacy Commission's Data Privacy Act publication](https://privacy.gov.ph/data-privacy-act/), particularly security and accountability obligations.

## Verification and limits

- All **68** unit/regression tests passed, including imports, measurement input, reporting counts, adviser updates, synchronization races, school routing, password hashing, protected caches, and recovery URL validation.
- Actual Electron 43.8.7 / Windows OS encryption test passed using separate synthetic profiles: plaintext learner migration, encrypted SQLite writes, enrolment round-trip, credential hashing, omitted passwords, and corruption rejection. See `npm run test:security`.
- Full 70-class print-preview integration passed: Folio portrait and landscape, PDF preview, stub printing, and cleanup. The original 60-second test timeout was too short on this machine; the suite now permits 120 seconds. No physical print job was sent.
- Production bundle builds; installer configuration schema validates. Lint exits successfully with existing warnings. Final npm audit reports **0 known vulnerabilities**. No installer was installed or published.
- OS storage behavior and limits follow [Electron's safeStorage documentation](https://www.electronjs.org/docs/latest/api/safe-storage). The application can decrypt records while running under the authorized OS account. This is not end-to-end encryption and does not protect against malware controlling that account.
- Source areas reviewed included Electron/preload/printing, authentication and registration, local storage, synchronization/routing, migrations and row policies, learner entry/profile/import paths, school settings, reports/form generation, and build/release configuration. Unchanged UI screens were searched and sampled rather than every component being exhaustively executed.
- Not checked: deployed policies/functions, production cloud disk/backups encryption settings, real email delivery, live account revocation, macOS keychain behavior, signing/notarization, physical printers, penetration/load testing, or clinical validation. The PostgreSQL security script is supplied but was not run because no local/staging PostgreSQL session was connected.

Verdict: Critical source weaknesses have fixes and regression coverage. **Do not call the deployed system secure until the server migration, photo-policy review, individual account review, and coordinated release are completed.**
