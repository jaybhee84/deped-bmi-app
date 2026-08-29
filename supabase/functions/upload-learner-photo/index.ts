import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

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
    const requestedFilename = String(form.get("filename") ?? "").trim();
    const file = form.get("file");

    if (!studentId || !requestedFilename || !(file instanceof File)) {
      return json(400, { error: "student_id, filename, and file are required" });
    }

    const { data: student, error: studentError } = await ctx.supabase
      .from("students")
      .select("id, school_id")
      .eq("id", studentId)
      .single();

    if (studentError || !student) {
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

    const safeFilename = requestedFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `avatars/${safeFilename}`;
    const uploadResponse = await fetch(
      `${destinationUrl}/storage/v1/object/${PHOTO_BUCKET}/${storagePath}`,
      {
        method: "POST",
        headers: {
          apikey: destinationKey,
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
    const { error: updateError } = await ctx.supabase
      .from("students")
      .update({ photo_url: publicUrl })
      .eq("id", studentId);

    if (updateError) {
      console.error("Failed to link IECE photo to student:", updateError);
      return json(502, { error: "Photo uploaded but could not be linked to the student" });
    }

    return json(200, { publicUrl, storageProject: "school" });
  }),
};
