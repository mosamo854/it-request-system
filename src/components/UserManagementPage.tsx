import { FormEvent, useEffect, useMemo, useState } from "react";
import { createDepartment } from "../services/departmentService";
import {
  createManagedUser,
  getProfiles,
} from "../services/profileService";
import type { Department } from "../types/department";
import type { CreateManagedUserInput, UserProfile } from "../types/profile";

interface UserManagementPageProps {
  currentProfile: UserProfile;
  departments: Department[];
  onDepartmentCreated: (department: Department) => void;
}

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

function formatPhone(value: string | null) {
  if (!value) return "ยังไม่ระบุเบอร์โทร";
  if (!/^\+66[0-9]{8,9}$/.test(value)) return value;

  const localNumber = `0${value.slice(3)}`;
  if (localNumber.length === 10) {
    return localNumber.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3");
  }
  return localNumber.replace(/^(\d{2})(\d{3})(\d{4})$/, "$1-$2-$3");
}

export default function UserManagementPage({
  currentProfile,
  departments,
  onDepartmentCreated,
}: UserManagementPageProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [isCreatingDepartment, setIsCreatingDepartment] = useState(false);
  const [departmentError, setDepartmentError] = useState("");
  const [departmentSuccess, setDepartmentSuccess] = useState("");

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
        : [user.fullName, user.email, user.phone, user.department, user.role]
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
      phone: String(form.get("phone") ?? ""),
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

  async function handleCreateDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDepartmentError("");
    setDepartmentSuccess("");
    setIsCreatingDepartment(true);

    try {
      const department = await createDepartment(departmentName);
      onDepartmentCreated(department);
      setDepartmentName("");
      setDepartmentSuccess(`เพิ่มแผนก ${department.name} สำเร็จแล้ว`);
    } catch (error) {
      setDepartmentError(getErrorMessage(error));
    } finally {
      setIsCreatingDepartment(false);
    }
  }

  const normalUsers = users.filter((user) => user.role === "user").length;
  const admins = users.filter((user) => user.role === "admin").length;
  const userDepartments = departments.filter(
    (department) => department.name !== "ฝ่าย IT",
  );

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
        <article><small>แผนกทั้งหมด</small><strong>{departments.length}</strong><span>แผนก</span></article>
      </section>

      <section className="department-management-card">
        <div>
          <span className="eyebrow">Department directory</span>
          <h2>จัดการแผนก</h2>
          <p>แผนกที่เพิ่มใหม่จะปรากฏในฟอร์มสร้าง User และตัวกรองคำขอทันที</p>
        </div>
        <form onSubmit={handleCreateDepartment}>
          <label>
            <span>ชื่อแผนกใหม่</span>
            <input
              value={departmentName}
              onChange={(event) => setDepartmentName(event.target.value)}
              placeholder="เช่น ฝ่ายการตลาด"
              required
              minLength={2}
              maxLength={80}
            />
          </label>
          <button className="primary-button" disabled={isCreatingDepartment}>
            {isCreatingDepartment ? "กำลังเพิ่ม…" : "＋ เพิ่มแผนก"}
          </button>
        </form>
        <div className="department-chip-list" aria-label="รายชื่อแผนก">
          {departments.map((department) => (
            <span key={department.id}>{department.name}</span>
          ))}
        </div>
        {departmentError && (
          <p className="notice error-notice">{departmentError}</p>
        )}
        {departmentSuccess && (
          <p className="notice success-notice">{departmentSuccess}</p>
        )}
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
              <span>เบอร์โทร *</span>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                placeholder="0812345678"
                required
                minLength={9}
                maxLength={20}
              />
              <small>รองรับ 0812345678 หรือ +66812345678</small>
            </label>
            <label>
              <span>แผนก *</span>
              <select name="department" required defaultValue="">
                <option value="" disabled>เลือกแผนก</option>
                {userDepartments.map((department) => (
                  <option key={department.id} value={department.name}>
                    {department.name}
                  </option>
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

            <button
              className="primary-button create-user-button"
              disabled={isCreating || userDepartments.length === 0}
            >
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
                placeholder="ค้นหาชื่อ อีเมล เบอร์โทร หรือแผนก"
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
                  <small className="user-phone">☎ {formatPhone(user.phone)}</small>
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
