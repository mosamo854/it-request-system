export type ActivityAction =
  | "request_created"
  | "status_changed"
  | "request_archived"
  | "request_restored"
  | "request_deleted"
  | "request_auto_deleted"
  | "department_created"
  | "user_created"
  | "user_updated";

export type ActivityEntityType = "request" | "department" | "user";

export interface ActivityLog {
  id: number;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string | null;
  requestId: string | null;
  requestCode: string | null;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
