import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeThaiPhone(value: string) {
  const normalized = value.replace(/[^0-9+]/g, "");
  if (/^0[0-9]{8,9}$/.test(normalized)) {
    return `+66${normalized.slice(1)}`;
  }
  if (/^\+66[0-9]{8,9}$/.test(normalized)) return normalized;
  return null;
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
    const { data: callerProfile, error: profileLookupError } = await adminClient
      .from("profiles")
      .select("role, full_name, email")
      .eq("id", caller.id)
      .single();

    if (profileLookupError || callerProfile?.role !== "admin") {
      return jsonResponse({ error: "เฉพาะผู้ดูแลฝ่าย IT เท่านั้น" }, 403);
    }

    const payload = await request.json();
    const fullName = String(payload.fullName ?? "").trim();
    const email = String(payload.email ?? "").trim().toLowerCase();
    const password = String(payload.password ?? "");
    const department = String(payload.department ?? "").trim();
    const phone = normalizeThaiPhone(String(payload.phone ?? "").trim());

    if (fullName.length < 2 || fullName.length > 120) {
      return jsonResponse({ error: "ชื่อผู้ใช้ต้องมี 2–120 ตัวอักษร" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "รูปแบบอีเมลไม่ถูกต้อง" }, 400);
    }
    if (password.length < 8) {
      return jsonResponse({ error: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" }, 400);
    }
    if (!phone) {
      return jsonResponse(
        { error: "กรุณากรอกเบอร์โทรไทย เช่น 0812345678 หรือ +66812345678" },
        400,
      );
    }

    const { data: departmentRow, error: departmentLookupError } =
      await adminClient
        .from("departments")
        .select("id")
        .eq("name", department)
        .maybeSingle();

    if (departmentLookupError) {
      return jsonResponse({ error: departmentLookupError.message }, 500);
    }
    if (!departmentRow || department === "ฝ่าย IT") {
      return jsonResponse({ error: "กรุณาเลือกแผนกที่ถูกต้อง" }, 400);
    }

    const { data: created, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          department,
          phone,
        },
      });

    if (createError || !created.user) {
      return jsonResponse(
        { error: createError?.message ?? "สร้างผู้ใช้ไม่สำเร็จ" },
        400,
      );
    }

    const profile = {
      id: created.user.id,
      email,
      full_name: fullName,
      department,
      phone,
      role: "user",
    };
    const { error: saveProfileError } = await adminClient
      .from("profiles")
      .upsert(profile, { onConflict: "id" });

    if (saveProfileError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return jsonResponse({ error: saveProfileError.message }, 500);
    }

    const { error: activityLogError } = await adminClient
      .from("activity_logs")
      .insert({
        actor_id: caller.id,
        actor_name: callerProfile.full_name,
        actor_email: callerProfile.email,
        action: "user_created",
        entity_type: "user",
        entity_id: created.user.id,
        description: `สร้างบัญชีผู้ใช้ “${fullName}”`,
        metadata: {
          target_email: email,
          department,
          phone,
        },
      });

    if (activityLogError && activityLogError.code !== "42P01") {
      console.error("Failed to write activity log", activityLogError);
    }

    return jsonResponse({ profile }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาด";
    return jsonResponse({ error: message }, 500);
  }
});
