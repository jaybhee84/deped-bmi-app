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
  // 1. If config is null, undefined, or a Promise instance, return false safely
  if (!config || typeof config.then === "function") return false;

  const grade = student.section?.split(" - ")[0] || "";

  // 2. Added safe fallbacks (|| []) to avoid undefined errors
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
 * Load manual enrolment numbers for a given school + school year from
 * Supabase. School-scoped so every user bound to the same school (see
 * profiles.school_id) sees and edits the same shared enrolment numbers.
 * Returns {} if nothing is set yet, if schoolId is missing, or on error.
 */
export async function loadSbfpEnrolment(schoolId, sy) {
  if (!schoolId || !sy) return {};

  try {
    const { data, error } = await supabase
      .from("sbfp_enrolment")
      .select("*")
      .eq("school_id", schoolId)
      .eq("sy", sy)
      .maybeSingle();

    if (error) {
      console.error("loadSbfpEnrolment error:", error);
      return {};
    }

    return data?.data || {};
  } catch (err) {
    console.error("loadSbfpEnrolment exception:", err);
    return {};
  }
}

/**
 * Save manual enrolment numbers for a given school + school year to Supabase.
 * Uses a streamlined upsert pipeline targeting the composite key.
 */
export async function saveSbfpEnrolment(schoolId, sy, enrolmentData) {
  if (!schoolId) {
    console.error("saveSbfpEnrolment error: missing schoolId");
    return false;
  }

  try {
    const { error } = await supabase.from("sbfp_enrolment").upsert(
      {
        school_id: String(schoolId).trim(),
        sy,
        data: enrolmentData,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "school_id,sy" },
    );

    if (error) {
      console.error("saveSbfpEnrolment error:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("saveSbfpEnrolment exception:", err);
    return false;
  }
}