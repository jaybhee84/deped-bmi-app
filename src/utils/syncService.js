// ── DepEd BMI System — Sync Service ───────────────────────────────────────
// Saves data locally first (always works offline).
// When Supabase is configured and internet is available, auto-syncs to server.

import { supabase } from './supabaseClient';

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
    console.error("[SQLite] Failed to save students:", e);
  }
}

export async function localLoadStudents() {
  try {
    return await window.sqlite.loadStudents();
  } catch (e) {
    console.error("[SQLite] Failed to load students:", e);
    return [];
  }
}

export async function unbindSchoolFromUser(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ school_id: null })
    .eq("id", userId)
    .select();

  if (error) throw error;
  return data;
}

// ── Supabase Config ───────────────────────────────────────────────────────

export function saveSupabaseConfig(url, key) {
  try {
    localStorage.setItem(KEYS.SUPABASE, JSON.stringify({ url: url.trim(), key: key.trim() }));
  } catch {}
}

const SUPABASE_URL = 'https://usbqwedfhmceasrepjnb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SsMtcj2eu7PZnSRg3geAXQ_X425usO5';

export function loadSupabaseConfig() {
  return {
    url: SUPABASE_URL,
    key: SUPABASE_KEY,
  };
}

export async function saveSchoolInfo(school) {
  const cfg = loadSupabaseConfig();

  // FIXED: Changed payload key from school_name to name to match the schools table schema
  const payload = {
    school_id: school.id,
    name: school.name,
    division: school.division,
    district: school.district,
    address: school.address,
    updated_at: new Date().toISOString(),
  };

  const res = await fetch(`${cfg.url}/rest/v1/schools`, {
    method: "POST",
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Failed saving school:", err);
    return false;
  }

  return true;
}

// ── School ↔ User Binding ──────────────────────────────────────────────────

export async function bindSchoolToUser(schoolId, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ school_id: schoolId })
    .eq("id", userId)
    .select();

  console.log("[BIND] data =", data);
  console.log("[BIND] error =", error);

  if (error) throw error;
  return data;
}

export async function fetchSchoolForUser(userId) {
  if (!userId) return null;

  const cfg = loadSupabaseConfig();

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

  // FIXED: Map row.name to the expected frontend contract property
  return {
    id: row.school_id,
    name: row.name || row.school_name,
    logo_url: row.logo_url,
    division: row.division,
    district: row.district,
    address: row.address,
  };
}

export async function fetchSchoolById(schoolId) {
  if (!schoolId) return null;

  const cfg = loadSupabaseConfig();

  const res = await fetch(
    `${cfg.url}/rest/v1/schools?school_id=eq.${encodeURIComponent(schoolId)}&select=*`,
    {
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("Failed fetching school by id:", err);
    return null;
  }

  const rows = await res.json();
  const row = rows?.[0];

  if (!row) return null;

  // FIXED: Map row.name safely to support components reading this lookup payload
  return {
    id: row.school_id,
    name: row.name || row.school_name,
    logo_url: row.logo_url,
    division: row.division,
    district: row.district,
    address: row.address,
  };
}

// ── School Logo Sync ──────────────────────────────────────────────────────

export async function saveSchoolLogoToSupabase({ schoolId, filename, dataUrl }) {
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

  const logoUrl = publicUrlData?.publicUrl;

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

export async function fetchAllSchools() {
  const cfg = loadSupabaseConfig();

  // FIXED: order changed from school_name.asc to name.asc to prevent 400 Bad Request anomalies
  const res = await fetch(`${cfg.url}/rest/v1/schools?select=*&order=name.asc`, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed fetching schools: ${res.status} — ${err}`);
  }

  const rows = await res.json();
  return rows.map((r) => ({
    id: r.school_id,
    name: r.name || r.school_name, 
    division: r.division,
    district: r.district,
    address: r.address,
    logo: r.logo_url || null,
  }));
}

// ── Sync Queue ────────────────────────────────────────────────────────────

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
  } catch { return []; }
}

function saveDeleteQueue(queue) {
  try {
    localStorage.setItem(KEYS.DELETE_QUEUE, JSON.stringify(queue));
  } catch {}
}

export function queueStudentForDelete(studentId) {
  const deleteQueue = loadDeleteQueue();
  const idStr = String(studentId);

  if (!deleteQueue.includes(idStr)) {
    deleteQueue.push(idStr);
    saveDeleteQueue(deleteQueue);
  }

  const syncQueue = loadQueue().filter(id => String(id) !== idStr);
  saveQueue(syncQueue);
}

function clearDeleteQueue() {
  saveDeleteQueue([]);
}

export async function fetchSchoolLogo(schoolId) {
  const { data, error } = await supabase
    .from("schools")
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

  // FIXED: Query parameter filter changed from school_name=eq to name=eq
  const res = await fetch(
    `${cfg.url}/rest/v1/schools?name=eq.${encodeURIComponent(name)}&select=*`,
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
  const idStr = String(studentId);
  if (!queue.includes(idStr)) {
    queue.push(idStr);
    saveQueue(queue);
  }
}

export function queueAllStudentsForSync(students) {
  const ids = students.map(s => String(s.id));
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
    window.dispatchEvent(new Event("local-storage-sync-update"));
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

async function supabaseUpsert(cfg, students) {
  const payload = students.map(s => ({
    id: String(s.id),
    school_id: s.school_id || s.schoolId || "",
    school_name: s.school_name || s.schoolName || "", // Retains school_name column structure inside student records schema
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

  const idList = ids.map(id => String(id)).join(',');

  const res = await fetch(`${cfg.url}/rest/v1/students?id=in.(${idList})`, {
    method: 'DELETE',
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Delete failed: ${res.status} ${err}`);
  }

  return true;
}

async function supabaseFetchAll(cfg, schoolId, schoolName = "") {
  let url = `${cfg.url}/rest/v1/students?select=*&order=name.asc`;

  if (schoolId) {
    url += `&school_id=eq.${encodeURIComponent(schoolId)}`;
  }

  const headers = {
    'apikey':        cfg.key,
    'Authorization': `Bearer ${cfg.key}`,
  };

  let res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Supabase fetch error: ${res.status}`);
  let rows = await res.json();

  if (rows.length === 0 && schoolName) {
    const fallbackUrl = `${cfg.url}/rest/v1/students?select=*&school_name=eq.${encodeURIComponent(schoolName)}&order=name.asc`;
    const fallbackRes = await fetch(fallbackUrl, { headers });
    if (fallbackRes.ok) {
      const fallbackRows = await fallbackRes.json();
      if (fallbackRows.length > 0) {
        rows = fallbackRows;
      }
    }
  }

  return rows.map(r => ({
    id: String(r.id),
    schoolId: r.school_id || schoolId || "",
    schoolName: r.school_name || schoolName || "",
    lrn: r.lrn,
    registryNo: r.registry_no || null,
    name: r.name,
    birthdate: r.birthdate || '',
    age: r.age || 0,
    sex: r.sex,
    section: r.section,
    parentConsent: r.parent_consent || 'N',
    member4ps: r.member_4ps || 'N',
    records: Array.isArray(r.records) ? r.records : [],
  }));
}

// ── Main Sync Functions ────────────────────────────────────────────────────

export async function syncToServer(students, schoolId) {
  if (!isOnline())             return { success: false, reason: 'offline' };
  if (!isSupabaseConfigured()) return { success: false, reason: 'not_configured' };

  const cfg = loadSupabaseConfig();
  const queue = loadQueue();
  const deleteQueue = loadDeleteQueue();

  const toSync = students.filter(s => queue.includes(String(s.id)));

  if (queue.length === 0 && deleteQueue.length === 0) {
    return { success: true, reason: 'nothing_to_sync' };
  }

  try {
    if (deleteQueue.length > 0) {
      await supabaseDelete(cfg, deleteQueue);
      clearDeleteQueue();
    }

    if (toSync.length > 0) {
      await supabaseUpsert(cfg, toSync);
      clearQueue();
    }

    let activeSchoolName = "";
    if (toSync.length > 0 && toSync[0].schoolName) {
      activeSchoolName = toSync[0].schoolName;
    }

    saveLastSync(new Date());
    const freshData = await supabaseFetchAll(cfg, schoolId, activeSchoolName);
    await localSaveStudents(freshData);

    return {
      success: true,
      synced: toSync.length,
      deleted: deleteQueue.length,
      students: freshData,
    };
  } catch (e) {
    console.error('[Sync] Upload failed:', e);
    return { success: false, reason: 'error', message: e.message };
  }
}

export async function syncFromServer(schoolId) {
  if (!isOnline())             return { success: false, reason: "offline" };
  if (!isSupabaseConfigured()) return { success: false, reason: "not_configured" };

  const cfg = loadSupabaseConfig();

  try {
    let activeSchoolName = "";
    try {
      const currentLocal = await localLoadStudents();
      const match = currentLocal.find(s => s.schoolName);
      if (match) activeSchoolName = match.schoolName;
    } catch {}

    const serverStudents = await supabaseFetchAll(cfg, schoolId, activeSchoolName);

    if (serverStudents.length > 0 && schoolId) {
      serverStudents.forEach(s => {
        if (!s.schoolId) s.schoolId = schoolId;
        if (activeSchoolName && !s.schoolName) s.schoolName = activeSchoolName;
      });
    }

    await localSaveStudents(serverStudents);
    saveLastSync(new Date()); 

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