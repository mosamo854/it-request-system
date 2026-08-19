export interface ChatMessage {
  id: string;
  requestId: string;
  senderId: string;
  senderEmail: string;
  body: string;
  imagePath: string | null;
  createdAt: string;
}
