import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const allowedDepartments = new Set([
  "ฝ่ายขาย",
  "ฝ่ายบุคคล",
  "ฝ่ายบัญชี",
  "ฝ่ายปฏิบัติการ",
]);

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
      .select("role")
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

    if (fullName.length < 2 || fullName.length > 120) {
      return jsonResponse({ error: "ชื่อผู้ใช้ต้องมี 2–120 ตัวอักษร" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "รูปแบบอีเมลไม่ถูกต้อง" }, 400);
    }
    if (password.length < 8) {
      return jsonResponse({ error: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" }, 400);
    }
    if (!allowedDepartments.has(department)) {
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
      role: "user",
    };
    const { error: saveProfileError } = await adminClient
      .from("profiles")
      .upsert(profile, { onConflict: "id" });

    if (saveProfileError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return jsonResponse({ error: saveProfileError.message }, 500);
    }

    return jsonResponse({ profile }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาด";
    return jsonResponse({ error: message }, 500);
  }
});
