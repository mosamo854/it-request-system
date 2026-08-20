import { FormEvent, useEffect, useMemo, useState } from "react";
import { createDepartment } from "../services/departmentService";
import {
  createManagedUser,
  getProfiles,
  updateManagedUser,
} from "../services/profileService";
import type { Department } from "../types/department";
import type {
  CreateManagedUserInput,
  UpdateManagedUserInput,
  UserProfile,
} from "../types/profile";

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
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");

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

  function openEditUser(user: UserProfile) {
    if (user.role !== "user") return;
    setEditError("");
    setEditSuccess("");
    setEditingUser(user);
  }

  function closeEditUser() {
    if (isUpdatingUser) return;
    setEditingUser(null);
    setEditError("");
  }

  async function handleUpdateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    setEditError("");
    setEditSuccess("");

    if (password !== confirmPassword) {
      setEditError("รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    const input: UpdateManagedUserInput = {
      userId: editingUser.id,
      fullName: String(form.get("fullName") ?? ""),
      email: String(form.get("email") ?? ""),
      department: String(form.get("department") ?? ""),
      phone: String(form.get("phone") ?? ""),
      ...(password ? { password } : {}),
    };

    setIsUpdatingUser(true);
    try {
      await updateManagedUser(input);
      await loadUsers();
      setEditingUser(null);
      setEditSuccess(`บันทึกข้อมูล ${input.fullName.trim()} สำเร็จแล้ว`);
    } catch (error) {
      setEditError(getErrorMessage(error));
    } finally {
      setIsUpdatingUser(false);
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

          {editSuccess && (
            <p className="notice success-notice user-edit-success">
              {editSuccess} หากเปลี่ยนอีเมล ผู้ใช้ต้องใช้อีเมลใหม่ในการ Login ครั้งถัดไป
            </p>
          )}

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
                <span className="user-edit-action">
                  {user.role === "user" ? (
                    <button
                      className="edit-user-button"
                      type="button"
                      onClick={() => openEditUser(user)}
                    >
                      ✎ แก้ไข
                    </button>
                  ) : (
                    <small title="บัญชี Admin แก้ไขจากหน้านี้ไม่ได้">—</small>
                  )}
                </span>
              </article>
            ))}

            {isLoading && <div className="user-list-loading">กำลังโหลดผู้ใช้งาน…</div>}
            {!isLoading && filteredUsers.length === 0 && (
              <div className="empty-state"><h3>ไม่พบผู้ใช้งาน</h3></div>
            )}
          </div>
        </article>
      </section>

      {editingUser && (
        <div
          className="user-edit-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditUser();
          }}
        >
          <article
            className="user-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-user-title"
          >
            <header className="user-edit-modal-heading">
              <div>
                <span className="eyebrow">Edit user account</span>
                <h2 id="edit-user-title">แก้ไขข้อมูลผู้ใช้</h2>
                <p>แก้ไขบัญชี {editingUser.email}</p>
              </div>
              <button
                type="button"
                aria-label="ปิดหน้าต่างแก้ไขผู้ใช้"
                onClick={closeEditUser}
                disabled={isUpdatingUser}
              >
                ×
              </button>
            </header>

            <form key={editingUser.id} onSubmit={handleUpdateUser}>
              <label>
                <span>ชื่อ–นามสกุล *</span>
                <input
                  name="fullName"
                  defaultValue={editingUser.fullName}
                  required
                  minLength={2}
                  maxLength={120}
                />
              </label>
              <label>
                <span>อีเมล *</span>
                <input
                  name="email"
                  type="email"
                  defaultValue={editingUser.email}
                  required
                />
              </label>
              <label>
                <span>เบอร์โทร *</span>
                <input
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  defaultValue={editingUser.phone ?? ""}
                  placeholder="0812345678"
                  required
                  minLength={9}
                  maxLength={20}
                />
                <small>รองรับ 0812345678 หรือ +66812345678</small>
              </label>
              <label>
                <span>แผนก *</span>
                <select
                  name="department"
                  required
                  defaultValue={editingUser.department ?? ""}
                >
                  <option value="" disabled>เลือกแผนก</option>
                  {userDepartments.map((department) => (
                    <option key={department.id} value={department.name}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="user-edit-password-note">
                เว้นช่องรหัสผ่านไว้ หากไม่ต้องการเปลี่ยนรหัสผ่านของผู้ใช้
              </div>
              <label>
                <span>รหัสผ่านใหม่</span>
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                />
              </label>
              <label>
                <span>ยืนยันรหัสผ่านใหม่</span>
                <input
                  name="confirmPassword"
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                />
              </label>

              {editError && (
                <p className="notice error-notice user-edit-form-notice">
                  {editError}
                </p>
              )}

              <div className="user-edit-form-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={closeEditUser}
                  disabled={isUpdatingUser}
                >
                  ยกเลิก
                </button>
                <button className="primary-button" disabled={isUpdatingUser}>
                  {isUpdatingUser ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}
                </button>
              </div>
            </form>
          </article>
        </div>
      )}
    </section>
  );
}
