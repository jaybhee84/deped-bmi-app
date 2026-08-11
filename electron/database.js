import Database from "better-sqlite3";
import { app } from "electron";
import path from "path";

const dbPath = path.join(app.getPath("userData"), "students.db");

console.log("SQLite DB Path:", dbPath);

const db = new Database(dbPath);

// Enable WAL mode for better offline performance and concurrent write handling
db.pragma("journal_mode = WAL");

// ==========================================
// INITIALIZE EXTRA SYNC SCHEMA (New Tables & Migrations)
// ==========================================
export function initDatabase() {
  // Profiles Table (Caching users for offline login matching)
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT,
      password_hash TEXT,
      role TEXT,
      school_id TEXT
    );
  `);

  // Ensure username column exists if upgrading from an older schema version
  const profileCols = db.prepare("PRAGMA table_info(profiles)").all();
  if (!profileCols.some((c) => c.name === "username")) {
    db.exec("ALTER TABLE profiles ADD COLUMN username TEXT");
  }

  // Global Schools Table for offline binding/autocomplete
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

// Call initialization upon module import
initDatabase();

// =========================
// STUDENTS TABLE (With Dirty Track Flag)
// =========================

db.exec(`
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  dirty INTEGER DEFAULT 0
);
`);

// Migration: Ensure existing students table has the dirty status flag
const studentCols = db.prepare("PRAGMA table_info(students)").all();
if (!studentCols.some((c) => c.name === "dirty")) {
  db.exec("ALTER TABLE students ADD COLUMN dirty INTEGER DEFAULT 0");
}

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

// Migration: ensure `bound_user_id` exists
const schoolColumns = db.prepare("PRAGMA table_info(schools)").all();
if (!schoolColumns.some((c) => c.name === "bound_user_id")) {
  db.exec("ALTER TABLE schools ADD COLUMN bound_user_id TEXT");
}

// =========================
// LOGO TABLES
// =========================

db.exec(`
CREATE TABLE IF NOT EXISTS school_logos (
  school_id TEXT PRIMARY KEY,
  filename TEXT,
  data_url TEXT,
  updated_at TEXT
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS school_logo_cache (
  school_key TEXT PRIMARY KEY,
  filename TEXT,
  data_url TEXT,
  updated_at TEXT
);
`);

// =========================
// SBFP ENROLMENT TABLE
// =========================

db.exec(`
CREATE TABLE IF NOT EXISTS sbfp_enrolment (
  school_id TEXT NOT NULL,
  sy TEXT NOT NULL,
  data TEXT NOT NULL,
  total INTEGER DEFAULT 0,
  updated_at TEXT,
  dirty INTEGER DEFAULT 0,
  PRIMARY KEY (school_id, sy)
);
`);

// ==========================================
// SYNC ENGINE & USER AUTH FUNCTIONS
// ==========================================

export function getSchoolById(schoolId) {
  return db
    .prepare("SELECT * FROM global_schools WHERE school_id = ?")
    .get(schoolId);
}

export function getSchoolByName(schoolName) {
  return db
    .prepare(
      "SELECT * FROM global_schools WHERE school_name = ? COLLATE NOCASE",
    )
    .get(schoolName);
}

export function saveSchoolLocally(school) {
  db.prepare(
    `
    INSERT OR REPLACE INTO global_schools (school_id, school_name, district, address, created_by)
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(
    school.school_id,
    school.school_name,
    school.district,
    school.address,
    school.created_by,
  );
}

export function updateLocalProfile(profile) {
  db.prepare(
    `
    INSERT INTO profiles (id, email, username, role, school_id, password_hash)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      username = COALESCE(excluded.username, username),
      role = excluded.role,
      school_id = excluded.school_id,
      password_hash = COALESCE(excluded.password_hash, password_hash)
  `,
  ).run(
    profile.id,
    profile.email,
    profile.username || "",
    profile.role,
    profile.school_id,
    profile.password_hash,
  );
}

export function offlineLoginCheck(email, password) {
  const user = db.prepare("SELECT * FROM profiles WHERE email = ?").get(email);
  if (!user)
    return {
      success: false,
      message: "No local profile found. Connect online to log in.",
    };

  if (user.password_hash === password) {
    return { success: true, user };
  } else {
    return { success: false, message: "Invalid credentials." };
  }
}

// =========================
// STUDENT FUNCTIONS
// =========================

export function saveStudents(students, isDirty = false) {
  db.prepare("DELETE FROM students").run();

  const stmt = db.prepare(`
    INSERT INTO students (id, data, dirty)
    VALUES (?, ?, ?)
  `);

  const tx = db.transaction((rows) => {
    rows.forEach((student) => {
      stmt.run(String(student.id), JSON.stringify(student), isDirty ? 1 : 0);
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

export function getDirtyStudents() {
  return db
    .prepare("SELECT data FROM students WHERE dirty = 1")
    .all()
    .map((r) => JSON.parse(r.data));
}

export function markStudentsClean() {
  db.prepare("UPDATE students SET dirty = 0 WHERE dirty = 1").run();
}

// ==========================================
// SCHOOL & LOGO FUNCTIONS
// ==========================================

export function saveSchool(school, userId) {
  const finalName = school.school_name || school.name || null;
  const finalId = school.school_id || school.id || null;

  db.prepare(
    `
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
  `,
  ).run(
    "current",
    finalName,
    finalId,
    school.division || null,
    school.district || null,
    school.address || null,
    userId ? String(userId) : null,
  );

  if (finalId && school.logo_url) {
    db.prepare(
      `
      INSERT OR REPLACE INTO school_logos (
        school_id,
        filename,
        data_url,
        updated_at
      )
      VALUES (?, ?, ?, ?)
    `,
    ).run(
      String(finalId),
      school.logo_url.split("/").pop() || null,
      school.logo_url,
      new Date().toISOString(),
    );
  }
}

export function loadSchool(userId) {
  const row = db.prepare("SELECT * FROM schools WHERE id = 'current'").get();

  if (!row || !userId || row.bound_user_id !== String(userId)) return null;
  return row;
}

export function clearSchool() {
  db.prepare("DELETE FROM schools WHERE id = 'current'").run();
}

export function saveSchoolLogo(schoolId, filename, dataUrl) {
  db.prepare(
    `
    INSERT OR REPLACE INTO school_logos (
      school_id,
      filename,
      data_url,
      updated_at
    )
    VALUES (?, ?, ?, ?)
  `,
  ).run(String(schoolId), filename, dataUrl, new Date().toISOString());
}

export function loadSchoolLogo(schoolId) {
  const row = db
    .prepare("SELECT data_url FROM school_logos WHERE school_id = ?")
    .get(String(schoolId));

  return row ? row.data_url : null;
}

export function deleteSchoolLogo(schoolId) {
  db.prepare("DELETE FROM school_logos WHERE school_id = ?").run(
    String(schoolId),
  );
}

export function saveLogoToCache(schoolKey, filename, dataUrl) {
  db.prepare(
    `
    INSERT OR REPLACE INTO school_logo_cache (
      school_key,
      filename,
      data_url,
      updated_at
    )
    VALUES (?, ?, ?, ?)
  `,
  ).run(String(schoolKey), filename || null, dataUrl, new Date().toISOString());
}

export function loadLogoFromCache(schoolKey) {
  const row = db
    .prepare("SELECT data_url FROM school_logo_cache WHERE school_key = ?")
    .get(String(schoolKey));

  return row ? row.data_url : null;
}

export function loadAllCachedLogos() {
  const rows = db
    .prepare("SELECT school_key, data_url FROM school_logo_cache")
    .all();
  return rows.reduce((acc, row) => {
    acc[row.school_key] = row.data_url;
    return acc;
  }, {});
}

export function getCachedLogoKeys() {
  return db
    .prepare("SELECT school_key FROM school_logo_cache")
    .all()
    .map((r) => r.school_key);
}

// =========================
// SBFP ENROLMENT FUNCTIONS
// =========================

export function saveEnrolmentLocally(schoolId, sy, data, total) {
  db.prepare(
    `
    INSERT OR REPLACE INTO sbfp_enrolment (
      school_id,
      sy,
      data,
      total,
      updated_at,
      dirty
    )
    VALUES (?, ?, ?, ?, ?, 1)
  `,
  ).run(
    String(schoolId),
    sy,
    JSON.stringify(data || {}),
    Number(total) || 0,
    new Date().toISOString(),
  );
}

export function loadEnrolmentLocally(schoolId, sy) {
  const row = db
    .prepare("SELECT * FROM sbfp_enrolment WHERE school_id = ? AND sy = ?")
    .get(String(schoolId), sy);

  if (!row) return null;

  return {
    data: JSON.parse(row.data || "{}"),
    total: row.total || 0,
    updatedAt: row.updated_at,
  };
}

export function loadEnrolmentTotalsForSY(sy) {
  return db
    .prepare("SELECT school_id, total FROM sbfp_enrolment WHERE sy = ?")
    .all(sy);
}

export function getDirtyEnrolmentRows() {
  return db
    .prepare("SELECT * FROM sbfp_enrolment WHERE dirty = 1")
    .all()
    .map((row) => ({
      schoolId: row.school_id,
      sy: row.sy,
      data: JSON.parse(row.data || "{}"),
      total: row.total || 0,
      updatedAt: row.updated_at,
    }));
}

export function markEnrolmentClean(schoolId, sy) {
  db.prepare(
    "UPDATE sbfp_enrolment SET dirty = 0 WHERE school_id = ? AND sy = ?",
  ).run(String(schoolId), sy);
}

export default db;
