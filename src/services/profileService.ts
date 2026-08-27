import { supabase } from "../lib/supabase";
import type {
  AdminPermission,
  CreateManagedUserInput,
  ManageAdminAccessInput,
  UpdateManagedUserInput,
  UserProfile,
  UserRole,
} from "../types/profile";

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  department: string | null;
  phone: string | null;
  role: UserRole;
  permissions: AdminPermission[] | null;
  created_at: string;
}

function mapProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    department: row.department,
    phone: row.phone ?? null,
    role: row.role,
    permissions: row.permissions ?? [],
    createdAt: row.created_at,
  };
}

export async function getCurrentProfile(userId: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return mapProfile(data as ProfileRow);
}

export async function getProfiles(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as ProfileRow[]).map(mapProfile);
}

async function getFunctionErrorMessage(error: unknown, functionName: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "context" in error &&
    error.context instanceof Response
  ) {
    const response = error.context;
    try {
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (body.error) return body.error;
      if (response.status === 404) {
        return `ยังไม่ได้ Deploy Edge Function ${functionName} กรุณา Deploy แล้วลองอีกครั้ง`;
      }
      if (body.message) return body.message;
    } catch {
      // Fall through to the standard error message.
    }

    if (response.status === 404) {
      return `ยังไม่ได้ Deploy Edge Function ${functionName} กรุณา Deploy แล้วลองอีกครั้ง`;
    }

  }

  if (error instanceof Error) return error.message;
  return "ดำเนินการไม่สำเร็จ";
}

export async function createManagedUser(input: CreateManagedUserInput) {
  const { data, error } = await supabase.functions.invoke("create-user", {
    body: input,
  });

  if (error) throw new Error(await getFunctionErrorMessage(error, "create-user"));
  if (data?.error) throw new Error(String(data.error));
}

export async function updateManagedUser(input: UpdateManagedUserInput) {
  const { data, error } = await supabase.functions.invoke("update-user", {
    body: input,
  });

  if (error) throw new Error(await getFunctionErrorMessage(error, "update-user"));
  if (data?.error) throw new Error(String(data.error));
}

export async function manageAdminAccess(input: ManageAdminAccessInput) {
  const { data, error } = await supabase.functions.invoke(
    "manage-admin-access",
    { body: input },
  );

  if (error) {
    throw new Error(
      await getFunctionErrorMessage(error, "manage-admin-access"),
    );
  }
  if (data?.error) throw new Error(String(data.error));
}
