// Who is an SBFP beneficiary, shared by every page's "SBFP Beneficiaries"
// filter: a learner who qualified at the school year's Baseline under the
// SDO's SBFP settings. Midline and Endline measurements do not change the
// list; they track the same beneficiaries.
import { useEffect, useState } from "react";
import { calcBMI, getBMIStatus, getHAZStatus } from "./bmi";
import {
  DEFAULT_SBFP_CONFIG,
  isOfficialBeneficiary,
  loadSbfpConfig,
} from "./sbfpConfig";

const CONFIG_CACHE_KEY = "sbfp_cached_config";

export function isSbfpBeneficiary(student, sy, config) {
  const baseline = student.records?.find((r) => r.sy === sy && r.q === "Baseline");
  const bmi = baseline ? calcBMI(baseline.weight, baseline.height) : null;
  const baz = bmi
    ? getBMIStatus(bmi, student.sex, student.birthdate, baseline.date)
    : null;
  const haz = baseline?.height
    ? getHAZStatus(baseline.height, student.sex, student.birthdate, baseline.date)
    : null;
  return isOfficialBeneficiary(student, baz, haz, config);
}

// learnerScope: "all" | "sbfp"
export function filterByLearnerScope(students, learnerScope, sy, config) {
  if (learnerScope !== "sbfp") return students;
  return students.filter((student) => isSbfpBeneficiary(student, sy, config));
}

// The SDO's SBFP settings: cached copy first (works offline), then Supabase.
export function useSbfpConfig() {
  const [config, setConfig] = useState(() => {
    try {
      const cached = localStorage.getItem(CONFIG_CACHE_KEY);
      return cached ? JSON.parse(cached) : DEFAULT_SBFP_CONFIG;
    } catch {
      return DEFAULT_SBFP_CONFIG;
    }
  });
  useEffect(() => {
    let active = true;
    loadSbfpConfig().then((loaded) => {
      if (!active || !loaded) return;
      setConfig(loaded);
      try {
        localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(loaded));
      } catch {
        // The cache is a convenience; the live config is already in use.
      }
    });
    return () => {
      active = false;
    };
  }, []);
  return config;
}
