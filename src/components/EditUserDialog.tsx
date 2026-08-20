import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Department } from "../types/department";
import type { UpdateManagedUserInput, UserProfile } from "../types/profile";

interface EditUserDialogProps {
  user: UserProfile;
  departments: Department[];
  isSaving: boolean;
  errorMessage: string;
  onClose: () => void;
  onSubmit: (input: UpdateManagedUserInput) => Promise<void>;
}

export default function EditUserDialog({
  user,
  departments,
  isSaving,
  errorMessage,
  onClose,
  onSubmit,
}: EditUserDialogProps) {
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [department, setDepartment] = useState(user.department ?? "");
  const [shouldResetPassword, setShouldResetPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSaving, onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");

    if (shouldResetPassword && password.length < 8) {
      setLocalError("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (shouldResetPassword && password !== confirmPassword) {
      setLocalError("รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    await onSubmit({
      userId: user.id,
      fullName,
      email,
      phone,
      department,
      ...(shouldResetPassword ? { password } : {}),
    });
  }

  return createPortal(
    <div
      className="um-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <section
        className="um-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="um-dialog-title"
      >
        <header className="um-dialog-header">
          <div className="um-dialog-avatar" aria-hidden="true">
            {user.fullName.trim().charAt(0).toUpperCase() || "U"}
          </div>
          <div>
            <span>USER ACCOUNT</span>
            <h2 id="um-dialog-title">แก้ไขข้อมูลผู้ใช้</h2>
            <p>{user.email}</p>
          </div>
          <button
            className="um-dialog-close"
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="ปิดหน้าต่างแก้ไขข้อมูลผู้ใช้"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <form className="um-dialog-form" onSubmit={handleSubmit}>
          <div className="um-dialog-section-title">
            <strong>ข้อมูลบัญชี</strong>
            <span>ข้อมูลนี้จะแสดงในคำขอและห้องแชต</span>
          </div>

          <label className="um-field">
            <span>ชื่อ–นามสกุล <b>*</b></span>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
              minLength={2}
              maxLength={120}
              autoFocus
            />
          </label>

          <label className="um-field">
            <span>อีเมล <b>*</b></span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
            />
          </label>

          <label className="um-field">
            <span>เบอร์โทร <b>*</b></span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              type="tel"
              inputMode="tel"
              placeholder="0812345678"
              required
              minLength={9}
              maxLength={20}
            />
            <small>ใช้รูปแบบ 0812345678 หรือ +66812345678</small>
          </label>

          <label className="um-field">
            <span>แผนก <b>*</b></span>
            <select
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              required
            >
              <option value="" disabled>เลือกแผนก</option>
              {departments.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <div className="um-password-panel">
            <label className="um-password-toggle">
              <span>
                <strong>ตั้งรหัสผ่านใหม่</strong>
                <small>เปิดตัวเลือกนี้เมื่อต้องการรีเซ็ตรหัสผ่านให้ผู้ใช้</small>
              </span>
              <input
                type="checkbox"
                checked={shouldResetPassword}
                onChange={(event) => {
                  setShouldResetPassword(event.target.checked);
                  setPassword("");
                  setConfirmPassword("");
                  setLocalError("");
                }}
              />
              <i aria-hidden="true" />
            </label>

            {shouldResetPassword && (
              <div className="um-password-fields">
                <label className="um-field">
                  <span>รหัสผ่านใหม่ <b>*</b></span>
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </label>
                <label className="um-field">
                  <span>ยืนยันรหัสผ่านใหม่ <b>*</b></span>
                  <input
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </label>
              </div>
            )}
          </div>

          {(localError || errorMessage) && (
            <div className="um-dialog-error" role="alert">
              <span aria-hidden="true">!</span>
              <p>{localError || errorMessage}</p>
            </div>
          )}

          <div className="um-dialog-footer">
            <p>หากเปลี่ยนอีเมล ผู้ใช้ต้องใช้อีเมลใหม่ในการเข้าสู่ระบบครั้งถัดไป</p>
            <div>
              <button
                className="um-button um-button-secondary"
                type="button"
                onClick={onClose}
                disabled={isSaving}
              >
                ยกเลิก
              </button>
              <button
                className="um-button um-button-primary"
                type="submit"
                disabled={isSaving}
              >
                {isSaving && <i className="um-button-spinner" aria-hidden="true" />}
                {isSaving ? "กำลังบันทึก" : "บันทึกการแก้ไข"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
