import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { UserProfile } from "../types/profile";

interface ChangePasswordDialogProps {
  user: UserProfile;
  isSaving: boolean;
  errorMessage: string;
  onClose: () => void;
  onSubmit: (userId: string, password: string) => Promise<void>;
}

export default function ChangePasswordDialog({ user, isSaving, errorMessage, onClose, onSubmit }: ChangePasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSaving, onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    if (password.length < 8) return setLocalError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
    if (password !== confirmPassword) return setLocalError("รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน");
    await onSubmit(user.id, password);
  }

  return createPortal(
    <div className="um-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) onClose(); }}>
      <section className="um-dialog" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
        <header className="um-dialog-header">
          <span className="um-dialog-avatar">🔒</span>
          <div><span>ACCOUNT SECURITY</span><h2 id="change-password-title">เปลี่ยนรหัสผ่าน</h2><p>{user.fullName} · {user.email}</p></div>
          <button className="um-dialog-close" type="button" onClick={onClose} disabled={isSaving} aria-label="ปิด">×</button>
        </header>
        <form className="um-dialog-form" onSubmit={handleSubmit}>
          <label className="um-field"><span>รหัสผ่านใหม่ <b>*</b></span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></label>
          <label className="um-field"><span>ยืนยันรหัสผ่านใหม่ <b>*</b></span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></label>
          <p className="um-user-phone">รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร</p>
          {(localError || errorMessage) && <div className="um-dialog-error" role="alert"><span>!</span><p>{localError || errorMessage}</p></div>}
          <footer className="um-dialog-footer"><div><button className="um-button" type="button" onClick={onClose} disabled={isSaving}>ยกเลิก</button><button className="um-button um-button-primary" type="submit" disabled={isSaving}>{isSaving ? "กำลังบันทึก…" : "บันทึกรหัสผ่าน"}</button></div></footer>
        </form>
      </section>
    </div>, document.body,
  );
}
