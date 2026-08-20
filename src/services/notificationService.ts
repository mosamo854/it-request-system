import { supabase } from "../lib/supabase";
import type {
  AppNotification,
  NotificationType,
} from "../types/notification";

interface NotificationRow {
  id: string;
  user_id: string;
  request_id: string | null;
  actor_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

function mapNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    requestId: row.request_id,
    actorId: row.actor_id,
    type: row.type,
    title: row.title,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function getNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) throw error;
  return (data as NotificationRow[]).map(mapNotification);
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await supabase.rpc("mark_notification_read", {
    notification_id: notificationId,
  });
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw error;
}

export function subscribeToNotifications(
  userId: string,
  handlers: {
    onInsert: (notification: AppNotification) => void;
    onUpdate: (notification: AppNotification) => void;
  },
) {
  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) =>
        handlers.onInsert(mapNotification(payload.new as NotificationRow)),
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) =>
        handlers.onUpdate(mapNotification(payload.new as NotificationRow)),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
