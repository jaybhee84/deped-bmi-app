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
  if (!config) return false;

  const grade = student.section?.split(" - ")[0] || "";

  // Automatic grade inclusion
  if (config.grades.includes(grade)) {
    return true;
  }

  const restrictions = config.criterionGradeRestrictions || {};

  // BMI
  if (bmiStatus?.label && config.criteria.includes(bmiStatus.label)) {
    const allowedGrades = restrictions[bmiStatus.label];

    if (!allowedGrades || allowedGrades.length === 0) {
      return true;
    }

    if (allowedGrades.includes(grade)) {
      return true;
    }
  }

  // HAZ
  if (hazStatus?.label && config.criteria.includes(hazStatus.label)) {
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
 * Save manual enrolment numbers for a given school + school year to
 * Supabase. Upserts on the (school_id, sy) composite key, so any other
 * user bound to the same school will see these numbers next time they
 * load this page.
 */
export async function saveSbfpEnrolment(schoolId, sy, enrolmentData) {
  if (!schoolId) {
    console.error("saveSbfpEnrolment error: missing schoolId");
    return false;
  }

  try {
    const { error } = await supabase.from("sbfp_enrolment").upsert(
      {
        school_id: schoolId,
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