import { supabase } from "./supabase";

// ── SBFP Official Beneficiary Configuration ───────────────────────────────
// Set by SDO. Read by all schools to determine who is an official beneficiary.
// Stored in Supabase (table: sbfp_config) so it syncs across all devices.

const CONFIG_ROW_ID = "official"; // single shared config row for the whole system

export const DEFAULT_SBFP_CONFIG = {
  grades: [],
  criteria: [],
  criterionGradeRestrictions: {},
  setBy: null,
  setAt: null,
};

/**
 * Load the official SBFP config from Supabase.
 * Returns DEFAULT_SBFP_CONFIG if nothing is set yet or on error.
 */
export async function loadSbfpConfig() {
  try {
    const { data, error } = await supabase
      .from("sbfp_config")
      .select("*")
      .eq("id", CONFIG_ROW_ID)
      .maybeSingle();

    if (error) {
      console.error("loadSbfpConfig error:", error);
      return DEFAULT_SBFP_CONFIG;
    }

    if (!data) return DEFAULT_SBFP_CONFIG;

    return {
      ...DEFAULT_SBFP_CONFIG,
      ...(data.config || {}),
      setBy: data.set_by ?? null,
      setAt: data.set_at ?? null,
    };
  } catch (err) {
    console.error("loadSbfpConfig exception:", err);
    return DEFAULT_SBFP_CONFIG;
  }
}

/**
 * Save the official SBFP config to Supabase.
 * `config` should include grades, criteria, criterionGradeRestrictions,
 * setBy, setAt.
 */
export async function saveSbfpConfig(config) {
  try {
    const { setBy, setAt, ...rest } = config;

    const { error } = await supabase.from("sbfp_config").upsert({
      id: CONFIG_ROW_ID,
      config: rest,
      set_by: setBy ?? null,
      set_at: setAt ?? new Date().toISOString(),
    });

    if (error) {
      console.error("saveSbfpConfig error:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("saveSbfpConfig exception:", err);
    return false;
  }
}

/**
 * Check if a student is an official SBFP beneficiary
 * based on the SDO-configured criteria.
 */
export function isOfficialBeneficiary(student, bmiStatus, hazStatus, config) {
  if (!config || typeof config.then === "function") return false;

  const grade = student.section?.split(" - ")[0] || "";

  const configGrades = config.grades || [];
  const configCriteria = config.criteria || [];
  const restrictions = config.criterionGradeRestrictions || {};

  // Automatic grade inclusion
  if (configGrades.includes(grade)) {
    return true;
  }

  // BMI
  if (bmiStatus?.label && configCriteria.includes(bmiStatus.label)) {
    const allowedGrades = restrictions[bmiStatus.label];

    if (!allowedGrades || allowedGrades.length === 0) {
      return true;
    }

    if (allowedGrades.includes(grade)) {
      return true;
    }
  }

  // HAZ
  if (hazStatus?.label && configCriteria.includes(hazStatus.label)) {
    const allowedGrades = restrictions[hazStatus.label];

    if (!allowedGrades || allowedGrades.length === 0) {
      return true;
    }

    if (allowedGrades.includes(grade)) {
      return true;
    }
  }

  return false;
}

/**
 * Load manual enrolment numbers for a given school + school year.
 * Offline-first: reads local SQLite immediately (works with no internet),
 * then — if online — refreshes from Supabase (the shared source of truth
 * other devices write to) and re-caches that locally.
 * Returns {} if nothing is set yet, if schoolId is missing, or on error.
 */
export async function loadSbfpEnrolment(schoolId, sy) {
  if (!schoolId || !sy) return {};

  let localResult = null;
  try {
    localResult = await window.sqlite?.loadEnrolment?.(schoolId, sy);
  } catch (e) {
    console.error("[SQLite] loadEnrolment failed:", e);
  }

  if (!navigator.onLine) {
    return localResult?.data || {};
  }

  try {
    const { data, error } = await supabase
      .from("sbfp_enrolment")
      .select("*")
      .eq("school_id", schoolId)
      .eq("sy", sy)
      .maybeSingle();

    if (error) {
      console.error("loadSbfpEnrolment error:", error);
      return localResult?.data || {};
    }

    if (!data) return localResult?.data || {};

    // Re-cache the server copy locally so it's available next time offline.
    try {
      const total =
        data.total ??
        Object.values(data.data || {}).reduce(
          (acc, val) => acc + (Number(val) || 0),
          0,
        );
      await window.sqlite?.saveEnrolment?.(schoolId, sy, data.data || {}, total);
      await window.sqlite?.markEnrolmentClean?.(schoolId, sy);
    } catch (e) {
      console.error("[SQLite] Failed to cache enrolment locally:", e);
    }

    return data.data || {};
  } catch (err) {
    console.error("loadSbfpEnrolment exception:", err);
    return localResult?.data || {};
  }
}

/**
 * Save manual enrolment numbers for a given school + school year.
 * Offline-first: always writes to local SQLite first, then pushes to Supabase
 * when online. Also computes and stores the grand `total` in both local SQLite 
 * and Supabase.
 */
export async function saveSbfpEnrolment(schoolId, sy, enrolmentData, total) {
  if (!schoolId) {
    console.error("saveSbfpEnrolment error: missing schoolId");
    return false;
  }

  const grandTotal =
    total ??
    Object.values(enrolmentData || {}).reduce(
      (sum, val) => sum + (Number(val) || 0),
      0,
    );

  // 1. Local-first save — must succeed even with no internet.
  try {
    await window.sqlite?.saveEnrolment?.(schoolId, sy, enrolmentData, grandTotal);
  } catch (e) {
    console.error("[SQLite] Failed to save enrolment locally:", e);
    return false;
  }

  // 2. If offline, stop here — dirty row will flush next time online.
  if (!navigator.onLine) {
    return true;
  }

  try {
    const { error } = await supabase.from("sbfp_enrolment").upsert(
      {
        school_id: String(schoolId).trim(),
        sy,
        data: enrolmentData,
        total: grandTotal, // Includes the total in Supabase write
        updated_at: new Date().toISOString(),
      },
      { onConflict: "school_id,sy" },
    );

    if (error) {
      console.error("saveSbfpEnrolment error:", error);
      return true;
    }

    try {
      await window.sqlite?.markEnrolmentClean?.(schoolId, sy);
    } catch (e) {
      console.error("[SQLite] Failed to mark enrolment clean:", e);
    }

    return true;
  } catch (err) {
    console.error("saveSbfpEnrolment exception:", err);
    return true;
  }
}

/**
 * Push any enrolment rows saved locally while offline up to Supabase.
 */
export async function flushDirtyEnrolment() {
  if (!navigator.onLine) return { synced: 0 };

  let dirtyRows = [];
  try {
    dirtyRows = (await window.sqlite?.getDirtyEnrolment?.()) || [];
  } catch (e) {
    console.error("[SQLite] Failed to read dirty enrolment rows:", e);
    return { synced: 0 };
  }

  let synced = 0;
  for (const row of dirtyRows) {
    try {
      const { error } = await supabase.from("sbfp_enrolment").upsert(
        {
          school_id: String(row.schoolId).trim(),
          sy: row.sy,
          data: row.data,
          total: row.total ?? row.grandTotal, // Includes the total in sync payload
          updated_at: new Date().toISOString(),
        },
        { onConflict: "school_id,sy" },
      );

      if (!error) {
        await window.sqlite?.markEnrolmentClean?.(row.schoolId, row.sy);
        synced++;
      } else {
        console.error("flushDirtyEnrolment upsert error:", error);
      }
    } catch (e) {
      console.error("flushDirtyEnrolment exception:", e);
    }
  }

  return { synced };
}