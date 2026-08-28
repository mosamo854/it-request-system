export interface ChatMessage {
  id: string;
  requestId: string;
  senderId: string;
  senderEmail: string;
  body: string;
  attachmentPath: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentSize: number | null;
  createdAt: string;
}
