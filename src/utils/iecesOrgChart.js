import { createClient } from "@supabase/supabase-js";

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
