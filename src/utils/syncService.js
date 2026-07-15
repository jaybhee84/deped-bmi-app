// ── DepEd BMI System — Sync Service ───────────────────────────────────────
// Saves data locally first (always works offline).
// When Supabase is configured and internet is available, auto-syncs to server.

import { supabase } from './supabaseClient'; // TODO: confirm this matches your actual filename/path for createClient(...)

const KEYS = {
  STUDENTS:     'deped_bmi_students',
  SYNC_QUEUE:   'deped_bmi_sync_queue',
  DELETE_QUEUE: 'deped_bmi_delete_queue',
  SUPABASE:     'deped_bmi_supabase',
  LAST_SYNC:    'deped_bmi_last_sync',
};

// ── Local Storage Helpers ─────────────────────────────────────────────────

export async function localSaveStudents(students) {
  try {
    await window.sqlite.saveStudents(students);
  } catch (e) {
    console.error(
      "[SQLite] Failed to save students:",
      e
    );
  }
}

export async function localLoadStudents() {
  try {
    return await window.sqlite.loadStudents();
  } catch (e) {
    console.error(
      "[SQLite] Failed to load students:",
      e
    );

    return [];
  }
}

export async function unbindSchoolFromUser(
  userId,
) {
  const { data, error } = await supabase
    .from("profiles")
    .update({
      school_id: null,
    })
    .eq("id", userId)
    .select();

  if (error) {
    throw error;
  }

  return data;
}

// ── Supabase Config ───────────────────────────────────────────────────────

export function saveSupabaseConfig(url, key) {
  try {
    localStorage.setItem(KEYS.SUPABASE, JSON.stringify({ url: url.trim(), key: key.trim() }));
  } catch {}
}

// Project-wide Supabase configuration
const SUPABASE_URL =
  'https://usbqwedfhmceasrepjnb.supabase.co';

const SUPABASE_KEY =
  'sb_publishable_SsMtcj2eu7PZnSRg3geAXQ_X425usO5';

export function loadSupabaseConfig() {
  return {
    url: SUPABASE_URL,
    key: SUPABASE_KEY,
  };
}

export async function saveSchoolInfo(school) {
  const cfg = loadSupabaseConfig();

  const payload = {
    school_id: school.id,
    school_name: school.name,
    division: school.division,
    district: school.district,
    address: school.address,
    updated_at: new Date().toISOString(),
  };

  const res = await fetch(
    `${cfg.url}/rest/v1/schools`,
    {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("Failed saving school:", err);
    return false;
  }

  return true;
}

// ── School ↔ User Binding ──────────────────────────────────────────────────
// Requires a "school_id" (text, references public.schools.school_id) column
// on public.profiles:
//
//   alter table public.profiles
//     add column school_id text references public.schools(school_id);
//
// Many users can be bound to the same school — this just stamps the current
// user's profile row with whichever school_id they saved in Settings.

export async function bindSchoolToUser(
  schoolId,
  userId,
) {
  const { data, error } = await supabase
    .from("profiles")
    .update({
      school_id: schoolId,
    })
    .eq("id", userId)
    .select();

  console.log("[BIND] data =", data);
  console.log("[BIND] error =", error);

  if (error) {
    throw error;
  }

  return data;
}

// Looks up which school (if any) the given user is bound to, and returns
// the full school row so Settings can pre-fill the form on a fresh device
// where local SQLite has nothing saved yet.

export async function fetchSchoolForUser(userId) {
  if (!userId) return null;

  const cfg = loadSupabaseConfig();

  // 1. Get the user's profile to find their school_id
  const profileRes = await fetch(
    `${cfg.url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=school_id`,
    {
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
      },
    }
  );

  if (!profileRes.ok) {
    const err = await profileRes.text();
    console.error("Failed fetching profile:", err);
    return null;
  }

  const profileRows = await profileRes.json();
  const schoolId = profileRows?.[0]?.school_id;

  if (!schoolId) return null;

  // 2. Get the actual school row
  const schoolRes = await fetch(
    `${cfg.url}/rest/v1/schools?school_id=eq.${encodeURIComponent(schoolId)}&select=*`,
    {
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
      },
    }
  );

  if (!schoolRes.ok) {
    const err = await schoolRes.text();
    console.error("Failed fetching bound school:", err);
    return null;
  }

  const schoolRows = await schoolRes.json();
  const row = schoolRows?.[0];

  if (!row) return null;

  return {
    id: row.school_id,
    name: row.school_name,
    division: row.division,
    district: row.district,
    address: row.address,
  };
}

// ── School Logo Sync (separate from school info — own storage bucket) ────
// Requires:
//   - A public Supabase Storage bucket named "school-logos"
//   - A "logo_url" (text) column added to the public.schools table

export async function saveSchoolLogoToSupabase({ schoolId, filename, dataUrl }) {
  // Convert data URL -> Blob for upload
  const res = await fetch(dataUrl);
  const blob = await res.blob();

  const storagePath = `${schoolId}/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from('school-logos')
    .upload(storagePath, blob, {
      contentType: blob.type || 'image/png',
      upsert: true,
    });

  if (uploadError) {
    console.error('[Supabase] Logo upload failed:', uploadError);
    throw uploadError;
  }

  const { data: publicUrlData } = supabase.storage
    .from('school-logos')
    .getPublicUrl(storagePath);

  const logoUrl = publicUrlData?.publicUrl;

  // Update the schools row with the new logo_url
  const cfg = loadSupabaseConfig();
  const patchRes = await fetch(
    `${cfg.url}/rest/v1/schools?school_id=eq.${schoolId}`,
    {
      method: 'PATCH',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ logo_url: logoUrl, updated_at: new Date().toISOString() }),
    }
  );

  if (!patchRes.ok) {
    const err = await patchRes.text();
    console.error('Failed updating logo_url on schools row:', err);
    throw new Error(err);
  }

  return logoUrl;
}

export function isSupabaseConfigured() {
  return true;
}

// ── Fetch all schools (for SDO Dashboard) ──────────────────────────────────
// Returns every school row from Supabase, including logo_url, so the
// division office can see every school's info + logo without relying on
// whatever happens to be in this device's localStorage/SQLite.

export async function fetchAllSchools() {
  const cfg = loadSupabaseConfig();

  const res = await fetch(
    `${cfg.url}/rest/v1/schools?select=*&order=school_name.asc`,
    {
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed fetching schools: ${res.status} — ${err}`);
  }

  const rows = await res.json();

  // Normalize to the shape the app already uses (school.name, .id, etc.)
  return rows.map((r) => ({
    id: r.school_id,
    name: r.school_name,
    division: r.division,
    district: r.district,
    address: r.address,
    logo: r.logo_url || null,
  }));
}

// ── Sync Queue ────────────────────────────────────────────────────────────
// The queue stores student IDs that have been added/modified offline.
// On sync, we upsert all queued students to Supabase.

function loadQueue() {
  try {
    const raw = localStorage.getItem(KEYS.SYNC_QUEUE);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveQueue(queue) {
  try {
    localStorage.setItem(KEYS.SYNC_QUEUE, JSON.stringify(queue));
  } catch {}
}

function loadDeleteQueue() {
  try {
    const raw = localStorage.getItem(KEYS.DELETE_QUEUE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDeleteQueue(queue) {
  try {
    localStorage.setItem(
      KEYS.DELETE_QUEUE,
      JSON.stringify(queue)
    );
  } catch {}
}

export function queueStudentForDelete(studentId) {
  const deleteQueue = loadDeleteQueue();

  if (!deleteQueue.includes(studentId)) {
    deleteQueue.push(studentId);
    saveDeleteQueue(deleteQueue);
  }

  // Remove from update queue if present
  const syncQueue = loadQueue().filter(
    id => id !== studentId
  );

  saveQueue(syncQueue);
}

function clearDeleteQueue() {
  saveDeleteQueue([]);
}

export async function fetchSchoolLogo(schoolId) {
  const { data, error } = await supabase
    .from("school_logos")
    .select("logo_url")
    .eq("school_id", schoolId)
    .single();

  if (error) {
    console.error(error);
    return null;
  }

  return data?.logo_url || null;
}
export async function getSchoolByName(name) {
  const cfg = loadSupabaseConfig();

  const res = await fetch(
    `${cfg.url}/rest/v1/schools?school_name=eq.${encodeURIComponent(
      name
    )}&select=*`,
    {
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
      },
    }
  );

  if (!res.ok) return null;

  const rows = await res.json();

  return rows?.[0] || null;
}

export function queueStudentForSync(studentId) {
  const queue = loadQueue();
  if (!queue.includes(studentId)) {
    queue.push(studentId);
    saveQueue(queue);
  }
}

export function queueAllStudentsForSync(students) {
  const ids = students.map(s => s.id);
  saveQueue(ids);
}

export function getQueueLength() {
  return loadQueue().length;
}

export function clearQueue() {
  saveQueue([]);
}

export function saveLastSync(date) {
  try {
    localStorage.setItem(KEYS.LAST_SYNC, date.toISOString());
  } catch {}
}

export function loadLastSync() {
  try {
    const raw = localStorage.getItem(KEYS.LAST_SYNC);
    return raw ? new Date(raw) : null;
  } catch { return null; }
}

// ── Network Status ────────────────────────────────────────────────────────

export function isOnline() {
  return navigator.onLine;
}

// ── Supabase API Calls ────────────────────────────────────────────────────
// These only run when Supabase is configured + online.
// Table name: students
// Schema: id, lrn, name, birthdate, age, sex, section, records (jsonb), updated_at

async function supabaseUpsert(cfg, students) {
  const payload = students.map(s => ({
  id: String(s.id),
  school_id: s.schoolId || "",
  school_name: s.schoolName || "",

  lrn: s.lrn,
  registry_no: s.registryNo || null,

  name: s.name,
  birthdate: s.birthdate || null,
  age: s.age || 0,
  sex: s.sex,
  section: s.section,

  parent_consent: s.parentConsent || 'N',
  member_4ps: s.member4ps || 'N',

  records: s.records,
  updated_at: new Date().toISOString(),
}));

  const res = await fetch(`${cfg.url}/rest/v1/students`, {
    method: 'POST',
    headers: {
      'apikey':        cfg.key,
      'Authorization': `Bearer ${cfg.key}`,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error: ${res.status} — ${err}`);
  }
  return true;
}

async function supabaseDelete(cfg, ids) {
  if (!ids.length) return true;

  const idList = ids
  .map(id => String(id))
  .join(',');

  const res = await fetch(
    `${cfg.url}/rest/v1/students?id=in.(${idList})`,
    {
      method: 'DELETE',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(
      `Delete failed: ${res.status} ${err}`
    );
  }

  return true;
}

async function supabaseFetchAll(cfg, schoolId) {
  let url = `${cfg.url}/rest/v1/students?select=*&order=name.asc`;

  // When a schoolId is provided (school-level devices, which always have
  // one configured via Settings), scope the fetch to that school only.
  // Without it (division-office devices, which never configure a school),
  // fall back to fetching every school's students — needed for SDO views.
  if (schoolId) {
    url += `&school_id=eq.${encodeURIComponent(schoolId)}`;
  }

  const res = await fetch(url, {
    headers: {
      'apikey':        cfg.key,
      'Authorization': `Bearer ${cfg.key}`,
    },
  });

  if (!res.ok) throw new Error(`Supabase fetch error: ${res.status}`);
  const rows = await res.json();

  // Convert back to app format
  return rows.map(r => ({
  id: r.id,
  schoolId: r.school_id || "",
  schoolName: r.school_name || "",

  lrn: r.lrn,
  registryNo: r.registry_no || null,

  name: r.name,
  birthdate: r.birthdate || '',
  age: r.age || 0,
  sex: r.sex,
  section: r.section,

  parentConsent: r.parent_consent || 'N',
  member4ps: r.member_4ps || 'N',

  records: Array.isArray(r.records)
    ? r.records
    : [],
}));
}

// ── Main Sync Function ────────────────────────────────────────────────────

export async function syncToServer(students, schoolId) {
  if (!isOnline())             return { success: false, reason: 'offline' };
  if (!isSupabaseConfigured()) return { success: false, reason: 'not_configured' };

  const cfg = loadSupabaseConfig();
const queue = loadQueue();
const deleteQueue = loadDeleteQueue();

const toSync = students.filter(s => queue.includes(s.id));

if (
  queue.length === 0 &&
  deleteQueue.length === 0
) {
  return {
    success: true,
    reason: 'nothing_to_sync',
  };
}

  try {

  if (deleteQueue.length > 0) {
    await supabaseDelete(
      cfg,
      deleteQueue
    );

    clearDeleteQueue();
  }

  if (toSync.length > 0) {
    await supabaseUpsert(
      cfg,
      toSync
    );

    clearQueue();
  }

  saveLastSync(new Date());

  const freshData = await supabaseFetchAll(cfg, schoolId);

localSaveStudents(freshData);

return {
  success: true,
  synced: toSync.length,
  deleted: deleteQueue.length,
  students: freshData,
};


}
 catch (e) {
    console.error('[Sync] Upload failed:', e);
    return { success: false, reason: 'error', message: e.message };
  }
}

export async function syncFromServer(schoolId) {
  if (!isOnline())
    return { success: false, reason: "offline" };

  if (!isSupabaseConfigured())
    return { success: false, reason: "not_configured" };

  const cfg = loadSupabaseConfig();

  try {
    const serverStudents =
      await supabaseFetchAll(cfg, schoolId);

    localSaveStudents(serverStudents);

    return {
      success: true,
      students: serverStudents,
    };
  } catch (e) {
    console.error("[Sync] Download failed:", e);

    return {
      success: false,
      reason: "error",
      message: e.message,
    };
  }
}

export async function testSupabaseConnection(url, key) {
  try {
    const res = await fetch(`${url}/rest/v1/students?select=id&limit=1`, {
      headers: {
        'apikey':        key,
        'Authorization': `Bearer ${key}`,
      },
    });
    return res.ok;
  } catch { return false; }
}