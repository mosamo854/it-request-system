export type UserRole = "admin" | "user";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  department: string | null;
  phone: string | null;
  role: UserRole;
  createdAt: string;
}

export interface CreateManagedUserInput {
  email: string;
  password: string;
  fullName: string;
  department: string;
  phone: string;
}
