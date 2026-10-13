import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");
    if (!url || !anonKey || !serviceRoleKey || !authorization) return jsonResponse({ error: "Unauthorized" }, 401);

    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const token = authorization.replace(/^Bearer\s+/i, "");
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser(token);
    if (authError || !caller) return jsonResponse({ error: "กรุณาเข้าสู่ระบบใหม่" }, 401);

    const adminClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: actor, error: actorError } = await adminClient.from("profiles").select("id, role, permissions, full_name, email").eq("id", caller.id).single();
    if (actorError || !actor) return jsonResponse({ error: "ไม่พบข้อมูลผู้ดูแลระบบ" }, 403);

    const payload = await request.json();
    const userId = String(payload.userId ?? "").trim();
    const password = String(payload.password ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return jsonResponse({ error: "รหัสผู้ใช้ไม่ถูกต้อง" }, 400);
    if (password.length < 8 || password.length > 128) return jsonResponse({ error: "รหัสผ่านต้องมี 8–128 ตัวอักษร" }, 400);

    const { data: target, error: targetError } = await adminClient.from("profiles").select("id, role, email, full_name, department").eq("id", userId).single();
    if (targetError || !target) return jsonResponse({ error: "ไม่พบบัญชีผู้ใช้นี้" }, 404);

    const selfChange = target.id === actor.id;
    const allowed = selfChange || (actor.role === "super_admin" && target.role !== "super_admin") || (actor.role === "admin" && target.role === "user" && (actor.permissions ?? []).includes("users.update"));
    if (!allowed) return jsonResponse({ error: "บัญชีนี้ไม่มีสิทธิ์เปลี่ยนรหัสผ่านของผู้ใช้เป้าหมาย" }, 403);

    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, { password });
    if (updateError) return jsonResponse({ error: updateError.message }, 400);

    const { error: logError } = await adminClient.from("activity_logs").insert({
      actor_id: actor.id,
      actor_name: actor.full_name,
      actor_email: actor.email,
      action: "password_changed",
      entity_type: "user",
      entity_id: userId,
      target_department: target.department,
      description: `เปลี่ยนรหัสผ่านบัญชี “${target.full_name}”`,
      metadata: { target_email: target.email },
    });
    if (logError && logError.code !== "42P01") console.error("Failed to write activity log", logError);
    return jsonResponse({ success: true });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" }, 500);
  }
});
