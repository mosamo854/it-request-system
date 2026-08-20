import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabase";

function getLoginErrorMessage(message: string) {
  if (message === "Invalid login credentials") {
    return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  }
  if (message.includes("Email not confirmed")) {
    return "บัญชีนี้ยังไม่ได้ยืนยันอีเมล กรุณาติดต่อผู้ดูแลระบบ";
  }
  return message || "เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง";
}

export default function LoginPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");

    setErrorMessage("");
    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) setErrorMessage(getLoginErrorMessage(error.message));
    setIsSubmitting(false);
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <a className="login-brand" href="/" aria-label="IT Desk">
          <span className="brand-mark">IT</span>
          <span>
            <strong>IT Desk</strong>
            <small>Request Center</small>
          </span>
        </a>

        <div className="login-brand-copy">
          <span className="live-pill">
            <i /> IT Support พร้อมให้บริการ
          </span>
          <h1>
            ทุกปัญหา IT
            <br />
            เริ่มแก้ได้จากที่นี่
          </h1>
          <p>
            ส่งคำขอ ติดตามความคืบหน้า และรับความช่วยเหลือจากทีม IT
            ผ่านระบบกลางขององค์กร
          </p>
        </div>

        <div className="login-illustration" aria-hidden="true">
          <div className="login-orbit orbit-large" />
          <div className="login-orbit orbit-small" />
          <div className="login-monitor">
            <div className="login-monitor-screen">
              <span />
              <span />
              <span />
              <b>✓</b>
            </div>
            <i />
          </div>
        </div>

        <small className="login-copyright">© 2026 IT Desk · Internal use only</small>
      </section>

      <section className="login-form-panel">
        <div className="login-form-wrap">
          <div className="login-mobile-logo">
            <span className="brand-mark">IT</span>
            <strong>IT Desk</strong>
          </div>

          <span className="eyebrow">ยินดีต้อนรับกลับ</span>
          <h2>เข้าสู่ระบบ</h2>
          <p className="login-subtitle">
            ใช้อีเมลและรหัสผ่านที่ผู้ดูแลฝ่าย IT สร้างให้
          </p>

          <form className="login-form" onSubmit={handleLogin}>
            <label>
              <span>อีเมล</span>
              <div className="login-input">
                <i aria-hidden="true">@</i>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="name@company.co.th"
                />
              </div>
            </label>

            <label>
              <span>รหัสผ่าน</span>
              <div className="login-input">
                <i aria-hidden="true">●</i>
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  minLength={6}
                  placeholder="กรอกรหัสผ่าน"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                >
                  {showPassword ? "ซ่อน" : "แสดง"}
                </button>
              </div>
            </label>

            {errorMessage && (
              <p className="notice error-notice" role="alert">
                {errorMessage}
              </p>
            )}

            <button
              className="login-submit"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
              {!isSubmitting && <span>→</span>}
            </button>
          </form>

          <div className="admin-register-note">
            <span>i</span>
            <p>
              <strong>ยังไม่มีบัญชี?</strong>
              ติดต่อผู้ดูแลฝ่าย IT เพื่อสร้างบัญชีให้ในระบบ
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
