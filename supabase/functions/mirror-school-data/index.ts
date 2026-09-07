import { BMI_FIELDS } from "../sync-bmi-school-data/sync.mjs";

const MIRROR_SCHOOL_ID = "126001";

const tableConfig: Record<string, { conflict: string[] }> = {
  students: { conflict: ["id"] },
  schools: { conflict: ["school_id"] },
  sbfp_enrolment: { conflict: ["school_id", "sy"] },
  school_info_sbmi: { conflict: ["id"] },
};

type WebhookPayload = {
  type?: "INSERT" | "UPDATE" | "DELETE";
  table?: string;
  schema?: string;
  record?: Record<string, unknown> | null;
  old_record?: Record<string, unknown> | null;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function rowSchoolId(table: string, row: Record<string, unknown>) {
  if (table === "schools") return String(row.school_id ?? "");
  return String(row.school_id ?? "");
}

async function handleRequest(request: Request) {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  const webhookSecret = Deno.env.get("MIRROR_WEBHOOK_SECRET");
  const suppliedSecret = request.headers.get("x-mirror-secret");
  if (!webhookSecret || suppliedSecret !== webhookSecret) {
    return json(401, { error: "Unauthorized" });
  }

  const destinationUrl = Deno.env.get("SCHOOL_SUPABASE_URL")?.replace(/\/$/, "");
  const destinationKey = Deno.env.get("SCHOOL_SUPABASE_SERVICE_ROLE_KEY");
  if (!destinationUrl || !destinationKey) {
    return json(500, { error: "Mirror destination is not configured" });
  }

  let payload: WebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const table = payload.table ?? "";
  const operation = payload.type ?? "";
  const config = tableConfig[table];
  const row = operation === "DELETE" ? payload.old_record : payload.record;

  if (payload.schema !== "public" || !config || !row) {
    return json(202, { mirrored: false, reason: "ignored_event" });
  }

  if (rowSchoolId(table, row) !== MIRROR_SCHOOL_ID) {
    return json(202, { mirrored: false, reason: "different_school" });
  }

  const headers = {
    apikey: destinationKey,
    ...(destinationKey.startsWith("eyJ") ? { Authorization: `Bearer ${destinationKey}` } : {}),
    "content-type": "application/json",
  };

  if (table === "students" && (operation === "INSERT" || operation === "UPDATE")) {
    const divisionUrl = Deno.env.get("SUPABASE_URL");
    const divisionKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!divisionUrl || !divisionKey) return json(500, { error: "Division is not configured" });
    // Read the current row: webhook events may arrive out of order. Never send
    // the historical whole-row payload over newer portal edits.
    const select = ["id", "school_id", "updated_at", ...BMI_FIELDS].join(",");
    const currentResponse = await fetch(`${divisionUrl}/rest/v1/students?id=eq.${encodeURIComponent(String(row.id))}&school_id=eq.${MIRROR_SCHOOL_ID}&select=${select}`, {
      headers: { apikey: divisionKey, Authorization: `Bearer ${divisionKey}` },
    });
    if (!currentResponse.ok) return json(502, { error: "Could not read current BMI student" });
    const currentRows = await currentResponse.json();
    if (!currentRows.length) return json(202, { mirrored: false, reason: "student_no_longer_present" });
    // Create new BMI learners in the school database, but never overwrite an
    // existing learner here. The reconciler sends only fields actually edited.
    const inserted = await fetch(`${destinationUrl}/rest/v1/students?on_conflict=id`, {
      method: "POST",
      headers: { ...headers, prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(currentRows[0]),
    });
    if (!inserted.ok) return json(502, { error: "Could not mirror new BMI student", status: inserted.status });
    const synced = await fetch(`${divisionUrl}/functions/v1/sync-bmi-school-data`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-mirror-secret": webhookSecret },
      body: JSON.stringify({ dry_run: false }),
    });
    if (!synced.ok) return json(502, { error: "Field reconciliation failed; scheduled retry will follow" });
    return json(200, { mirrored: true, table, operation, mode: "bmi_fields_only" });
  }

  let response: Response;
  if (operation === "DELETE") {
    const filters = config.conflict
      .map((column) => `${encodeURIComponent(column)}=eq.${encodeURIComponent(String(row[column] ?? ""))}`)
      .join("&");
    response = await fetch(`${destinationUrl}/rest/v1/${table}?${filters}`, {
      method: "DELETE",
      headers,
    });
  } else if (operation === "INSERT" || operation === "UPDATE") {
    const conflict = encodeURIComponent(config.conflict.join(","));
    response = await fetch(`${destinationUrl}/rest/v1/${table}?on_conflict=${conflict}`, {
      method: "POST",
      headers: { ...headers, prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
    });
  } else {
    return json(202, { mirrored: false, reason: "ignored_operation" });
  }

  if (!response.ok) {
    console.error(`Mirror failed for ${table}: ${response.status}`);
    return json(502, { error: "Destination rejected mirror write", table, status: response.status });
  }

  return json(200, { mirrored: true, table, operation });
}

export default {
  fetch: handleRequest,
};
