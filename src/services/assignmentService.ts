import { supabase } from "../lib/supabase";
import type { AssignableMember } from "../types/assignment";

interface AssignableMemberRow {
  id: string;
  full_name: string;
  role: "admin" | "user";
}

export async function getAssignableMembers(
  department: string,
): Promise<AssignableMember[]> {
  const { data, error } = await supabase.rpc("get_assignable_members", {
    request_department: department,
  });

  if (error) throw error;
  return ((data ?? []) as AssignableMemberRow[]).map((member) => ({
    id: member.id,
    fullName: member.full_name,
    role: member.role,
  }));
}

export async function assignRequest(
  requestId: string,
  assigneeId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("assign_request", {
    target_request_id: requestId,
    target_assignee_id: assigneeId,
  });

  if (error) throw error;
}
