import { supabase } from "../lib/supabase";
import type {
  CreateTicketInput,
  Ticket,
  TicketPriority,
  TicketStatus,
} from "../types/ticket";
import {
  removeAttachment,
  uploadAttachment,
} from "./attachmentService";

interface TicketRow {
  id: string;
  code: string;
  requester_user_id: string | null;
  requester_name: string;
  requester_email: string;
  department: string;
  target_department: string;
  category: string;
  priority: TicketPriority;
  subject: string;
  detail: string;
  image_path: string | null;
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_size: number | null;
  status: TicketStatus;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
}

function mapTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    code: row.code,
    requesterUserId: row.requester_user_id ?? null,
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    requesterDepartment: row.department,
    targetDepartment: row.target_department,
    category: row.category,
    priority: row.priority,
    subject: row.subject,
    detail: row.detail,
    attachmentPath: row.image_path ?? null,
    attachmentName: row.attachment_name ?? null,
    attachmentMimeType: row.attachment_mime_type ?? null,
    attachmentSize: row.attachment_size ?? null,
    status: row.status,
    assignedTo: row.assigned_to ?? null,
    assignedToName: row.assigned_to_name ?? null,
    assignedAt: row.assigned_at ?? null,
    assignedBy: row.assigned_by ?? null,
    archivedAt: row.archived_at ?? null,
    archivedBy: row.archived_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getTickets(): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from("it_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as TicketRow[]).map(mapTicket);
}

export async function createTicket(
  input: CreateTicketInput,
  attachmentFile?: File,
): Promise<Ticket> {
  const attachment = attachmentFile
    ? await uploadAttachment(attachmentFile, "requests")
    : null;
  const { data, error } = await supabase
    .from("it_requests")
    .insert({
      requester_name: input.requesterName.trim(),
      requester_user_id: input.requesterUserId,
      requester_email: input.requesterEmail.trim().toLowerCase(),
      department: input.requesterDepartment,
      target_department: input.targetDepartment,
      category: input.category,
      priority: input.priority,
      subject: input.subject.trim(),
      detail: input.detail.trim(),
      image_path: attachment?.path ?? null,
      attachment_name: attachment?.originalName ?? null,
      attachment_mime_type: attachment?.mimeType ?? null,
      attachment_size: attachment?.size ?? null,
    })
    .select("*")
    .single();

  if (error) {
    if (attachment?.path) {
      await removeAttachment(attachment.path).catch(() => undefined);
    }
    throw error;
  }
  return mapTicket(data as TicketRow);
}

export async function updateTicketStatus(
  id: string,
  status: TicketStatus,
): Promise<Ticket> {
  const { data, error } = await supabase
    .from("it_requests")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapTicket(data as TicketRow);
}

export async function archiveTicket(
  id: string,
  userId: string,
): Promise<Ticket> {
  const { data, error } = await supabase
    .from("it_requests")
    .update({
      archived_at: new Date().toISOString(),
      archived_by: userId,
    })
    .eq("id", id)
    .eq("status", "done")
    .is("archived_at", null)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("ลบได้เฉพาะคำขอที่เสร็จสิ้นและยังไม่ถูกเก็บสำรอง");
  return mapTicket(data as TicketRow);
}

export async function restoreTicket(id: string): Promise<Ticket> {
  const { data, error } = await supabase
    .from("it_requests")
    .update({ archived_at: null, archived_by: null })
    .eq("id", id)
    .not("archived_at", "is", null)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("ไม่พบคำขอในคลังสำรอง");
  return mapTicket(data as TicketRow);
}

async function getFunctionErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "context" in error &&
    error.context instanceof Response
  ) {
    try {
      const body = (await error.context.json()) as { error?: string };
      if (body.error) return body.error;
    } catch {
      // Fall through to the standard error message.
    }
  }

  if (error instanceof Error) return error.message;
  return "ลบข้อมูลสำรองถาวรไม่สำเร็จ";
}

export async function permanentlyDeleteTicket(id: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("purge-backups", {
    body: { requestId: id },
  });

  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (data?.error) throw new Error(String(data.error));
  if (
    !Array.isArray(data?.deletedRequestIds) ||
    !data.deletedRequestIds.includes(id)
  ) {
    throw new Error("ไม่พบคำขอในคลังสำรอง หรือคำขอถูกลบไปแล้ว");
  }
}
