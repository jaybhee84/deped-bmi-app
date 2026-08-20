// ── DepEd BMI System — Sync Service ───────────────────────────────────────
// Saves data locally first (always works offline).
// When Supabase is configured and internet is available, auto-syncs to server.

import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient';
import { SCHOOL_LOGO_BUCKET } from './schoolLogoMap';

const KEYS = {
  STUDENTS:     'deped_bmi_students',
  SYNC_QUEUE:   'deped_bmi_sync_queue',
  DELETE_QUEUE: 'deped_bmi_delete_queue',
  SUPABASE:     'deped_bmi_supabase',
  LAST_SYNC:    'deped_bmi_last_sync',
  SCHOOLS_CACHE: 'deped_bmi_schools_cache',
  SCHOOLS_CACHE_TIME: 'deped_bmi_schools_cache_time',
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
    .from("bmi_profiles")
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

export function loadSupabaseConfig() {
  return {
    url: SUPABASE_URL,
    key: SUPABASE_ANON_KEY,
  };
}

async function getSupabaseAccessToken(cfg) {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || cfg.key;
}

function normalizeStudentRecords(records) {
  if (Array.isArray(records)) return records;
  if (!records) return [];

  if (typeof records === 'string') {
    try {
      const parsed = JSON.parse(records);
      return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    } catch {
      return [];
    }
  }

  return typeof records === 'object' ? [records] : [];
}

export async function saveSchoolInfo(school) {
  const cfg = loadSupabaseConfig();

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
      Authorization: `Bearer ${await getSupabaseAccessToken(cfg)}`,
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
    .from("bmi_profiles")
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
    `${cfg.url}/rest/v1/bmi_profiles?id=eq.${encodeURIComponent(userId)}&select=school_id`,
    {
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${await getSupabaseAccessToken(cfg)}`,
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
        Authorization: `Bearer ${await getSupabaseAccessToken(cfg)}`,
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
    name: row.name || row.school_name,
    logo_url: row.logo_url,
    division: row.division,
    district: row.district,
    address: row.address,
  };
}

// ── Offline-First School Fetching ───────────────────────────────────────────

export async function fetchSchoolForUserOfflineFirst(userId) {
  if (!userId) return null;

  // 1. Try to get from local SQLite first (works offline)
  if (window.sqlite?.loadSchool) {
    try {
      const localSchool = await window.sqlite.loadSchool(userId);
      if (localSchool && (localSchool.school_id || localSchool.id)) {
        return {
          id: localSchool.school_id || localSchool.id,
          name: localSchool.school_name || localSchool.name || "",
          logo_url: localSchool.logo_url || null,
          division: localSchool.division || "",
          district: localSchool.district || "",
          address: localSchool.address || "",
          source: 'local',
        };
      }
    } catch (e) {
      console.error("[SQLite] Failed to load school locally:", e);
    }
  }

  // 2. If online, fetch from Supabase to get latest data
  if (navigator.onLine) {
    try {
      const remote = await fetchSchoolForUser(userId);
      if (remote && window.sqlite?.saveSchool) {
        // Cache it locally for next time offline
        await window.sqlite.saveSchool(
          {
            school_id: remote.id,
            school_name: remote.name,
            division: remote.division,
            district: remote.district,
            address: remote.address,
            logo_url: remote.logo_url,
          },
          userId
        ).catch(e => console.warn("[SQLite] Failed to cache school:", e));
      }
      return remote ? { ...remote, source: 'remote' } : null;
    } catch (e) {
      console.error("[Sync] Failed to fetch school from Supabase:", e);
      return null;
    }
  }

  return null;
}

export async function saveSchoolsCache(schools) {
  try {
    localStorage.setItem(KEYS.SCHOOLS_CACHE, JSON.stringify(schools));
    localStorage.setItem(KEYS.SCHOOLS_CACHE_TIME, new Date().toISOString());
  } catch (e) {
    console.warn("[Cache] Failed to save schools cache:", e);
  }
}

export function loadSchoolsCache() {
  try {
    const raw = localStorage.getItem(KEYS.SCHOOLS_CACHE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getSchoolsCacheTime() {
  try {
    const raw = localStorage.getItem(KEYS.SCHOOLS_CACHE_TIME);
    return raw ? new Date(raw) : null;
  } catch {
    return null;
  }
}

export async function fetchSchoolById(schoolId) {
  if (!schoolId) return null;

  const cfg = loadSupabaseConfig();

  const res = await fetch(
    `${cfg.url}/rest/v1/schools?school_id=eq.${encodeURIComponent(schoolId)}&select=*`,
    {
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${await getSupabaseAccessToken(cfg)}`,
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
    .from(SCHOOL_LOGO_BUCKET)
    .upload(storagePath, blob, {
      contentType: blob.type || 'image/png',
      upsert: true,
    });

  if (uploadError) {
    console.error('[Supabase] Logo upload failed:', uploadError);
    throw uploadError;
  }

  const { data: publicUrlData } = supabase.storage
    .from(SCHOOL_LOGO_BUCKET)
    .getPublicUrl(storagePath);
  const logoUrl = publicUrlData?.publicUrl;

  if (!logoUrl) {
    throw new Error('Supabase did not return a public URL for the school logo.');
  }

  const cfg = loadSupabaseConfig();
  const patchRes = await fetch(
    `${cfg.url}/rest/v1/schools?school_id=eq.${schoolId}`,
    {
      method: 'PATCH',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${await getSupabaseAccessToken(cfg)}`,
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
  // If offline, return cached schools
  if (!navigator.onLine) {
    const cached = loadSchoolsCache();
    if (cached.length > 0) {
      console.log("[Sync] Using cached schools (offline)");
      return cached;
    }
    throw new Error("No internet connection and no cached schools available");
  }

  const cfg = loadSupabaseConfig();

  try {
    const res = await fetch(`${cfg.url}/rest/v1/schools?select=*&order=name.asc`, {
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${await getSupabaseAccessToken(cfg)}`,
      },
    });

    if (!res.ok) {
      const cached = loadSchoolsCache();
      if (cached.length > 0) {
        console.warn("[Sync] Failed to fetch schools, using cache. Error:", res.status);
        return cached;
      }
      throw new Error(`Failed fetching schools: ${res.status}`);
    }

    const rows = await res.json();
    const schools = rows.map((r) => ({
      id: r.school_id,
      name: r.name || r.school_name, 
      division: r.division,
      district: r.district,
      address: r.address,
      logo: r.logo_url || null,
    }));

    // Cache the schools for offline use
    await saveSchoolsCache(schools);
    return schools;
  } catch (e) {
    console.error("[Sync] Error fetching schools:", e.message);
    const cached = loadSchoolsCache();
    if (cached.length > 0) {
      console.log("[Sync] Falling back to cached schools");
      return cached;
    }
    throw e;
  }
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
    const normalized = [...new Set(queue.map(id => String(id)))];
    localStorage.setItem(KEYS.SYNC_QUEUE, JSON.stringify(normalized));
    window.dispatchEvent(new Event("local-storage-sync-update"));
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

  const res = await fetch(
    `${cfg.url}/rest/v1/schools?name=eq.${encodeURIComponent(name)}&select=*`,
    {
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${await getSupabaseAccessToken(cfg)}`,
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

// Remove queue entries that no longer have a matching local student. This can
// happen after switching schools or replacing an imported class list.
export function pruneSyncQueue(students = []) {
  const localIds = new Set(students.map(student => String(student.id)));
  const queue = loadQueue();
  const prunedQueue = queue.filter(id => localIds.has(String(id)));
  if (prunedQueue.length !== queue.length) saveQueue(prunedQueue);
  return queue.length - prunedQueue.length;
}

// Discards upload requests only. It deliberately leaves the local student data
// and pending cloud deletions untouched.
export function discardPendingUploads() {
  const discarded = loadQueue().length;
  clearQueue();
  return discarded;
}

function removeFromSyncQueue(ids) {
  const completedIds = new Set(ids.map(id => String(id)));
  saveQueue(loadQueue().filter(id => !completedIds.has(String(id))));
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
  const accessToken = await getSupabaseAccessToken(cfg);
  // 1. Deduplicate by unique student ID to prevent PostgreSQL "ON CONFLICT DO UPDATE" 500 error
  const uniqueMap = new Map();
  students.forEach((student) => {
    if (student && student.id) {
      uniqueMap.set(String(student.id), student);
    }
  });
  const deduplicatedStudents = Array.from(uniqueMap.values());

  // 2. Build payload from deduplicated student records
  const payload = deduplicatedStudents.map(s => {
    const schoolYear = s.schoolYear || s.school_year;
    return {
      id: String(s.id),
      school_id: s.school_id || s.schoolId || "",
      school_name: s.school_name || s.schoolName || "",
      lrn: s.lrn,
      registry_no: s.registryNo || null,
      name: s.name,
      birthdate: s.birthdate || null,
      age: s.age || 0,
      sex: s.sex,
      section: s.section,
      parent_consent: s.parentConsent || 'N',
      member_4ps: s.member4ps || 'N',
      previous_sbfp_beneficiary: s.previousSbfpBeneficiary || 'N',
      records: s.records,
      ...(schoolYear ? { school_year: schoolYear } : {}),
      updated_at: new Date().toISOString(),
    };
  });

  const res = await fetch(`${cfg.url}/rest/v1/students`, {
    method: 'POST',
    headers: {
      'apikey':        cfg.key,
      'Authorization': `Bearer ${accessToken}`,
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

  const accessToken = await getSupabaseAccessToken(cfg);

  const idList = ids.map(id => String(id)).join(',');

  const res = await fetch(`${cfg.url}/rest/v1/students?id=in.(${idList})`, {
    method: 'DELETE',
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Delete failed: ${res.status} ${err}`);
  }

  return true;
}

async function supabaseFetchAll(cfg, schoolId, schoolName = "") {
  const accessToken = await getSupabaseAccessToken(cfg);
  let url = `${cfg.url}/rest/v1/students?select=*&order=name.asc`;

  if (schoolId) {
    url += `&school_id=eq.${encodeURIComponent(schoolId)}`;
  }

  const headers = {
    'apikey':        cfg.key,
    'Authorization': `Bearer ${accessToken}`,
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
    schoolYear: r.school_year || "",
    parentConsent: r.parent_consent || 'N',
    member4ps: r.member_4ps || 'N',
    previousSbfpBeneficiary: r.previous_sbfp_beneficiary || 'N',
    records: normalizeStudentRecords(r.records),
    photo: r.photo_url || null,
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

  // Old app versions could leave orphaned IDs in this device-wide queue. They
  // can never be uploaded, so remove them instead of showing "unsynced"
  // forever.
  const staleIds = queue.filter(id => !toSync.some(s => String(s.id) === String(id)));
  const staleCount = staleIds.length;
  if (staleCount > 0) removeFromSyncQueue(staleIds);

  if (queue.length === 0 && deleteQueue.length === 0) {
    return { success: true, reason: 'nothing_to_sync' };
  }

  if (toSync.length === 0 && deleteQueue.length === 0) {
    return { success: true, reason: 'stale_queue_cleared', discarded: staleCount };
  }

  try {
    if (deleteQueue.length > 0) {
      await supabaseDelete(cfg, deleteQueue);
      clearDeleteQueue();
    }

    if (toSync.length > 0) {
      await supabaseUpsert(cfg, toSync);
      // Keep edits queued while this request was in flight; remove only the
      // records that were part of this upload.
      removeFromSyncQueue(toSync.map(student => student.id));
    }

    let activeSchoolName = "";
    if (toSync.length > 0 && toSync[0].schoolName) {
      activeSchoolName = toSync[0].schoolName;
    }

    saveLastSync(new Date());

    const queuedSchoolIds = [...new Set(
      toSync
        .map(student => student.schoolId || student.school_id)
        .filter(Boolean)
        .map(String)
    )];
    const effectiveSchoolId = schoolId || (queuedSchoolIds.length === 1 ? queuedSchoolIds[0] : null);

    // Never download every school's records after a manual upload. If a school
    // cannot be identified, keep this device's current list after the upload.
    if (!effectiveSchoolId) {
      return {
        success: true,
        synced: toSync.length,
        deleted: deleteQueue.length,
        discarded: staleCount,
        students,
      };
    }

    const freshData = await supabaseFetchAll(cfg, effectiveSchoolId, activeSchoolName);
    
    // Prefer the cloud's photo_url — that's the source of truth other
    // devices write to. Only fall back to this device's local SQLite photo
    // if the cloud genuinely has nothing yet.
    const localData = await localLoadStudents();
    const mergedData = freshData.map(remoteStudent => {
      const localMatch = localData.find(l => String(l.id) === String(remoteStudent.id));
      return {
        ...remoteStudent,
        photo: remoteStudent.photo || (localMatch ? localMatch.photo : null)
      };
    });

    await localSaveStudents(mergedData);

    return {
      success: true,
      synced: toSync.length,
      deleted: deleteQueue.length,
      discarded: staleCount,
      students: mergedData,
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

    const localData = await localLoadStudents();
    const mergedData = serverStudents.map(remoteStudent => {
      const localMatch = localData.find(l => String(l.id) === String(remoteStudent.id));
      return {
        ...remoteStudent,
        photo: remoteStudent.photo || (localMatch ? localMatch.photo : null)
      };
    });

    await localSaveStudents(mergedData);
    saveLastSync(new Date()); 

    return {
      success: true,
      students: mergedData,
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
