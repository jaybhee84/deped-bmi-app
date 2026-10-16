// One adviser list per school, used by NS Entries, Edit Class and the NS Report.
// - IECES: read-only, from its Project Rising org chart (custom setup, unchanged).
// - Other schools: entered on the Class Advisers tab, saved to Supabase
//   (public.class_advisers) with a local copy so it also works offline.
//   Unsynced saves and deletes are retried on the next load or save.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { fetchIecesAdvisers, isIecesSchool, orgAdviserNames } from "./iecesOrgChart";

const CHANGED_EVENT = "class-advisers-changed";
const LEGACY_TEACHERS_KEY = "deped_bmi_teachers";
const cacheKey = (schoolId) => `class-advisers:${schoolId}`;
const deletedKey = (schoolId) => `class-advisers-deleted:${schoolId}`;

const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

// { id, grade, first, middle, family, displayName, fullName, pending? }
function toAdviser(row, extra = {}) {
  return {
    id: String(row.id),
    grade: String(row.grade_level || "").trim(),
    ...orgAdviserNames(row),
    ...extra,
  };
}

const toRow = (adviser, schoolId) => ({
  id: adviser.id,
  school_id: String(schoolId),
  grade_level: adviser.grade,
  family_name: adviser.family,
  first_name: adviser.first,
  middle_name: adviser.middle || null,
  updated_at: new Date().toISOString(),
});

function readJson(key, fallback, store = localStorage) {
  try {
    const value = JSON.parse(store.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("Unable to save class advisers locally.", error);
  }
}

const newId = () =>
  globalThis.crypto?.randomUUID?.() ||
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (c ^ (Math.random() * 16) >> (c / 4)).toString(16),
  );

// Teachers typed in NS Entries before this tab existed ("Maria C. Santos" per grade).
function legacyAdvisers() {
  const map = readJson(LEGACY_TEACHERS_KEY, {});
  if (!map || typeof map !== "object") return [];
  return Object.entries(map).flatMap(([grade, names]) =>
    (Array.isArray(names) ? names : []).map((name) => {
      const parts = String(name).trim().split(/\s+/);
      const first = parts.shift() || "";
      const family = parts.pop() || "";
      const middle = parts.join(" ").replace(/\.$/, "");
      return toAdviser(
        { id: newId(), grade_level: grade, first_name: first, middle_name: middle, family_name: family },
        { pending: true },
      );
    }),
  ).filter((adviser) => adviser.first && adviser.family);
}

// The old teacher list was per device, not per school, so it moves only into
// the school this device's own account is bound to, and only once. A school
// opened in audit mode must never receive another school's teachers.
function ownsLegacyTeachers(schoolId) {
  const session = readJson("sb_current_session", null, sessionStorage);
  return Boolean(
    session && !session.auditMode && String(session.school_id || "") === String(schoolId),
  );
}

export function loadLocalAdvisers(schoolId) {
  if (!schoolId) return [];
  const cached = readJson(cacheKey(schoolId), null);
  if (Array.isArray(cached)) return cached;
  const migrated = ownsLegacyTeachers(schoolId) ? legacyAdvisers() : [];
  writeJson(cacheKey(schoolId), migrated);
  if (migrated.length) {
    try {
      localStorage.removeItem(LEGACY_TEACHERS_KEY);
    } catch {
      // Already copied; a leftover legacy list is harmless once this cache exists.
    }
  }
  return migrated;
}

function storeLocal(schoolId, advisers) {
  writeJson(cacheKey(schoolId), advisers);
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { schoolId } }));
}

export function sortAdvisers(advisers, gradeOrder = []) {
  const rank = (grade) => {
    const index = gradeOrder.indexOf(grade);
    return index < 0 ? 99 : index;
  };
  return [...advisers].sort(
    (a, b) =>
      rank(a.grade) - rank(b.grade) ||
      a.grade.localeCompare(b.grade) ||
      a.family.localeCompare(b.family) ||
      a.first.localeCompare(b.first),
  );
}

// Syncs run one at a time, so a page-load sync and a save cannot overwrite
// each other's results.
let syncChain = Promise.resolve();
export function syncAdvisers(schoolId) {
  const run = syncChain.then(() => runSync(schoolId));
  syncChain = run.catch(() => {});
  return run;
}

// Push unsynced saves/deletes, then take the server list (keeping anything
// still unsynced). Returns { advisers, synced, error }.
async function runSync(schoolId) {
  let local = loadLocalAdvisers(schoolId);
  const deleted = readJson(deletedKey(schoolId), []);
  try {
    const unsynced = local.filter((adviser) => adviser.pending);
    if (unsynced.length) {
      const { error } = await supabase
        .from("class_advisers")
        .upsert(unsynced.map((adviser) => toRow(adviser, schoolId)));
      if (error) throw error;
    }
    if (deleted.length) {
      const { error } = await supabase.from("class_advisers").delete().in("id", deleted);
      if (error) throw error;
      writeJson(deletedKey(schoolId), []);
    }
    const { data, error } = await supabase
      .from("class_advisers")
      .select("id,grade_level,family_name,first_name,middle_name")
      .eq("school_id", String(schoolId));
    if (error) throw error;
    // Saves and deletes made while this sync was in flight are still local
    // only; keep them on top of the server list for the next sync to upload.
    const uploaded = new Set(unsynced.map((adviser) => adviser.id));
    const pendingDeletes = new Set(readJson(deletedKey(schoolId), []));
    const stillPending = loadLocalAdvisers(schoolId).filter(
      (adviser) => adviser.pending && !uploaded.has(adviser.id),
    );
    local = [
      ...(data || [])
        .map((row) => toAdviser(row))
        .filter(
          (adviser) =>
            !pendingDeletes.has(adviser.id) &&
            !stillPending.some((item) => item.id === adviser.id),
        ),
      ...stillPending,
    ];
    storeLocal(schoolId, local);
    return { advisers: local, synced: !stillPending.length, error: null };
  } catch (error) {
    return { advisers: local, synced: false, error };
  }
}

export async function saveAdviser(schoolId, input) {
  const adviser = toAdviser(
    {
      id: input.id || newId(),
      grade_level: input.grade,
      first_name: input.first,
      middle_name: input.middle,
      family_name: input.family,
    },
    { pending: true },
  );
  const local = loadLocalAdvisers(schoolId);
  const exists = local.some((item) => item.id === adviser.id);
  storeLocal(
    schoolId,
    exists ? local.map((item) => (item.id === adviser.id ? adviser : item)) : [...local, adviser],
  );
  return syncAdvisers(schoolId);
}

export async function deleteAdviser(schoolId, id) {
  const local = loadLocalAdvisers(schoolId);
  const target = local.find((item) => item.id === id);
  storeLocal(schoolId, local.filter((item) => item.id !== id));
  // Always queue the server delete: an adviser still marked unsynced may have
  // been uploaded by a sync already in flight. Deleting a missing id is harmless.
  if (target) {
    writeJson(deletedKey(schoolId), [...new Set([...readJson(deletedKey(schoolId), []), id])]);
  }
  return syncAdvisers(schoolId);
}

export function advisersForGrade(advisers, grade) {
  const target = normalize(grade);
  return advisers.filter((adviser) => normalize(adviser.grade) === target);
}

// "Grade 6 - Elliot - Morning" -> the grade's adviser whose family name matches
// (doubled letters ignored, so "Elliot" still finds "Eliot").
export function adviserForSection(advisers, section) {
  const parts = String(section || "").split(" - ").map((part) => part.trim());
  if (parts.length < 2) return null;
  const family = normalize(parts[1]);
  const loose = (value) => value.replace(/[^A-Z]/g, "").replace(/(.)\1+/g, "$1");
  const sameGrade = advisersForGrade(advisers, parts[0]);
  return (
    sameGrade.find((adviser) => normalize(adviser.family) === family) ||
    sameGrade.find((adviser) => loose(normalize(adviser.family)) === loose(family)) ||
    null
  );
}

/**
 * The school's advisers. source: "org" (IECES, read-only) or "school".
 * status: "loading" | "synced" | "offline" (local copy, will sync later).
 */
export function useSchoolAdvisers(schoolId) {
  const isIeces = isIecesSchool(schoolId);
  const [advisers, setAdvisers] = useState(() =>
    isIeces ? [] : loadLocalAdvisers(schoolId),
  );
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  const applyResult = useCallback((result) => {
    setAdvisers(result.advisers);
    setStatus(result.synced ? "synced" : "offline");
    setError(result.error || null);
  }, []);

  useEffect(() => {
    if (!schoolId) {
      setAdvisers([]);
      return undefined;
    }
    let active = true;
    setStatus("loading");
    if (isIeces) {
      fetchIecesAdvisers()
        .then((rows) => {
          if (!active) return;
          setAdvisers(rows.map((row) => toAdviser(row)));
          setStatus("synced");
        })
        .catch((loadError) => {
          if (!active) return;
          console.warn("Unable to load IECES advisers:", loadError.message);
          setStatus("offline");
          setError(loadError);
        });
      return () => {
        active = false;
      };
    }
    setAdvisers(loadLocalAdvisers(schoolId));
    syncAdvisers(schoolId).then((result) => active && applyResult(result));
    const refresh = (event) => {
      if (String(event.detail?.schoolId) === String(schoolId)) {
        setAdvisers(loadLocalAdvisers(schoolId));
      }
    };
    window.addEventListener(CHANGED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(CHANGED_EVENT, refresh);
    };
  }, [schoolId, isIeces, applyResult]);

  const save = useCallback(
    async (input) => {
      const result = await saveAdviser(schoolId, input);
      applyResult(result);
      return result;
    },
    [schoolId, applyResult],
  );
  const remove = useCallback(
    async (id) => {
      const result = await deleteAdviser(schoolId, id);
      applyResult(result);
      return result;
    },
    [schoolId, applyResult],
  );

  return { advisers, source: isIeces ? "org" : "school", status, error, save, remove };
}
