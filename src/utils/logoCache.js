// ── School Logo Cache ───────────────────────────────────────────────────
// Preloads every school logo (from SCHOOL_LOGO_MAP) into SQLite as a base64
// data URL, once per machine. After that, switching schools in SDODashboard
// reads from disk instead of Supabase Storage — no half-second fetch delay,
// and it keeps working offline.
//
// Flow:
//   1. On login, App.jsx calls hydrateLogoCache() then preloadAllSchoolLogos().
//   2. hydrateLogoCache() pulls whatever's already cached into memory in one
//      IPC call, so lookups are synchronous from then on.
//   3. preloadAllSchoolLogos() downloads only what's still missing and saves
//      it to SQLite. Safe to call on every login — already-cached entries
//      are skipped, so for returning users on a known machine this is a
//      no-op scan, not a re-download.
//   4. Components call getCachedLogoSrc(name) to read synchronously. If
//      nothing's cached yet (very first run, still downloading), it falls
//      back to the live Supabase URL so the image still shows — it just
//      won't be instant until the background preload finishes.

import { useEffect, useState } from "react";
import { SCHOOL_LOGO_MAP, getSchoolLogoUrl } from "./schoolLogoMap";

const SDO_LOGO_KEY = "__SDO__";

let memoryCache = {};
let hasHydrated = false;
let hydratePromise = null;
let preloadPromise = null;

function isElectron() {
  return typeof window !== "undefined" && !!window.sqlite?.loadAllCachedLogos;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Pulls everything already cached in SQLite into memory. Call this once
// early (e.g. right after login) so getCachedLogoSrc() has something to
// read before the background preload finishes.
export async function hydrateLogoCache() {
  if (hasHydrated) return memoryCache;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    if (isElectron()) {
      try {
        const rows = await window.sqlite.loadAllCachedLogos();
        memoryCache = rows || {};
      } catch (e) {
        console.error("[LogoCache] Failed to hydrate cache:", e);
      }
    }
    hasHydrated = true;
    return memoryCache;
  })();

  return hydratePromise;
}

// Synchronous lookup for use directly in <img src>. Returns a cached
// base64 data URL if we have one, otherwise falls back to the live
// Supabase Storage URL (works online, just not instant).
export function getCachedLogoSrc(schoolKey) {
  if (!schoolKey) return null;
  if (memoryCache[schoolKey]) return memoryCache[schoolKey];
  if (schoolKey === SDO_LOGO_KEY) return null; // has no map-based fallback
  return getSchoolLogoUrl(schoolKey) || null;
}

// Downloads every school logo not already cached and saves it to SQLite.
// Fire-and-forget — call it, don't await it, on the login screen path.
// Safe to call every login: cached entries are skipped, so this only ever
// does real work for logos this machine hasn't seen before.
export async function preloadAllSchoolLogos({ onProgress } = {}) {
  if (!isElectron()) return; // no SQLite bridge (e.g. plain web/dev preview)
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    await hydrateLogoCache();

    const jobs = Object.entries(SCHOOL_LOGO_MAP).map(([name, filename]) => ({
      key: name,
      filename,
      url: getSchoolLogoUrl(name),
    }));

    // The SDO's own banner logo lives in the same bucket as "sdo.png",
    // derived alongside the school logos rather than listed in the map.
    const sampleUrl = getSchoolLogoUrl(Object.keys(SCHOOL_LOGO_MAP)[0]) || "";
    if (sampleUrl) {
      jobs.push({
        key: SDO_LOGO_KEY,
        filename: "sdo.png",
        url: `${sampleUrl.substring(0, sampleUrl.lastIndexOf("/"))}/sdo.png`,
      });
    }

    let done = 0;
    for (const job of jobs) {
      done += 1;
      onProgress?.(done, jobs.length);

      if (memoryCache[job.key] || !job.url) continue; // already cached

      try {
        const res = await fetch(job.url);
        if (!res.ok) continue; // e.g. this school genuinely has no logo yet
        const blob = await res.blob();
        const dataUrl = await blobToDataUrl(blob);

        await window.sqlite.saveLogoToCache(job.key, job.filename, dataUrl);
        memoryCache[job.key] = dataUrl;
      } catch (e) {
        // Offline, or the file doesn't exist — skip and retry next login.
        console.warn(`[LogoCache] Skipped "${job.key}":`, e.message);
      }
    }
  })();

  try {
    await preloadPromise;
  } finally {
    preloadPromise = null;
  }
}

// Optional convenience hook: re-renders once the initial hydrate (fast,
// local-only) completes, so the very first paint after login can already
// use cached logos instead of always falling back to remote on mount.
export function useLogoCacheHydrated() {
  const [ready, setReady] = useState(hasHydrated);

  useEffect(() => {
    if (hasHydrated) {
      setReady(true);
      return;
    }
    let cancelled = false;
    hydrateLogoCache().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
