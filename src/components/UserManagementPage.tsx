import { FormEvent, useEffect, useMemo, useState } from "react";
import { createDepartment } from "../services/departmentService";
import {
  createManagedUser,
  getProfiles,
  manageAdminAccess,
  updateManagedUser,
} from "../services/profileService";
import type { Department } from "../types/department";
import type {
  CreateManagedUserInput,
  ManageAdminAccessInput,
  UpdateManagedUserInput,
  UserProfile,
} from "../types/profile";
import { hasPermission } from "../types/profile";
import AdminAccessDialog from "./AdminAccessDialog";
import EditUserDialog from "./EditUserDialog";

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
  const [accessUser, setAccessUser] = useState<UserProfile | null>(null);
  const [isSavingAccess, setIsSavingAccess] = useState(false);
  const [accessError, setAccessError] = useState("");

  const isSuperAdmin = currentProfile.role === "super_admin";
  const canCreateUsers = hasPermission(currentProfile, "users.create");
  const canUpdateUsers = hasPermission(currentProfile, "users.update");
  const canCreateDepartments = hasPermission(
    currentProfile,
    "departments.create",
  );

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
    if (!canCreateUsers) return;
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
    if (!canCreateDepartments) return;
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
    if (user.role !== "user" || !canUpdateUsers) return;
    setEditError("");
    setEditSuccess("");
    setEditingUser(user);
  }

  function closeEditUser() {
    if (isUpdatingUser) return;
    setEditingUser(null);
    setEditError("");
  }

  async function handleUpdateUser(input: UpdateManagedUserInput) {
    setEditError("");
    setEditSuccess("");

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

  function openAccessDialog(user: UserProfile) {
    if (
      !isSuperAdmin ||
      user.id === currentProfile.id ||
      user.role === "super_admin"
    ) {
      return;
    }
    setAccessError("");
    setAccessUser(user);
  }

  function closeAccessDialog() {
    if (isSavingAccess) return;
    setAccessUser(null);
    setAccessError("");
  }

  async function handleManageAccess(input: ManageAdminAccessInput) {
    setAccessError("");
    setIsSavingAccess(true);
    try {
      await manageAdminAccess(input);
      await loadUsers();
      setAccessUser(null);
      setEditSuccess("บันทึกบทบาทและสิทธิ์ของ Admin สำเร็จแล้ว");
    } catch (error) {
      setAccessError(getErrorMessage(error));
    } finally {
      setIsSavingAccess(false);
    }
  }

  const normalUsers = users.filter((user) => user.role === "user").length;
  const admins = users.filter((user) => user.role === "admin").length;
  const superAdmins = users.filter(
    (user) => user.role === "super_admin",
  ).length;
  const userDepartments = departments;

  return (
    <section className="content subpage-content" id="users-top">
      <header className="subpage-header">
        <div className="mobile-brand">RC</div>
        <div>
          <span className="eyebrow">User Administration</span>
          <h1>จัดการผู้ใช้งาน</h1>
          <p>สร้างบัญชี แก้ไขข้อมูล และกำหนดสิทธิ์ตามหน้าที่</p>
        </div>
        <span className="admin-role-pill">
          {isSuperAdmin ? "Super Admin" : "Admin"}: {currentProfile.fullName}
        </span>
      </header>

      <section className="um-summary-grid" aria-label="สรุปบัญชีผู้ใช้งาน">
        <article className="um-summary-card um-summary-blue">
          <span className="um-summary-icon" aria-hidden="true">#</span>
          <div><small>บัญชีทั้งหมด</small><strong>{users.length}</strong><span>บัญชีในระบบ</span></div>
        </article>
        <article className="um-summary-card um-summary-green">
          <span className="um-summary-icon" aria-hidden="true">U</span>
          <div><small>ผู้ใช้งานทั่วไป</small><strong>{normalUsers}</strong><span>บัญชี User</span></div>
        </article>
        <article className="um-summary-card um-summary-purple">
          <span className="um-summary-icon" aria-hidden="true">AD</span>
          <div><small>ผู้ดูแลระบบ</small><strong>{admins + superAdmins}</strong><span>Admin {admins} · Super {superAdmins}</span></div>
        </article>
        <article className="um-summary-card um-summary-orange">
          <span className="um-summary-icon" aria-hidden="true">D</span>
          <div><small>แผนกทั้งหมด</small><strong>{departments.length}</strong><span>แผนกในระบบ</span></div>
        </article>
      </section>

      {canCreateDepartments && <section className="um-department-card">
        <header>
          <div className="um-section-icon" aria-hidden="true">D</div>
          <div>
            <span className="eyebrow">Department directory</span>
            <h2>จัดการแผนก</h2>
            <p>แผนกใหม่จะพร้อมใช้งานในฟอร์มสร้างและแก้ไขผู้ใช้ทันที</p>
          </div>
        </header>

        <form className="um-department-form" onSubmit={handleCreateDepartment}>
          <label className="um-field">
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
          <button className="um-button um-button-primary" disabled={isCreatingDepartment}>
            {isCreatingDepartment ? "กำลังเพิ่ม…" : "+ เพิ่มแผนก"}
          </button>
        </form>

        <div className="um-department-list" aria-label="รายชื่อแผนก">
          {departments.map((department) => (
            <span key={department.id}>{department.name}</span>
          ))}
        </div>

        {departmentError && <p className="notice error-notice">{departmentError}</p>}
        {departmentSuccess && <p className="notice success-notice">{departmentSuccess}</p>}
      </section>}

      <section className={canCreateUsers ? "um-management-layout" : "um-management-layout directory-only"}>
        {canCreateUsers && <article className="um-create-card">
          <header className="um-card-header">
            <div className="um-section-icon um-section-icon-green" aria-hidden="true">+</div>
            <div>
              <span className="eyebrow">Create account</span>
              <h2>เพิ่มผู้ใช้ใหม่</h2>
              <p>สร้างบัญชี User สำหรับพนักงาน</p>
            </div>
          </header>

          <div className="um-info-banner">
            <span aria-hidden="true">i</span>
            <p>ระบบจะยืนยันอีเมลให้อัตโนมัติ และผู้ใช้สามารถ Login ได้ทันที</p>
          </div>

          <form className="um-create-form" onSubmit={handleCreateUser}>
            <label className="um-field">
              <span>ชื่อ–นามสกุล <b>*</b></span>
              <input name="fullName" placeholder="ชื่อผู้ใช้งาน" required minLength={2} maxLength={120} />
            </label>
            <label className="um-field">
              <span>อีเมล <b>*</b></span>
              <input name="email" type="email" placeholder="name@company.com" required />
            </label>
            <label className="um-field">
              <span>เบอร์โทร <b>*</b></span>
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
            <label className="um-field">
              <span>แผนก <b>*</b></span>
              <select name="department" required defaultValue="">
                <option value="" disabled>เลือกแผนก</option>
                {userDepartments.map((department) => (
                  <option key={department.id} value={department.name}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="um-field">
              <span>รหัสผ่านเริ่มต้น <b>*</b></span>
              <input name="password" type="password" required minLength={8} autoComplete="new-password" />
            </label>
            <label className="um-field">
              <span>ยืนยันรหัสผ่าน <b>*</b></span>
              <input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" />
            </label>

            {errorMessage && <p className="notice error-notice">{errorMessage}</p>}
            {successMessage && <p className="notice success-notice">{successMessage}</p>}

            <button
              className="um-button um-button-primary um-create-button"
              disabled={isCreating || userDepartments.length === 0}
            >
              {isCreating ? "กำลังสร้างบัญชี…" : "+ สร้างบัญชี User"}
            </button>
          </form>
        </article>}

        <article className="um-directory-card">
          <header className="um-directory-header">
            <div>
              <span className="eyebrow">User directory</span>
              <h2>รายชื่อผู้ใช้งาน</h2>
              <p>พบ {filteredUsers.length} จาก {users.length} บัญชี</p>
            </div>
            <label className="um-search-box">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m16.5 16.5 4 4" />
              </svg>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหาชื่อ อีเมล เบอร์โทร หรือแผนก"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="ล้างคำค้นหา">×</button>
              )}
            </label>
          </header>

          {editSuccess && (
            <div className="um-action-success" role="status">
              <span aria-hidden="true">✓</span>
              <p>{editSuccess}</p>
              <button type="button" onClick={() => setEditSuccess("")} aria-label="ปิดข้อความ">×</button>
            </div>
          )}

          <div className="um-table-head" aria-hidden="true">
            <span>ผู้ใช้งาน</span>
            <span>แผนก</span>
            <span>สิทธิ์</span>
            <span>วันที่สร้าง</span>
            <span>จัดการ</span>
          </div>

          <div className="um-user-list">
            {filteredUsers.map((user) => (
              <article className="um-user-row" key={user.id}>
                <div className="um-user-identity">
                  <span className={`um-avatar ${user.role !== "user" ? "um-avatar-admin" : ""}`}>
                    {user.fullName.trim().charAt(0).toUpperCase() || "U"}
                  </span>
                  <div>
                    <strong>{user.fullName}</strong>
                    <small>{user.email}</small>
                    <small className="um-user-phone">โทร {formatPhone(user.phone)}</small>
                  </div>
                </div>

                <div className="um-user-department">
                  <small>แผนก</small>
                  <span>{user.department ?? "ยังไม่ระบุแผนก"}</span>
                </div>

                <div>
                  <span className={`um-role-badge um-role-${user.role}`}>
                    {user.role === "super_admin"
                      ? "Super Admin"
                      : user.role === "admin"
                        ? `Admin · ${user.permissions.length} สิทธิ์`
                        : "User"}
                  </span>
                </div>

                <time dateTime={user.createdAt}>
                  <small>วันที่สร้าง</small>
                  <span>{formatDate(user.createdAt)}</span>
                </time>

                <div className="um-row-action">
                  {user.role === "user" && canUpdateUsers && (
                    <button type="button" onClick={() => openEditUser(user)}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" />
                        <path d="m13.5 6.5 4 4" />
                      </svg>
                      แก้ไข
                    </button>
                  )}
                  {isSuperAdmin &&
                    user.role !== "super_admin" &&
                    user.id !== currentProfile.id && (
                      <button
                        className="um-permission-button"
                        type="button"
                        onClick={() => openAccessDialog(user)}
                      >
                        {user.role === "admin" ? "กำหนดสิทธิ์" : "แต่งตั้ง Admin"}
                      </button>
                    )}
                  {user.role === "super_admin" && (
                    <span title="ป้องกันการแก้สิทธิ์ Super Admin ผ่านหน้าเว็บ">
                      บัญชีหลัก
                    </span>
                  )}
                </div>
              </article>
            ))}

            {isLoading && (
              <div className="um-list-state">
                <i className="um-button-spinner" aria-hidden="true" />
                <p>กำลังโหลดผู้ใช้งาน…</p>
              </div>
            )}
            {!isLoading && filteredUsers.length === 0 && (
              <div className="um-list-state">
                <span aria-hidden="true">⌕</span>
                <h3>ไม่พบผู้ใช้งาน</h3>
                <p>ลองค้นหาด้วยชื่อ อีเมล หรือชื่อแผนกอื่น</p>
              </div>
            )}
          </div>
        </article>
      </section>

      {editingUser && (
        <EditUserDialog
          key={editingUser.id}
          user={editingUser}
          departments={userDepartments}
          isSaving={isUpdatingUser}
          errorMessage={editError}
          onClose={closeEditUser}
          onSubmit={handleUpdateUser}
        />
      )}

      {accessUser && (
        <AdminAccessDialog
          key={accessUser.id}
          user={accessUser}
          isSaving={isSavingAccess}
          errorMessage={accessError}
          onClose={closeAccessDialog}
          onSubmit={handleManageAccess}
        />
      )}
    </section>
  );
}
