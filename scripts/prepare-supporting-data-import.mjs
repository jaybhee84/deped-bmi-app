import fs from "node:fs";
import Papa from "papaparse";

const [sourcePath, outputPath = "migration-data/supporting-data-126001.sql"] = process.argv.slice(2);
if (!sourcePath) throw new Error("Missing Supabase JSON export CSV path.");

const csv = Papa.parse(fs.readFileSync(sourcePath, "utf8"), {
  header: true,
  delimiter: ",",
  skipEmptyLines: true,
});
if (csv.errors.length) throw new Error(csv.errors[0].message);
if (csv.data.length !== 1 || !csv.data[0].migration_data) {
  throw new Error("Expected one migration_data row.");
}

const data = JSON.parse(csv.data[0].migration_data);
for (const row of data.sbfp_enrolment || []) {
  if (String(row.school_id) !== "126001") throw new Error("Enrolment contains another school.");
}

const literal = (value) => JSON.stringify(value || []).replaceAll("'", "''");
const sql = `begin;

insert into public.sbfp_config
  (id, config, grades, criteria, criteriongraderestrictions, set_by, set_at, "setBy", "setAt")
select id, config, grades, criteria, criteriongraderestrictions, set_by, set_at, "setBy", "setAt"
from jsonb_to_recordset('${literal(data.sbfp_config)}'::jsonb) as imported (
  id text, config jsonb, grades text[], criteria text[], criteriongraderestrictions jsonb,
  set_by text, set_at timestamptz, "setBy" text, "setAt" timestamptz
)
on conflict (id) do update set
  config = excluded.config, grades = excluded.grades, criteria = excluded.criteria,
  criteriongraderestrictions = excluded.criteriongraderestrictions,
  set_by = excluded.set_by, set_at = excluded.set_at,
  "setBy" = excluded."setBy", "setAt" = excluded."setAt";

insert into public.sbfp_enrolment
  (school_id, sy, data, created_at, updated_at, total)
select school_id, sy, data, created_at, updated_at, total
from jsonb_to_recordset('${literal(data.sbfp_enrolment)}'::jsonb) as imported (
  school_id varchar, sy varchar, data jsonb, created_at timestamptz,
  updated_at timestamptz, total bigint
)
on conflict (school_id, sy) do update set
  data = excluded.data, updated_at = excluded.updated_at, total = excluded.total;

insert into public.bmi_allowed_users (email, added_by, created_at)
select email, added_by, created_at
from jsonb_to_recordset('${literal(data.allowed_emails)}'::jsonb) as imported (
  email text, added_by text, created_at timestamptz
)
on conflict (email) do update set added_by = excluded.added_by;

commit;
`;

fs.mkdirSync(new URL("../migration-data/", import.meta.url), { recursive: true });
fs.writeFileSync(outputPath, sql, "utf8");
console.log(JSON.stringify({
  config: data.sbfp_config?.length || 0,
  enrolment: data.sbfp_enrolment?.length || 0,
  allowedEmails: data.allowed_emails?.length || 0,
}));
