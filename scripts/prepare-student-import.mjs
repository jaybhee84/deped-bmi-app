import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const [sourcePath, outputDirectory = "migration-data"] = process.argv.slice(2);
if (!sourcePath) {
  throw new Error("Usage: node scripts/prepare-student-import.mjs <json-export.csv> [output-directory]");
}

const parsedCsv = Papa.parse(fs.readFileSync(sourcePath, "utf8"), {
  header: true,
  delimiter: ",",
  skipEmptyLines: true,
});
if (parsedCsv.errors.length) throw new Error(parsedCsv.errors[0].message);
if (parsedCsv.data.length !== 1 || !parsedCsv.data[0].students) {
  throw new Error("Expected one CSV row containing a students JSON array.");
}

const students = JSON.parse(parsedCsv.data[0].students);
if (!Array.isArray(students)) throw new Error("The students value is not an array.");

const ids = new Set();
for (const student of students) {
  if (String(student.school_id) !== "126001") throw new Error("Export contains another school.");
  if (!student.id || ids.has(String(student.id))) throw new Error("Export has a missing or duplicate ID.");
  ids.add(String(student.id));
  if (!Array.isArray(student.records)) throw new Error(`Student ${student.id} has invalid records JSON.`);
  student.enrolled_by = null;
  student.adviser_id = null;
}

const columns = [
  "id", "lrn", "grade_level", "section", "adviser_name", "family_name",
  "first_name", "middle_name", "birthdate", "age", "sex", "tribe", "religion",
  "is_4ps", "father_name", "mother_name", "guardian_name", "contact_number",
  "address", "reading_level", "enrolled_by", "enrolled_at", "school_id",
  "school_name", "registry_no", "name", "parent_consent", "member_4ps", "records",
  "updated_at", "photo_url", "adviser_id", "reading_category", "school_year",
  "previous_sbfp_beneficiary", "dewormed",
];

const recordTypes = [
  "id text", "lrn text", "grade_level text", "section text", "adviser_name text",
  "family_name text", "first_name text", "middle_name text", "birthdate date",
  "age integer", "sex text", "tribe text", "religion text", "is_4ps boolean",
  "father_name text", "mother_name text", "guardian_name text", "contact_number text",
  "address text", "reading_level text", "enrolled_by uuid", "enrolled_at timestamptz",
  "school_id text", "school_name text", "registry_no text", "name text",
  "parent_consent text", "member_4ps text", "records jsonb", "updated_at timestamptz",
  "photo_url text", "adviser_id uuid", "reading_category text", "school_year text",
  "previous_sbfp_beneficiary text", "dewormed text",
];

fs.mkdirSync(outputDirectory, { recursive: true });
const batchSize = 500;
for (let offset = 0; offset < students.length; offset += batchSize) {
  const batch = students.slice(offset, offset + batchSize);
  const json = JSON.stringify(batch).replaceAll("'", "''");
  const number = String(offset / batchSize + 1).padStart(2, "0");
  const sql = `begin;\n\ninsert into public.students (${columns.join(", ")})\nselect ${columns.join(", ")}\nfrom jsonb_to_recordset('${json}'::jsonb) as imported (${recordTypes.join(", ")})\non conflict (id) do nothing;\n\ncommit;\n`;
  fs.writeFileSync(path.join(outputDirectory, `students-126001-${number}.sql`), sql, "utf8");
}

fs.writeFileSync(
  path.join(outputDirectory, "VERIFY.sql"),
  "select count(*) as imported_students, count(distinct id) as unique_ids from public.students where school_id = '126001';\n",
  "utf8",
);

console.log(JSON.stringify({ students: students.length, batches: Math.ceil(students.length / batchSize) }));
