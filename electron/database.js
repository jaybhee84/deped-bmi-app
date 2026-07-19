import Database from "better-sqlite3";
import { app } from "electron";
import path from "path";

const dbPath = path.join(
  app.getPath("userData"),
  "students.db"
);

console.log("SQLite DB:", dbPath);

const db = new Database(dbPath);

// ==========================================
// INITIALIZE EXTRA SYNC SCHEMA (New Tables)
// ==========================================
export function initDatabase() {
  // Create Profiles Table (Caching users for offline login matching)
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      role TEXT,
      school_id TEXT
    );
  `);

  // Ensure our new global schema for school binding exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS global_schools (
      school_id TEXT PRIMARY KEY,
      school_name TEXT NOT NULL,
      district TEXT NOT NULL,
      address TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

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

// ==========================================
// NEW ARCHITECTURE SYNC ENGINE FUNCTIONS
// ==========================================

export function getSchoolById(schoolId) {
  return db.prepare("SELECT * FROM global_schools WHERE school_id = ?").get(schoolId);
}

// Case-insensitive lookup by name, used for offline autocomplete during
// onboarding (district/address auto-fill when a school is picked while
// the app has no network connection).
export function getSchoolByName(schoolName) {
  return db
    .prepare("SELECT * FROM global_schools WHERE school_name = ? COLLATE NOCASE")
    .get(schoolName);
}

export function saveSchoolLocally(school) {
  db.prepare(`
    INSERT OR REPLACE INTO global_schools (school_id, school_name, district, address, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(school.school_id, school.school_name, school.district, school.address, school.created_by);
}

export function updateLocalProfile(profile) {
  db.prepare(`
    INSERT INTO profiles (id, email, role, school_id, password_hash)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      role = excluded.role,
      school_id = excluded.school_id,
      password_hash = COALESCE(excluded.password_hash, password_hash)
  `).run(profile.id, profile.email, profile.role, profile.school_id, profile.password_hash);
}

export function offlineLoginCheck(email, password) {
  const user = db.prepare("SELECT * FROM profiles WHERE email = ?").get(email);
  if (!user) return { success: false, message: "User credentials do not exist locally." };
  
  if (user.password_hash === password) {
    return { success: true, user };
  } else {
    return { success: false, message: "Invalid credentials matched offline." };
  }
}

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

// ==========================================
// SCHOOL FUNCTIONS (With Automatic Logo Bind)
// ==========================================

export function saveSchool(school, userId) {
  const finalName = school.school_name || school.name || null;
  const finalId = school.school_id || school.id || null;

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
    finalName,
    finalId,
    school.division || null,
    school.district || null,
    school.address || null,
    userId ? String(userId) : null
  );

  // AUTOMATIC INTEGRATION LINK:
  // The renderer (OnboardingModal) already resolves the correct logo URL
  // via SCHOOL_LOGO_MAP and passes it in as school.logo_url. We just persist
  // that here instead of re-deriving our own acronym locally — keeping a
  // second acronym generator in sync with the renderer's map was the source
  // of drift (and pointed at a mistyped Supabase subdomain).
  if (finalId && school.logo_url) {
    db.prepare(`
      INSERT OR REPLACE INTO school_logos (
        school_id,
        filename,
        data_url,
        updated_at
      )
      VALUES (?, ?, ?, ?)
    `).run(
      String(finalId),
      school.logo_url.split("/").pop() || null,
      school.logo_url,
      new Date().toISOString()
    );
  }
}

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
// SCHOOL LOGO FUNCTIONS
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