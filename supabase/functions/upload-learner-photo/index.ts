import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { createHandler } from "../school-data/handler.mjs";

const IECE_SCHOOL_ID = "126001";
const PHOTO_BUCKET = "profiles";

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

export default {
  fetch: withSupabase({ auth: "user" }, async (request, ctx) => {
    if (request.method !== "POST") return json(405, { error: "Method not allowed" });

    const form = await request.formData();
    const studentId = String(form.get("student_id") ?? "").trim();
    const reading = form.get('action') === 'read';
    const file = form.get("file");

    if (!studentId || (!reading && (!(file instanceof File) || file.size > 5242880 ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)))) {
      return json(400, { error: "A student ID and a PNG, JPEG, or WebP image up to 5 MB are required" });
    }

    const route = createHandler(Deno.env);
    const studentQuery = new URLSearchParams({ id: `eq.${studentId}`, school_id: `eq.${IECE_SCHOOL_ID}`, select: "id,school_id,photo_url" });
    const routedRequest = (method: string, query: string, body: string | null = null) => route(new Request(request.url, {
      method: "POST",
      headers: { Authorization: request.headers.get("authorization") || "", "content-type": "application/json" },
      body: JSON.stringify({ table: "students", method, query, body, headers: {} }),
    }));
    const exclusive = Deno.env.get("IECES_EXCLUSIVE_DATA") === "true";
    let student;
    if (exclusive) {
      const lookup = await routedRequest("GET", studentQuery.toString());
      if (!lookup.ok) return json(lookup.status, { error: "Student lookup failed" });
      const lookupResult = await lookup.json();
      student = lookupResult.status === 200 ? JSON.parse(lookupResult.body)[0] : null;
    } else {
      const { data } = await ctx.supabase.from("students").select("id,school_id,photo_url").eq("id", studentId).single();
      student = data;
    }

    if (!student) {
      return json(404, { error: "Student not found or not permitted" });
    }

    if (String(student.school_id) !== IECE_SCHOOL_ID) {
      return json(409, { error: "This endpoint only handles IECE learner photos" });
    }

    const destinationUrl = Deno.env.get("SCHOOL_SUPABASE_URL")?.replace(/\/$/, "");
    const destinationKey = Deno.env.get("SCHOOL_SUPABASE_SERVICE_ROLE_KEY");
    if (!destinationUrl || !destinationKey) {
      return json(500, { error: "IECE storage destination is not configured" });
    }

    if (reading) {
      const prefix = `${destinationUrl}/storage/v1/object/public/${PHOTO_BUCKET}/`;
      if (!student.photo_url?.startsWith(prefix)) return json(404, { error: 'Photo not found' });
      const path = student.photo_url.slice(prefix.length);
      if (!/^avatars\/[a-zA-Z0-9/._-]+$/.test(path) || path.split('/').includes('..')) return json(400, { error: 'Invalid photo path' });
      const signed = await fetch(`${destinationUrl}/storage/v1/object/sign/${PHOTO_BUCKET}/${path}`, {
        method: 'POST', headers: { apikey: destinationKey, ...(destinationKey.startsWith('eyJ') ? { Authorization: `Bearer ${destinationKey}` } : {}), 'content-type': 'application/json' },
        body: JSON.stringify({ expiresIn: 600 }),
      });
      if (!signed.ok) return json(502, { error: 'Could not authorize photo access' });
      const result = await signed.json();
      return json(200, { signedUrl: `${destinationUrl}/storage/v1${result.signedURL}` });
    }
    if (!(file instanceof File)) return json(400, { error: 'Image required' });
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type];
    const storagePath = `avatars/${IECE_SCHOOL_ID}/${encodeURIComponent(studentId)}/${crypto.randomUUID()}.${extension}`;
    const uploadResponse = await fetch(
      `${destinationUrl}/storage/v1/object/${PHOTO_BUCKET}/${storagePath}`,
      {
        method: "POST",
        headers: {
          apikey: destinationKey,
          ...(destinationKey.startsWith('eyJ') ? { Authorization: `Bearer ${destinationKey}` } : {}),
          "content-type": file.type || "application/octet-stream",
          "x-upsert": "true",
        },
        body: file,
      },
    );

    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text();
      console.error(`IECE photo upload failed: ${uploadResponse.status} ${detail}`);
      return json(502, { error: "IECE photo storage rejected the upload" });
    }

    const publicUrl = `${destinationUrl}/storage/v1/object/public/${PHOTO_BUCKET}/${storagePath}`;
    let linkFailed;
    if (exclusive) {
      const linked = await routedRequest("PATCH", studentQuery.toString(), JSON.stringify({ photo_url: publicUrl }));
      const linkResult = linked.ok ? await linked.json() : null;
      linkFailed = !linkResult || linkResult.status >= 400;
    } else {
      const { error } = await ctx.supabase.from("students").update({ photo_url: publicUrl }).eq("id", studentId);
      linkFailed = Boolean(error);
    }

    if (linkFailed) {
      console.error("Failed to link IECE photo to student");
      return json(502, { error: "Photo uploaded but could not be linked to the student" });
    }

    return json(200, { publicUrl, storageProject: "school" });
  }),
};
