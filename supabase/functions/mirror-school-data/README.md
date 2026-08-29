# School 126001 mirror

This Edge Function receives Database Webhook events from the new division
Supabase and writes only rows whose `school_id` is `126001` to the original
school Supabase.

Configure these Edge Function secrets in the **new division project**:

- `SCHOOL_SUPABASE_URL`: the original school project's URL
- `SCHOOL_SUPABASE_SERVICE_ROLE_KEY`: the original project's secret service-role key
- `MIRROR_WEBHOOK_SECRET`: a long random value used only by the webhook

Do not use a `VITE_` prefix and do not put any of these values in the desktop
application or repository.

Deploy `mirror-school-data` with JWT verification disabled because database
webhooks do not carry a user access token. Authentication is enforced by the
`x-mirror-secret` header instead.

Create Database Webhooks in the new division project for INSERT, UPDATE, and
DELETE events on these `public` tables:

- `students`
- `schools`
- `sbfp_enrolment`
- `school_info_sbmi`

Point each webhook at the deployed function URL and add the HTTP header
`x-mirror-secret` with the exact value stored in `MIRROR_WEBHOOK_SECRET`.

Both projects must have matching table columns and unique constraints. The
function deliberately mirrors database rows only. Photo files remain in the
new division Storage project, while mirrored `photo_url`/`logo_url` fields can
continue referencing those public files; this avoids consuming duplicate
Storage space in the school project.
