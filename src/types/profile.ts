export type UserRole = "super_admin" | "admin" | "user";

export const ADMIN_PERMISSIONS = [
  "requests.view",
  "requests.update",
  "requests.archive",
  "archive.view",
  "archive.restore",
  "archive.delete",
  "statistics.view",
  "statistics.export",
  "activity.view",
  "activity.export",
  "users.view",
  "users.create",
  "users.update",
  "departments.create",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  department: string | null;
  phone: string | null;
  role: UserRole;
  permissions: AdminPermission[];
  createdAt: string;
}

export interface CreateManagedUserInput {
  email: string;
  password: string;
  fullName: string;
  department: string;
  phone: string;
}

export interface UpdateManagedUserInput {
  userId: string;
  email: string;
  password?: string;
  fullName: string;
  department: string;
  phone: string;
}

export interface ManageAdminAccessInput {
  userId: string;
  role: "admin" | "user";
  permissions: AdminPermission[];
}

export function hasPermission(
  profile: UserProfile | null,
  permission: AdminPermission,
) {
  return Boolean(
    profile &&
      (profile.role === "super_admin" ||
        (profile.role === "admin" && profile.permissions.includes(permission))),
  );
}
