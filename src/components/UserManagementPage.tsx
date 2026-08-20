import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createManagedUser,
  getProfiles,
} from "../services/profileService";
import type { CreateManagedUserInput, UserProfile } from "../types/profile";

interface UserManagementPageProps {
  currentProfile: UserProfile;
}

const departments = [
  "ฝ่ายขาย",
  "ฝ่ายบุคคล",
  "ฝ่ายบัญชี",
  "ฝ่ายปฏิบัติการ",
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function UserManagementPage({
  currentProfile,
}: UserManagementPageProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function loadUsers() {
    setIsLoading(true);
    setErrorMessage("");
    try {
      setUsers(await getProfiles());
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return users.filter((user) =>
      !normalized
        ? true
        : [user.fullName, user.email, user.department, user.role]
            .join(" ")
            .toLowerCase()
            .includes(normalized),
    );
  }, [query, users]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    setErrorMessage("");
    setSuccessMessage("");

    if (password !== confirmPassword) {
      setErrorMessage("รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    const input: CreateManagedUserInput = {
      fullName: String(form.get("fullName") ?? ""),
      email: String(form.get("email") ?? ""),
      department: String(form.get("department") ?? ""),
      password,
    };

    setIsCreating(true);
    try {
      await createManagedUser(input);
      setSuccessMessage(`สร้างบัญชี ${input.email.trim().toLowerCase()} สำเร็จแล้ว`);
      formElement.reset();
      await loadUsers();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  }

  const normalUsers = users.filter((user) => user.role === "user").length;
  const admins = users.filter((user) => user.role === "admin").length;

  return (
    <section className="content subpage-content" id="users-top">
      <header className="subpage-header">
        <div className="mobile-brand">IT</div>
        <div>
          <span className="eyebrow">User Administration</span>
          <h1>จัดการผู้ใช้งาน</h1>
          <p>สร้างบัญชีให้พนักงานแต่ละแผนก โดยไม่เปิดหน้า Register สาธารณะ</p>
        </div>
        <span className="admin-role-pill">ผู้ดูแล: {currentProfile.fullName}</span>
      </header>

      <section className="user-summary-grid">
        <article><small>บัญชีทั้งหมด</small><strong>{users.length}</strong><span>บัญชี</span></article>
        <article><small>ผู้ใช้งานทั่วไป</small><strong>{normalUsers}</strong><span>บัญชี</span></article>
        <article><small>ผู้ดูแลฝ่าย IT</small><strong>{admins}</strong><span>บัญชี</span></article>
      </section>

      <section className="user-management-layout">
        <article className="user-form-card">
          <div className="analytics-card-heading">
            <div>
              <span className="eyebrow">Create account</span>
              <h2>เพิ่มผู้ใช้ใหม่</h2>
            </div>
          </div>
          <p className="user-form-note">
            บัญชีที่สร้างจะเป็นสิทธิ์ User และยืนยันอีเมลให้อัตโนมัติ
          </p>

          <form onSubmit={handleCreateUser}>
            <label>
              <span>ชื่อ–นามสกุล *</span>
              <input name="fullName" required minLength={2} maxLength={120} />
            </label>
            <label>
              <span>อีเมล *</span>
              <input name="email" type="email" required />
            </label>
            <label>
              <span>แผนก *</span>
              <select name="department" required defaultValue="">
                <option value="" disabled>เลือกแผนก</option>
                {departments.map((department) => (
                  <option key={department}>{department}</option>
                ))}
              </select>
            </label>
            <label>
              <span>รหัสผ่านเริ่มต้น *</span>
              <input name="password" type="password" required minLength={8} />
            </label>
            <label>
              <span>ยืนยันรหัสผ่าน *</span>
              <input name="confirmPassword" type="password" required minLength={8} />
            </label>

            {errorMessage && <p className="notice error-notice">{errorMessage}</p>}
            {successMessage && <p className="notice success-notice">{successMessage}</p>}

            <button className="primary-button create-user-button" disabled={isCreating}>
              {isCreating ? "กำลังสร้างบัญชี…" : "＋ สร้างบัญชี User"}
            </button>
          </form>
        </article>

        <article className="user-list-card">
          <div className="user-list-heading">
            <div>
              <span className="eyebrow">Directory</span>
              <h2>รายชื่อผู้ใช้งาน</h2>
            </div>
            <label className="search-box">
              <span>⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหาชื่อ อีเมล หรือแผนก"
              />
            </label>
          </div>

          <div className="user-list">
            {filteredUsers.map((user) => (
              <article key={user.id}>
                <span className={`avatar ${user.role === "admin" ? "admin-avatar" : ""}`}>
                  {user.fullName.charAt(0)}
                </span>
                <span>
                  <strong>{user.fullName}</strong>
                  <small>{user.email}</small>
                </span>
                <span className="user-department">{user.department ?? "ยังไม่ระบุแผนก"}</span>
                <span className={`role-badge role-${user.role}`}>
                  {user.role === "admin" ? "Admin · IT" : "User"}
                </span>
                <time>{formatDate(user.createdAt)}</time>
              </article>
            ))}

            {isLoading && <div className="user-list-loading">กำลังโหลดผู้ใช้งาน…</div>}
            {!isLoading && filteredUsers.length === 0 && (
              <div className="empty-state"><h3>ไม่พบผู้ใช้งาน</h3></div>
            )}
          </div>
        </article>
      </section>
    </section>
  );
}
