export type TicketStatus = "waiting" | "in_progress" | "done";
export type TicketPriority = "urgent" | "normal" | "low";

export interface Ticket {
  id: string;
  code: string;
  requesterName: string;
  requesterEmail: string;
  department: string;
  category: string;
  priority: TicketPriority;
  subject: string;
  detail: string;
  imagePath: string | null;
  status: TicketStatus;
  archivedAt: string | null;
  archivedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketInput {
  requesterName: string;
  requesterEmail: string;
  department: string;
  category: string;
  priority: TicketPriority;
  subject: string;
  detail: string;
}
