import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type {
  AdminPermission,
  ManageAdminAccessInput,
  UserProfile,
} from "../types/profile";

interface AdminAccessDialogProps {
  user: UserProfile;
  isSaving: boolean;
  errorMessage: string;
  onClose: () => void;
  onSubmit: (input: ManageAdminAccessInput) => Promise<void>;
}

const permissionGroups: Array<{
  title: string;
  description: string;
  permissions: Array<[AdminPermission, string]>;
}> = [
  {
    title: "คำขอของแผนก",
    description: "ควบคุมการดูและดำเนินการกับคำขอปัจจุบัน",
    permissions: [
      ["requests.view", "ดูคำขอที่ส่งมายังแผนกของ Admin และเปิดแชต"],
      ["requests.update", "แก้ไขและเปลี่ยนสถานะคำขอ"],
      ["requests.archive", "ลบคำขอที่เสร็จแล้วไปคลังสำรอง"],
    ],
  },
  {
    title: "คลังสำรอง",
    description: "แยกสิทธิ์ดู กู้คืน และลบถาวรออกจากกัน",
    permissions: [
      ["archive.view", "ดูรายการในคลังสำรอง"],
      ["archive.restore", "กู้คืนคำขอ"],
      ["archive.delete", "ลบคำขอ แชต และรูปภาพถาวร"],
    ],
  },
  {
    title: "รายงานและประวัติ",
    description: "จำกัดข้อมูลเชิงสถิติและ Audit Trail",
    permissions: [
      ["statistics.view", "ดูหน้าสถิติ"],
      ["statistics.export", "Export รายงาน CSV"],
      ["activity.view", "ดูประวัติการดำเนินการ"],
      ["activity.export", "Export ประวัติ CSV"],
    ],
  },
  {
    title: "ผู้ใช้และแผนก",
    description: "เหมาะสำหรับ Admin HR หรือผู้ดูแลบัญชีพนักงาน",
    permissions: [
      ["users.view", "ดูรายชื่อผู้ใช้งาน"],
      ["users.create", "สร้างบัญชี User"],
      ["users.update", "แก้ไขข้อมูลและรีเซ็ตรหัสผ่าน User"],
      ["departments.create", "เพิ่มแผนกใหม่"],
    ],
  },
];

const permissionDependencies: Partial<Record<AdminPermission, AdminPermission>> = {
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

export default function AdminAccessDialog({
  user,
  isSaving,
  errorMessage,
  onClose,
  onSubmit,
}: AdminAccessDialogProps) {
  const [role, setRole] = useState<"admin" | "user">(
    user.role === "admin" ? "admin" : "user",
  );
  const [permissions, setPermissions] = useState<AdminPermission[]>(
    user.permissions,
  );

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

  function togglePermission(permission: AdminPermission) {
    setPermissions((current) => {
      if (current.includes(permission)) {
        return current.filter(
          (item) =>
            item !== permission && permissionDependencies[item] !== permission,
        );
      }

      const dependency = permissionDependencies[permission];
      return [...new Set([...current, permission, ...(dependency ? [dependency] : [])])];
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      userId: user.id,
      role,
      permissions: role === "admin" ? permissions : [],
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
        className="um-dialog admin-access-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-access-title"
      >
        <header className="um-dialog-header admin-access-header">
          <div className="um-dialog-avatar" aria-hidden="true">A</div>
          <div>
            <span>SUPER ADMIN CONTROL</span>
            <h2 id="admin-access-title">กำหนดบทบาทและสิทธิ์</h2>
            <p>{user.fullName} · {user.email}</p>
          </div>
          <button
            className="um-dialog-close"
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="ปิดหน้าต่างกำหนดสิทธิ์"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <form className="admin-access-form" onSubmit={handleSubmit}>
          <div className="admin-role-selector">
            <button
              className={role === "user" ? "selected" : ""}
              type="button"
              onClick={() => setRole("user")}
            >
              <strong>User</strong>
              <span>ส่งและติดตามคำขอของตนเอง</span>
            </button>
            <button
              className={role === "admin" ? "selected" : ""}
              type="button"
              onClick={() => setRole("admin")}
            >
              <strong>Admin</strong>
              <span>เข้าถึงเฉพาะฟังก์ชันที่เลือกด้านล่าง</span>
            </button>
          </div>

          {role === "admin" && (
            <div className="permission-groups">
              {permissionGroups.map((group) => (
                <fieldset className="permission-group" key={group.title}>
                  <legend>{group.title}</legend>
                  <p>{group.description}</p>
                  <div>
                    {group.permissions.map(([permission, label]) => (
                      <label key={permission}>
                        <input
                          type="checkbox"
                          checked={permissions.includes(permission)}
                          onChange={() => togglePermission(permission)}
                        />
                        <span>
                          <strong>{label}</strong>
                          <small>{permission}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          )}

          {role === "user" && user.role === "admin" && (
            <div className="admin-demotion-warning">
              บัญชีนี้จะถูกลดสิทธิ์เป็น User และสิทธิ์ Admin เดิมจะถูกล้างทั้งหมด
            </div>
          )}

          {errorMessage && (
            <div className="um-dialog-error" role="alert">
              <span aria-hidden="true">!</span>
              <p>{errorMessage}</p>
            </div>
          )}

          <div className="um-dialog-footer admin-access-footer">
            <p>ระบบบันทึกการเปลี่ยนสิทธิ์ไว้ในประวัติการดำเนินการทุกครั้ง</p>
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
                {isSaving ? "กำลังบันทึก" : "บันทึกสิทธิ์"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
