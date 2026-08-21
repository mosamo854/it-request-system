import { supabase } from "../lib/supabase";
import type {
  ActivityAction,
  ActivityEntityType,
  ActivityLog,
} from "../types/activityLog";

interface ActivityLogRow {
  id: number;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: ActivityAction;
  entity_type: ActivityEntityType;
  entity_id: string | null;
  request_id: string | null;
  request_code: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function mapActivityLog(row: ActivityLogRow): ActivityLog {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorEmail: row.actor_email,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    requestId: row.request_id,
    requestCode: row.request_code,
    description: row.description,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

export async function getActivityLogs(limit = 300): Promise<ActivityLog[]> {
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as ActivityLogRow[]).map(mapActivityLog);
}

export function subscribeToActivityLogs(
  onInsert: (activity: ActivityLog) => void,
) {
  const channel = supabase
    .channel("admin-activity-log")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "activity_logs",
      },
      (payload) => onInsert(mapActivityLog(payload.new as ActivityLogRow)),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
