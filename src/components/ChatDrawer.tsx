import { FormEvent, useEffect, useRef, useState } from "react";
import {
  getMessages,
  sendMessage,
  subscribeToMessages,
} from "../services/messageService";
import type { ChatMessage } from "../types/message";
import type { Ticket } from "../types/ticket";

interface ChatDrawerProps {
  ticket: Ticket;
  currentUserId: string;
  currentUserEmail: string;
  onClose: () => void;
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง";
}

export default function ChatDrawer({
  ticket,
  currentUserId,
  currentUserEmail,
  onClose,
}: ChatDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadMessages() {
      try {
        const data = await getMessages(ticket.id);
        if (isMounted) setMessages(data);
      } catch (error) {
        if (isMounted) setErrorMessage(getErrorMessage(error));
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadMessages();

    const unsubscribe = subscribeToMessages(ticket.id, (message) => {
      if (!isMounted) return;
      setMessages((current) =>
        current.some((item) => item.id === message.id)
          ? current
          : [...current, message],
      );
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [ticket.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = String(form.get("message") ?? "").trim();
    if (!body) return;

    setErrorMessage("");
    setIsSending(true);

    try {
      const message = await sendMessage({
        requestId: ticket.id,
        senderId: currentUserId,
        senderEmail: currentUserEmail,
        body,
      });
      setMessages((current) =>
        current.some((item) => item.id === message.id)
          ? current
          : [...current, message],
      );
      formElement.reset();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div
      className="chat-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <aside className="chat-drawer" role="dialog" aria-modal="true">
        <header className="chat-header">
          <div>
            <span className="chat-online"><i /> ห้องสนทนา</span>
            <h2>{ticket.subject}</h2>
            <p>{ticket.code} · {ticket.department}</p>
          </div>
          <button onClick={onClose} aria-label="ปิดแชต">×</button>
        </header>

        <section className="chat-context">
          <span className="avatar small">{ticket.requesterName.charAt(0)}</span>
          <p>
            <strong>{ticket.requesterName}</strong>
            <span>{ticket.detail}</span>
          </p>
        </section>

        <section className="chat-messages" aria-live="polite">
          {isLoading && (
            <div className="chat-loading">
              <span className="loading-spinner" />
              กำลังโหลดข้อความ…
            </div>
          )}

          {!isLoading && messages.length === 0 && (
            <div className="chat-empty">
              <span>···</span>
              <h3>เริ่มสนทนาเกี่ยวกับคำขอนี้</h3>
              <p>สอบถามข้อมูลเพิ่มเติมหรือแจ้งความคืบหน้าได้ที่นี่</p>
            </div>
          )}

          {messages.map((message) => {
            const isOwnMessage = message.senderId === currentUserId;
            return (
              <article
                className={isOwnMessage ? "chat-message own" : "chat-message"}
                key={message.id}
              >
                {!isOwnMessage && (
                  <span className="message-avatar">
                    {message.senderEmail.charAt(0).toUpperCase()}
                  </span>
                )}
                <div>
                  <small>
                    {isOwnMessage ? "คุณ" : message.senderEmail.split("@")[0]}
                  </small>
                  <p>{message.body}</p>
                  <time>{formatMessageTime(message.createdAt)}</time>
                </div>
              </article>
            );
          })}
          <div ref={messagesEndRef} />
        </section>

        <footer className="chat-compose">
          {errorMessage && <p className="chat-error">{errorMessage}</p>}
          <form onSubmit={handleSubmit}>
            <textarea
              name="message"
              rows={2}
              maxLength={2000}
              required
              placeholder="พิมพ์ข้อความ…"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button type="submit" disabled={isSending}>
              {isSending ? "…" : "ส่ง"} <span>→</span>
            </button>
          </form>
          <small>กด Enter เพื่อส่ง · Shift + Enter เพื่อขึ้นบรรทัดใหม่</small>
        </footer>
      </aside>
    </div>
  );
}
