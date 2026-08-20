import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ExistingProfile {
  id: string;
  email: string;
  full_name: string;
  department: string | null;
  phone: string | null;
  role: "admin" | "user";
}

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
    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (callerProfileError || callerProfile?.role !== "admin") {
      return jsonResponse({ error: "เฉพาะผู้ดูแลฝ่าย IT เท่านั้น" }, 403);
    }

    const payload = await request.json();
    const userId = String(payload.userId ?? "").trim();
    const fullName = String(payload.fullName ?? "").trim();
    const email = String(payload.email ?? "").trim().toLowerCase();
    const password = String(payload.password ?? "");
    const department = String(payload.department ?? "").trim();
    const phone = normalizeThaiPhone(String(payload.phone ?? "").trim());

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return jsonResponse({ error: "รหัสผู้ใช้ไม่ถูกต้อง" }, 400);
    }
    if (fullName.length < 2 || fullName.length > 120) {
      return jsonResponse({ error: "ชื่อผู้ใช้ต้องมี 2–120 ตัวอักษร" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "รูปแบบอีเมลไม่ถูกต้อง" }, 400);
    }
    if (password && password.length < 8) {
      return jsonResponse({ error: "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร" }, 400);
    }
    if (!phone) {
      return jsonResponse(
        { error: "กรุณากรอกเบอร์โทรไทย เช่น 0812345678 หรือ +66812345678" },
        400,
      );
    }

    const { data: existingProfile, error: targetProfileError } =
      await adminClient
        .from("profiles")
        .select("id, email, full_name, department, phone, role")
        .eq("id", userId)
        .single();

    if (targetProfileError || !existingProfile) {
      return jsonResponse({ error: "ไม่พบบัญชีผู้ใช้นี้" }, 404);
    }
    if ((existingProfile as ExistingProfile).role !== "user") {
      return jsonResponse(
        { error: "ระบบอนุญาตให้แก้ไขเฉพาะบัญชี User เท่านั้น" },
        403,
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

    const { data: targetAuthData, error: targetAuthError } =
      await adminClient.auth.admin.getUserById(userId);

    if (targetAuthError || !targetAuthData.user) {
      return jsonResponse({ error: "ไม่พบบัญชี Auth ของผู้ใช้นี้" }, 404);
    }

    const oldProfile = existingProfile as ExistingProfile;
    const { data: updatedProfile, error: updateProfileError } = await adminClient
      .from("profiles")
      .update({
        email,
        full_name: fullName,
        department,
        phone,
      })
      .eq("id", userId)
      .eq("role", "user")
      .select("id, email, full_name, department, phone, role, created_at")
      .single();

    if (updateProfileError || !updatedProfile) {
      return jsonResponse(
        { error: updateProfileError?.message ?? "แก้ไขข้อมูลผู้ใช้ไม่สำเร็จ" },
        400,
      );
    }

    const authAttributes: {
      email: string;
      email_confirm: boolean;
      password?: string;
      user_metadata: Record<string, unknown>;
    } = {
      email,
      email_confirm: true,
      user_metadata: {
        ...(targetAuthData.user.user_metadata ?? {}),
        full_name: fullName,
        department,
        phone,
      },
    };
    if (password) authAttributes.password = password;

    const { error: updateAuthError } =
      await adminClient.auth.admin.updateUserById(userId, authAttributes);

    if (updateAuthError) {
      const { error: rollbackError } = await adminClient
        .from("profiles")
        .update({
          email: oldProfile.email,
          full_name: oldProfile.full_name,
          department: oldProfile.department,
          phone: oldProfile.phone,
        })
        .eq("id", userId);

      if (rollbackError) {
        return jsonResponse(
          {
            error:
              "แก้ไขบัญชี Auth ไม่สำเร็จและคืนค่า Profile ไม่สำเร็จ กรุณาตรวจสอบข้อมูลใน Supabase",
          },
          500,
        );
      }
      return jsonResponse({ error: updateAuthError.message }, 400);
    }

    return jsonResponse({ profile: updatedProfile }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาด";
    return jsonResponse({ error: message }, 500);
  }
});
