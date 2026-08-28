export type TicketStatus = "waiting" | "in_progress" | "done";
export type TicketPriority = "urgent" | "normal" | "low";

export interface Ticket {
  id: string;
  code: string;
  requesterUserId: string | null;
  requesterName: string;
  requesterEmail: string;
  requesterDepartment: string;
  targetDepartment: string;
  category: string;
  priority: TicketPriority;
  subject: string;
  detail: string;
  attachmentPath: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentSize: number | null;
  status: TicketStatus;
  assignedTo: string | null;
  assignedToName: string | null;
  assignedAt: string | null;
  assignedBy: string | null;
  archivedAt: string | null;
  archivedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketInput {
  requesterUserId: string;
  requesterName: string;
  requesterEmail: string;
  requesterDepartment: string;
  targetDepartment: string;
  category: string;
  priority: TicketPriority;
  subject: string;
  detail: string;
}
