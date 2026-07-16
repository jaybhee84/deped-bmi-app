import Database from "better-sqlite3";
import { app } from "electron";
import path from "path";

const dbPath = path.join(
  app.getPath("userData"),
  "students.db"
);

console.log("SQLite DB:", dbPath);

const db = new Database(dbPath);


// =========================
// STUDENTS TABLE
// =========================

db.exec(`
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
`);

// =========================
// SCHOOLS TABLE
// =========================

db.exec(`
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  school_name TEXT,
  school_id TEXT,
  division TEXT,
  district TEXT,
  address TEXT,
  bound_user_id TEXT
);
`);

// Migration: older installs may already have a `schools` table without
// `bound_user_id`. Add it if missing so upgrades don't crash.
const schoolColumns = db.prepare("PRAGMA table_info(schools)").all();
if (!schoolColumns.some((c) => c.name === "bound_user_id")) {
  db.exec("ALTER TABLE schools ADD COLUMN bound_user_id TEXT");
}

// =========================
// SCHOOL LOGOS TABLE (separate from schools, keyed by school_id)
// =========================

db.exec(`
CREATE TABLE IF NOT EXISTS school_logos (
  school_id TEXT PRIMARY KEY,
  filename TEXT,
  data_url TEXT,
  updated_at TEXT
);
`);

// =========================
// STUDENT FUNCTIONS
// =========================

export function saveStudents(students) {
  db.prepare("DELETE FROM students").run();

  const stmt = db.prepare(`
    INSERT INTO students (
      id,
      data
    )
    VALUES (?, ?)
  `);

  const tx = db.transaction((rows) => {
    rows.forEach((student) => {
      stmt.run(
        String(student.id),
        JSON.stringify(student)
      );
    });
  });

  tx(students);
}

export function loadStudents() {
  return db
    .prepare("SELECT data FROM students")
    .all()
    .map((r) => JSON.parse(r.data));
}

// =========================
// SCHOOL FUNCTIONS
// =========================

// `userId` is required so this device's cached school is tied to whichever
// account set it up. Without this, a second account created on the same
// device would silently inherit the first account's school (and, through
// that, its SBFP enrolment data) — see the "current" singleton bug this
// replaces.
export function saveSchool(school, userId) {
  db.prepare(`
    INSERT OR REPLACE INTO schools (
      id,
      school_name,
      school_id,
      division,
      district,
      address,
      bound_user_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    "current",
    school.name,
    school.id,
    school.division,
    school.district,
    school.address,
    userId ? String(userId) : null
  );
}

// Only returns the cached school if it was bound by the SAME user who is
// currently asking for it. If a different (or no) user previously bound a
// school on this device, this returns null — the caller falls back to
// Supabase / a fresh "set up your school" flow instead of leaking stale
// data across accounts.
export function loadSchool(userId) {
  const row = db
    .prepare("SELECT * FROM schools WHERE id = 'current'")
    .get();

  if (!row) return null;
  if (!userId) return null;
  if (row.bound_user_id !== String(userId)) return null;

  return row;
}

export function clearSchool() {
  db.prepare(
    "DELETE FROM schools WHERE id = 'current'"
  ).run();
}

// =========================
// SCHOOL LOGO FUNCTIONS (separate save path — does not touch `schools` table)
// =========================

export function saveSchoolLogo(schoolId, filename, dataUrl) {
  db.prepare(`
    INSERT OR REPLACE INTO school_logos (
      school_id,
      filename,
      data_url,
      updated_at
    )
    VALUES (?, ?, ?, ?)
  `).run(
    String(schoolId),
    filename,
    dataUrl,
    new Date().toISOString()
  );
}

export function loadSchoolLogo(schoolId) {
  const row = db
    .prepare(
      "SELECT data_url FROM school_logos WHERE school_id = ?"
    )
    .get(String(schoolId));

  return row ? row.data_url : null;
}

export function deleteSchoolLogo(schoolId) {
  db.prepare(
    "DELETE FROM school_logos WHERE school_id = ?"
  ).run(String(schoolId));
}

export default db;
