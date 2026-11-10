import Database from "better-sqlite3";
import { app } from "electron";
import path from "path";
import fs from "node:fs";
import { createHash } from 'node:crypto';
import { hashPassword, verifyPassword } from './security.js';
import { protectData, readProtectedData } from './protected-data.js';

const dataDirectory = app.getPath("userData");
fs.mkdirSync(dataDirectory, { recursive: true });
const dbPath = path.join(dataDirectory, "students.db");

console.log("SQLite DB Path:", dbPath);

const db = new Database(dbPath);
db.pragma('secure_delete = ON');

// Enable WAL mode for better offline performance and concurrent write handling
db.pragma("journal_mode = WAL");
const identityKey = value => createHash('sha256').update(String(value || '').trim().toLowerCase()).digest('hex');

// ==========================================
// INITIALIZE EXTRA SYNC SCHEMA (New Tables & Migrations)
// ==========================================
export function initDatabase() {
  // Migrate the legacy offline user cache without touching the students table.
  const legacyProfilesTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'profiles'",
    )
    .get();
  const bmiProfilesTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bmi_profiles'",
    )
    .get();

  if (legacyProfilesTable && !bmiProfilesTable) {
    db.exec("ALTER TABLE profiles RENAME TO bmi_profiles");
  }

  // BMI Profiles Table (Caching users for offline login matching)
  db.exec(`
    CREATE TABLE IF NOT EXISTS bmi_profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT,
      password_hash TEXT,
      role TEXT,
      school_id TEXT
    );
  `);

  // Ensure username column exists if upgrading from an older schema version
  const profileCols = db.prepare("PRAGMA table_info(bmi_profiles)").all();
  if (!profileCols.some((c) => c.name === "username")) {
    db.exec("ALTER TABLE bmi_profiles ADD COLUMN username TEXT");
  }
  if (!profileCols.some((c) => c.name === 'profile_data')) {
    db.exec('ALTER TABLE bmi_profiles ADD COLUMN profile_data TEXT');
  }
  if (!profileCols.some(c => c.name === 'email_key')) {
    // Only the obsolete login cache is reset; learner records remain intact.
    db.exec('DELETE FROM bmi_profiles; ALTER TABLE bmi_profiles ADD COLUMN email_key TEXT; ALTER TABLE bmi_profiles ADD COLUMN username_key TEXT;');
  }
  // Legacy plaintext credentials must be replaced by a fresh online login.
  db.prepare("UPDATE bmi_profiles SET password_hash = NULL WHERE password_hash NOT LIKE 'scrypt:%'").run();

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
  const { password, password_hash: _passwordHash, ...publicProfile } = profile;
  const reconcileProfile = db.transaction((nextProfile) => {
    const cached = db
      .prepare(
        "SELECT password_hash, profile_data FROM bmi_profiles WHERE id = ? OR email_key = ? LIMIT 1",
      )
      .get(nextProfile.id, identityKey(nextProfile.email));

    // A legacy cache can contain this email under an obsolete auth user ID.
    // Reconcile both keys before inserting so the UNIQUE(email) constraint
    // cannot block onboarding, while retaining offline login credentials.
    db.prepare("DELETE FROM bmi_profiles WHERE id = ? OR email_key = ?").run(
      nextProfile.id,
      identityKey(nextProfile.email),
    );

    db.prepare(
      `
      INSERT INTO bmi_profiles (id, email, username, role, school_id, password_hash, profile_data, email_key, username_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      nextProfile.id,
      protectData(nextProfile.email),
      protectData(nextProfile.username || ""),
      nextProfile.role,
      nextProfile.school_id,
      password ? hashPassword(password) : cached?.password_hash ?? null,
      password ? protectData({ ...publicProfile, offlineCachedAt: Date.now() }) : cached?.profile_data ?? null,
      identityKey(nextProfile.email),
      identityKey(nextProfile.username),
    );
  });

  reconcileProfile(profile);
}

export function deleteLocalProfile({ id, email, username } = {}) {
  const conditions = [];
  const values = [];

  if (id) {
    conditions.push("id = ?");
    values.push(String(id));
  }
  if (email) {
    conditions.push("email_key = ?");
    values.push(identityKey(email));
  }
  if (username) {
    conditions.push("username_key = ?");
    values.push(identityKey(username));
  }

  if (conditions.length === 0) return 0;

  return db
    .prepare(`DELETE FROM bmi_profiles WHERE ${conditions.join(" OR ")}`)
    .run(...values).changes;
}

const loginFailures = new Map();
export function offlineLoginCheck(email, password) {
  if (typeof email !== 'string' || email.length > 320) return { success: false, message: 'Invalid credentials.' };
  const key = email.trim().toLowerCase();
  const failures = loginFailures.get(key);
  if (failures?.count >= 5 && Date.now() - failures.at < 5 * 60 * 1000) {
    return { success: false, message: 'Too many attempts. Try again in five minutes.' };
  }
  const user = db
    .prepare("SELECT * FROM bmi_profiles WHERE email_key = ? OR username_key = ?")
    .get(identityKey(key), identityKey(key));
  if (!user)
    return {
      success: false,
      message: "No local profile found. Connect online to log in.",
    };

  if (verifyPassword(password, user.password_hash) && user.profile_data) {
    const { password: _password, password_hash: _hash, ...profile } = readProtectedData(user.profile_data);
    // shortcut: disconnected devices retain access for seven days; require online-only login for immediate revocation.
    if (!Number.isFinite(profile.offlineCachedAt) || Date.now() - profile.offlineCachedAt > 7 * 86400000) {
      return { success: false, message: 'Connect online to renew offline access.' };
    }
    loginFailures.delete(key);
    return { success: true, user: profile };
  } else {
    loginFailures.set(key, { count: failures && Date.now() - failures.at < 5 * 60 * 1000 ? failures.count + 1 : 1, at: Date.now() });
    return { success: false, message: "Invalid credentials." };
  }
}

// =========================
// STUDENT FUNCTIONS
// =========================

export function saveStudents(students, isDirty = false) {
  const stmt = db.prepare(`
    INSERT INTO students (id, data, dirty)
    VALUES (?, ?, ?)
  `);

  const tx = db.transaction((rows) => {
    db.prepare("DELETE FROM students").run();
    rows.forEach((student) => {
      stmt.run(String(student.id), protectData(student), isDirty ? 1 : 0);
    });
  });

  tx(students);
}

export function loadStudents() {
  return db
    .prepare("SELECT data FROM students")
    .all()
    .map((r) => readProtectedData(r.data));
}

export function getDirtyStudents() {
  return db
    .prepare("SELECT data FROM students WHERE dirty = 1")
    .all()
    .map((r) => readProtectedData(r.data));
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
    protectData(data || {}),
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
    data: readProtectedData(row.data || "{}"),
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
      data: readProtectedData(row.data || "{}"),
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
