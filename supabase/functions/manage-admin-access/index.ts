import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const allowedPermissions = new Set([
  "requests.view",
  "requests.update",
  "requests.archive",
  "archive.view",
  "archive.restore",
  "archive.delete",
  "statistics.view",
  "statistics.export",
  "activity.view",
  "activity.export",
  "users.view",
  "users.create",
  "users.update",
  "departments.create",
]);

const permissionDependencies: Record<string, string> = {
  "requests.update": "requests.view",
  "requests.archive": "requests.view",
  "archive.restore": "archive.view",
  "archive.delete": "archive.view",
  "statistics.export": "statistics.view",
  "activity.export": "activity.view",
  "users.create": "users.view",
  "users.update": "users.view",
  "departments.create": "users.view",
};

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  department?: string | null;
  role: "super_admin" | "admin" | "user";
  permissions: string[] | null;
}

function jsonResponse(body: unknown, status: number) {
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
    const authorization = request.headers.get("Authorization");

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
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

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: callerProfile, error: callerProfileError } =
      await adminClient
        .from("profiles")
        .select("id, email, full_name, department, role, permissions")
        .eq("id", caller.id)
        .single();

    if (
      callerProfileError ||
      (callerProfile as ProfileRow | null)?.role !== "super_admin"
    ) {
      return jsonResponse(
        { error: "เฉพาะ Super Admin เท่านั้นที่กำหนดสิทธิ์ Admin ได้" },
        403,
      );
    }

    const payload = await request.json();
    const userId = String(payload.userId ?? "").trim();
    const role = String(payload.role ?? "");
    const requestedPermissions = Array.isArray(payload.permissions)
      ? payload.permissions.map((item: unknown) => String(item))
      : [];

    if (!isUuid(userId)) {
      return jsonResponse({ error: "รหัสผู้ใช้ไม่ถูกต้อง" }, 400);
    }
    if (userId === caller.id) {
      return jsonResponse(
        { error: "ไม่สามารถเปลี่ยนสิทธิ์ Super Admin ของตนเองผ่านหน้าเว็บ" },
        403,
      );
    }
    if (role !== "admin" && role !== "user") {
      return jsonResponse({ error: "บทบาทที่เลือกไม่ถูกต้อง" }, 400);
    }

    const invalidPermissions = requestedPermissions.filter(
      (permission: string) => !allowedPermissions.has(permission),
    );
    if (invalidPermissions.length > 0) {
      return jsonResponse({ error: "พบสิทธิ์ที่ระบบไม่รองรับ" }, 400);
    }

    const missingDependency = requestedPermissions.find((permission: string) => {
      const dependency = permissionDependencies[permission];
      return dependency && !requestedPermissions.includes(dependency);
    });
    if (missingDependency) {
      return jsonResponse(
        { error: `กรุณาเลือกสิทธิ์ ${permissionDependencies[missingDependency]} ร่วมด้วย` },
        400,
      );
    }

    const permissions = role === "admin"
      ? [...new Set(requestedPermissions)]
      : [];
    const { data: targetProfile, error: targetError } = await adminClient
      .from("profiles")
      .select("id, email, full_name, department, role, permissions")
      .eq("id", userId)
      .single();

    if (targetError || !targetProfile) {
      return jsonResponse({ error: "ไม่พบบัญชีผู้ใช้นี้" }, 404);
    }
    if ((targetProfile as ProfileRow).role === "super_admin") {
      return jsonResponse(
        { error: "ไม่สามารถแก้ไขบัญชี Super Admin ผ่านหน้าเว็บ" },
        403,
      );
    }

    const oldProfile = targetProfile as ProfileRow;
    const { data: updatedProfile, error: updateError } = await adminClient
      .from("profiles")
      .update({ role, permissions })
      .eq("id", userId)
      .neq("role", "super_admin")
      .select("id, email, full_name, department, phone, role, permissions, created_at")
      .single();

    if (updateError || !updatedProfile) {
      return jsonResponse(
        { error: updateError?.message ?? "บันทึกสิทธิ์ไม่สำเร็จ" },
        400,
      );
    }

    const actor = callerProfile as ProfileRow;
    const { error: activityLogError } = await adminClient
      .from("activity_logs")
      .insert({
        actor_id: caller.id,
        actor_name: actor.full_name,
        actor_email: actor.email,
        action: "admin_access_updated",
        entity_type: "user",
        entity_id: userId,
        target_department: oldProfile.department,
        description: `กำหนดบทบาท “${oldProfile.full_name}” เป็น ${role === "admin" ? "Admin" : "User"}`,
        metadata: {
          target_email: oldProfile.email,
          old_role: oldProfile.role,
          new_role: role,
          old_permissions: oldProfile.permissions ?? [],
          new_permissions: permissions,
        },
      });

    if (activityLogError && activityLogError.code !== "42P01") {
      console.error("Failed to write activity log", activityLogError);
    }

    return jsonResponse({ profile: updatedProfile }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาด";
    return jsonResponse({ error: message }, 500);
  }
});
