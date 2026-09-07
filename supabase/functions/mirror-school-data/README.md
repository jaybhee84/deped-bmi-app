# School 126001 BMI sync

The division BMI project is `xinkzertckylyiglqikh`. The original IECES portal
project is `joilvslvsioayrjshuxg`. Both functions run in the division project.

`mirror-school-data` receives the existing student webhook from BMI. It reads
the current learner, creates a school copy if needed, and invokes
`sync-bmi-school-data`. Existing students are reconciled by changed field,
instead of upserting the historical whole-row webhook over portal edits.

`sync-bmi-school-data` also runs every five minutes, so edits made in the portal
reach BMI even when the desktop application is closed. New learners are copied
in either direction using their existing student ID and school ID `126001`.

Only these shared student fields are read and written:

- `lrn`, `registry_no`, `name`, `birthdate`, `age`, `sex`, `section`
- `school_name`, `school_year`
- `dewormed`, `parent_consent`, `member_4ps`, `previous_sbfp_beneficiary`
- `records` (BMI measurements), `photo_url`

Portal-only columns (parents, guardians, addresses, reading assessments,
Form 137, enrollment details, adviser/auth IDs) are excluded. Photo files are
not duplicated; only the public URL is synchronized. The existing code paths
for school/SBFP metadata remain unchanged; this repair adds no webhooks for them.

## Reconciliation and conflict behavior

Private checkpoints retain each project's last observed BMI fields. An edit on
one side changes only that field on the other side. Independent edits to
different fields can therefore merge. If both sides change the same field to
different values, neither is overwritten. Pre-existing conflicting nonempty
values are likewise held; a later deliberate edit on one side can resolve them.
Missing values can be filled during initial reconciliation. A blank, placeholder,
or invalid LRN cannot erase a valid LRN (12 or 13 digits; anything else,
including 14 digits, is treated as malformed).

Division updates use a transaction with a field comparison and a row lock.
School updates compare `updated_at` atomically. Imports suppress the division
webhook for that transaction, preventing echoes. A database lease prevents
overlapping runs. Failed or deferred work is retried without advancing the
successful cursor. After bootstrap, both projects' update timestamps are used
to fetch only changed learners. A dry run always performs a full comparison.

The existing BMI-to-school explicit delete behavior remains. Portal deletions
are not newly propagated into BMI. A learner missing on one side after being
checkpointed is not automatically recreated. Checkpoints must therefore not
be casually deleted.

## Deployment

Configure these Edge Function secrets in the **new division project**:

- `SCHOOL_SUPABASE_URL`: the original school project's URL
- `SCHOOL_SUPABASE_SERVICE_ROLE_KEY`: the original project's secret service-role key
- `MIRROR_WEBHOOK_SECRET`: a long random value used only by the webhook

Do not use a `VITE_` prefix and do not put any of these values in the desktop
application or repository.

Deploy both functions with JWT verification disabled because database
webhooks do not carry a user access token. Authentication is enforced by the
`x-mirror-secret` header instead.

The existing `mirror_students_to_126001` INSERT/UPDATE/DELETE webhook on
`public.students` supplies the `x-mirror-secret` header. The schema migration
preserves its URL and secret while adding transaction-local echo suppression.

Apply `20260908020000_bmi_school_field_sync.sql` to the **division** project,
deploy both functions, and then apply `20260908021000_schedule_bmi_school_sync.sql`.
Use an explicit `--project-ref xinkzertckylyiglqikh` for CLI operations; the
repository may still be linked to the old project. Apply only these migrations,
not unrelated pending migrations. The schedule stores its authentication value
in Vault by reading the existing webhook configuration without exposing it.

Both databases need the shared columns and a unique student `id`. The portal's
`sync_student_compatibility_fields` trigger stamps `updated_at`; the division
migration stamps it too, including client updates that omit the timestamp.

## Verification

Run `node --test supabase/functions/sync-bmi-school-data/sync.test.mjs`.
The SQL checks in `supabase/tests/bmi_school_sync.sql` run in a transaction and
roll back all test learners; they verify scoping, access, compare-and-set,
blank-LRN protection, and webhook suppression.

Request an authenticated full comparison with:

```sql
select public.request_bmi_school_sync(true);
```

Pass `false` for a live incremental run. The returned request ID can be checked
in `net._http_response`. Its response contains counts, not learner details.
Check `bmi_school_sync_control.last_summary` for the most recent live result and
`cron.job` for the active `bmi-school-required-fields` five-minute schedule.
These synchronization tables/RPCs are restricted to the service role.

Cloud synchronization does not refresh an offline desktop automatically.
Use BMI's download/refresh action, or reopen the app online, to refresh SQLite.
