import { supabase } from "../lib/supabase";
import type { ChatMessage } from "../types/message";

interface MessageRow {
  id: string;
  request_id: string;
  sender_id: string;
  sender_email: string;
  body: string;
  created_at: string;
}

function mapMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    requestId: row.request_id,
    senderId: row.sender_id,
    senderEmail: row.sender_email,
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function getMessages(requestId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("it_request_messages")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as MessageRow[]).map(mapMessage);
}

export async function sendMessage(input: {
  requestId: string;
  senderId: string;
  senderEmail: string;
  body: string;
}): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from("it_request_messages")
    .insert({
      request_id: input.requestId,
      sender_id: input.senderId,
      sender_email: input.senderEmail,
      body: input.body.trim(),
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapMessage(data as MessageRow);
}

export function subscribeToMessages(
  requestId: string,
  onMessage: (message: ChatMessage) => void,
) {
  const channel = supabase
    .channel(`request-chat-${requestId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "it_request_messages",
        filter: `request_id=eq.${requestId}`,
      },
      (payload) => onMessage(mapMessage(payload.new as MessageRow)),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
