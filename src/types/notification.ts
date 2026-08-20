export type NotificationType =
  | "request_created"
  | "status_changed"
  | "message_received";

export interface AppNotification {
  id: string;
  userId: string;
  requestId: string | null;
  actorId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}
