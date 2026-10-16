import { createClient } from "@supabase/supabase-js";
import { titleCaseName } from "./nameCase";

const IECES_SCHOOL_ID = "126001";
const iecesOrgClient = createClient(
  import.meta.env.VITE_IECES_REPORT_SUPABASE_URL || "https://joilvslvsioayrjshuxg.supabase.co",
  import.meta.env.VITE_IECES_REPORT_SUPABASE_ANON_KEY || "sb_publishable_aozkBamT5C58KY03X9kUgA_iehy73ZU",
);

export function isIecesSchool(schoolId) {
  return String(schoolId || "").trim() === IECES_SCHOOL_ID;
}

export async function fetchIecesAdvisers() {
  const { data, error } = await iecesOrgClient
    .from("org_chart")
    .select("id,family_name,first_name,middle_name,grade_level,status,category,teaching_type")
    .eq("category", "teaching")
    .order("family_name");
  if (error) throw error;
  return (data || []).filter(
    (person) =>
      String(person.teaching_type || "").toLowerCase() === "adviser",
  );
}

// "Juan Dela Cruz Eliot" in full; "Juan D. Eliot" on the report.
export function orgAdviserNames(adviser) {
  const part = (value) =>
    titleCaseName(String(value || "").trim().replace(/\s+/g, " "));
  const [first, middle, family] = [
    adviser.first_name,
    adviser.middle_name,
    adviser.family_name,
  ].map(part);
  const middleInitial = middle ? `${middle.charAt(0).toUpperCase()}.` : "";
  return {
    first,
    middle,
    family,
    fullName: [first, middle, family].filter(Boolean).join(" "),
    displayName: [first, middleInitial, family].filter(Boolean).join(" "),
  };
}
