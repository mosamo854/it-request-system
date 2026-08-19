import { supabase } from "../lib/supabase";
import type {
  CreateTicketInput,
  Ticket,
  TicketPriority,
  TicketStatus,
} from "../types/ticket";
import { removeImage, uploadImage } from "./imageService";

interface TicketRow {
  id: string;
  code: string;
  requester_name: string;
  requester_email: string;
  department: string;
  category: string;
  priority: TicketPriority;
  subject: string;
  detail: string;
  image_path: string | null;
  status: TicketStatus;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
}

function mapTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    code: row.code,
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    department: row.department,
    category: row.category,
    priority: row.priority,
    subject: row.subject,
    detail: row.detail,
    imagePath: row.image_path ?? null,
    status: row.status,
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
  image?: File,
): Promise<Ticket> {
  const imagePath = image ? await uploadImage(image, "requests") : null;
  const { data, error } = await supabase
    .from("it_requests")
    .insert({
      requester_name: input.requesterName.trim(),
      requester_email: input.requesterEmail.trim().toLowerCase(),
      department: input.department,
      category: input.category,
      priority: input.priority,
      subject: input.subject.trim(),
      detail: input.detail.trim(),
      image_path: imagePath,
    })
    .select("*")
    .single();

  if (error) {
    if (imagePath) await removeImage(imagePath).catch(() => undefined);
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
