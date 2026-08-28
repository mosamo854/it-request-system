import { supabase } from "../lib/supabase";
import type { ChatMessage } from "../types/message";
import {
  removeAttachment,
  uploadAttachment,
} from "./attachmentService";

interface MessageRow {
  id: string;
  request_id: string;
  sender_id: string;
  sender_email: string;
  body: string;
  image_path: string | null;
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_size: number | null;
  created_at: string;
}

function mapMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    requestId: row.request_id,
    senderId: row.sender_id,
    senderEmail: row.sender_email,
    body: row.body,
    attachmentPath: row.image_path ?? null,
    attachmentName: row.attachment_name ?? null,
    attachmentMimeType: row.attachment_mime_type ?? null,
    attachmentSize: row.attachment_size ?? null,
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
  attachment?: File;
}): Promise<ChatMessage> {
  const attachment = input.attachment
    ? await uploadAttachment(input.attachment, "messages")
    : null;
  const { data, error } = await supabase
    .from("it_request_messages")
    .insert({
      request_id: input.requestId,
      sender_id: input.senderId,
      sender_email: input.senderEmail,
      body: input.body.trim(),
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
