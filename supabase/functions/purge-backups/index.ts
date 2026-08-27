import { createClient } from "npm:@supabase/supabase-js@2";

const IMAGE_BUCKET = "it-request-images";
const BACKUP_RETENTION_DAYS = 7;
const MAX_REQUESTS_PER_RUN = 100;
const MAX_STORAGE_DELETE_BATCH = 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cleanup-secret",
};

interface RequestRow {
  id: string;
  code: string;
  subject: string;
  target_department: string;
  image_path: string | null;
  archived_at: string | null;
}

interface MessageImageRow {
  image_path: string | null;
}

function hasPermission(
  profile: { role: string; permissions?: string[] | null },
  permission: string,
) {
  return profile.role === "super_admin" ||
    (profile.role === "admin" &&
      (profile.permissions ?? []).includes(permission));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const cleanupSecret = Deno.env.get("BACKUP_CLEANUP_SECRET");

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !cleanupSecret) {
      return jsonResponse({ error: "ตั้งค่า Edge Function ไม่ครบ" }, 500);
    }

    const payload = await request.json().catch(() => ({})) as {
      requestId?: unknown;
    };
    const requestId = typeof payload.requestId === "string"
      ? payload.requestId.trim()
      : "";
    const isScheduledCall =
      request.headers.get("x-cleanup-secret") === cleanupSecret;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let actorId: string | null = null;
    let actorName = "ระบบอัตโนมัติ";
    let actorEmail: string | null = null;
    let actorRole: string | null = null;
    let actorDepartment: string | null = null;

    if (!isScheduledCall) {
      const authorization = request.headers.get("Authorization");
      if (!authorization) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const token = authorization.replace(/^Bearer\s+/i, "");
      const {
        data: { user: caller },
        error: callerError,
      } = await callerClient.auth.getUser(token);

      if (callerError || !caller) {
        return jsonResponse({ error: "กรุณาเข้าสู่ระบบใหม่" }, 401);
      }

      const { data: callerProfile, error: profileLookupError } =
        await adminClient
          .from("profiles")
          .select("role, permissions, department, full_name, email")
          .eq("id", caller.id)
          .single();

      if (
        profileLookupError ||
        !callerProfile ||
        !hasPermission(callerProfile, "archive.delete")
      ) {
        return jsonResponse({ error: "บัญชีนี้ไม่มีสิทธิ์ลบข้อมูลถาวร" }, 403);
      }

      actorId = caller.id;
      actorName = callerProfile.full_name;
      actorEmail = callerProfile.email;
      actorRole = callerProfile.role;
      actorDepartment = callerProfile.department;

      if (!requestId) {
        return jsonResponse({ error: "กรุณาระบุคำขอที่ต้องการลบ" }, 400);
      }
    }

    if (requestId && !isUuid(requestId)) {
      return jsonResponse({ error: "รหัสคำขอไม่ถูกต้อง" }, 400);
    }

    const cutoff = new Date(
      Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    let requestQuery = adminClient
      .from("it_requests")
      .select("id, code, subject, target_department, image_path, archived_at")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: true })
      .limit(MAX_REQUESTS_PER_RUN);

    requestQuery = requestId
      ? requestQuery.eq("id", requestId)
      : requestQuery.lte("archived_at", cutoff);

    const { data: requestRows, error: requestLookupError } = await requestQuery;
    if (requestLookupError) throw requestLookupError;

    const requests = (requestRows ?? []) as RequestRow[];
    if (requestId && requests.length === 0) {
      return jsonResponse(
        { error: "ไม่พบคำขอในคลังสำรอง หรือคำขอถูกลบไปแล้ว" },
        404,
      );
    }

    if (
      !isScheduledCall &&
      actorRole !== "super_admin" &&
      requests.some((item) => item.target_department !== actorDepartment)
    ) {
      return jsonResponse(
        { error: "บัญชีนี้ลบได้เฉพาะคำขอที่ส่งมายังแผนกของตนเอง" },
        403,
      );
    }

    if (requests.length === 0) {
      return jsonResponse({
        mode: isScheduledCall ? "scheduled" : "manual",
        deletedCount: 0,
        deletedRequestIds: [],
        hasMore: false,
      });
    }

    const requestIds = requests.map((item) => item.id);
    const { data: messageRows, error: messageLookupError } = await adminClient
      .from("it_request_messages")
      .select("image_path")
      .in("request_id", requestIds)
      .not("image_path", "is", null);

    if (messageLookupError) throw messageLookupError;

    const imagePaths = Array.from(
      new Set(
        [
          ...requests.map((item) => item.image_path),
          ...((messageRows ?? []) as MessageImageRow[]).map(
            (item) => item.image_path,
          ),
        ].filter((path): path is string => Boolean(path)),
      ),
    );

    for (
      let index = 0;
      index < imagePaths.length;
      index += MAX_STORAGE_DELETE_BATCH
    ) {
      const batch = imagePaths.slice(index, index + MAX_STORAGE_DELETE_BATCH);
      const { error: storageDeleteError } = await adminClient.storage
        .from(IMAGE_BUCKET)
        .remove(batch);

      if (storageDeleteError) throw storageDeleteError;
    }

    const { error: requestDeleteError } = await adminClient
      .from("it_requests")
      .delete()
      .in("id", requestIds);

    if (requestDeleteError) throw requestDeleteError;

    const { error: activityLogError } = await adminClient
      .from("activity_logs")
      .insert(
        requests.map((item) => ({
          actor_id: actorId,
          actor_name: actorName,
          actor_email: actorEmail,
          action: isScheduledCall
            ? "request_auto_deleted"
            : "request_deleted",
          entity_type: "request",
          entity_id: item.id,
          request_id: null,
          request_code: item.code,
          target_department: item.target_department,
          description: isScheduledCall
            ? `ระบบลบคำขอ “${item.subject}” เมื่อครบกำหนดสำรอง 7 วัน`
            : `ลบคำขอ “${item.subject}” ออกจากคลังสำรองถาวร`,
          metadata: {
            subject: item.subject,
            archived_at: item.archived_at,
            deletion_mode: isScheduledCall ? "scheduled" : "manual",
          },
        })),
      );

    if (activityLogError && activityLogError.code !== "42P01") {
      console.error("Failed to write activity log", activityLogError);
    }

    return jsonResponse({
      mode: isScheduledCall ? "scheduled" : "manual",
      deletedCount: requestIds.length,
      deletedRequestIds: requestIds,
      hasMore: !requestId && requestIds.length === MAX_REQUESTS_PER_RUN,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาด";
    return jsonResponse({ error: message }, 500);
  }
});
