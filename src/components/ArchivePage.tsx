import { useMemo, useState } from "react";
import type { Ticket } from "../types/ticket";

interface ArchivePageProps {
  tickets: Ticket[];
  isLoading: boolean;
  errorMessage: string;
  restoringId: string | null;
  onRestore: (id: string) => void;
  onOpenChat: (ticket: Ticket) => void;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ArchivePage({
  tickets,
  isLoading,
  errorMessage,
  restoringId,
  onRestore,
  onOpenChat,
}: ArchivePageProps) {
  const [query, setQuery] = useState("");

  const filteredTickets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tickets.filter((ticket) =>
      !normalized
        ? true
        : [ticket.code, ticket.subject, ticket.requesterName, ticket.department]
            .join(" ")
            .toLowerCase()
            .includes(normalized),
    );
  }, [query, tickets]);

  return (
    <section className="content subpage-content" id="archive-top">
      <header className="subpage-header">
        <div className="mobile-brand">IT</div>
        <div>
          <span className="eyebrow">Backup Archive</span>
          <h1>คลังสำรองคำขอ</h1>
          <p>รายการถูกนำออกจากหน้าหลัก แต่ข้อมูล แชต และรูปภาพยังอยู่ครบ</p>
        </div>
        <span className="archive-total">{tickets.length} รายการ</span>
      </header>

      {errorMessage && <p className="notice error-notice subpage-error">{errorMessage}</p>}

      <div className="archive-info">
        <span>✓</span>
        <div>
          <strong>ไม่มีการลบข้อมูลออกจากฐานข้อมูล</strong>
          <p>สามารถเปิดดูแชตและกู้คืนคำขอกลับไปยังรายการหลักได้ทุกเมื่อ</p>
        </div>
      </div>

      <section className="archive-panel">
        <div className="archive-toolbar">
          <label className="search-box">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาเลขคำขอ หัวข้อ ชื่อ หรือแผนก"
            />
          </label>
          <span>{filteredTickets.length} รายการ</span>
        </div>

        <div className="archive-list">
          {filteredTickets.map((ticket) => (
            <article className="archive-card" key={ticket.id}>
              <div className="archive-card-main">
                <div className="ticket-topline">
                  <span className="ticket-code">{ticket.code}</span>
                  <span className="archive-badge">เก็บสำรองแล้ว</span>
                </div>
                <h2>{ticket.subject}</h2>
                <p>{ticket.detail}</p>
                <div className="archive-meta">
                  <span><small>ผู้แจ้ง</small><b>{ticket.requesterName}</b></span>
                  <span><small>แผนก</small><b>{ticket.department}</b></span>
                  <span><small>วันที่ส่ง</small><b>{formatDate(ticket.createdAt)}</b></span>
                  <span><small>เก็บสำรองเมื่อ</small><b>{formatDate(ticket.archivedAt)}</b></span>
                </div>
              </div>
              <div className="archive-actions">
                <button className="chat-button" onClick={() => onOpenChat(ticket)}>
                  <span>•••</span> เปิดแชต
                </button>
                <button
                  className="restore-button"
                  disabled={restoringId === ticket.id}
                  onClick={() => onRestore(ticket.id)}
                >
                  {restoringId === ticket.id ? "กำลังกู้คืน…" : "↶ กู้คืนรายการ"}
                </button>
              </div>
            </article>
          ))}

          {!isLoading && filteredTickets.length === 0 && (
            <div className="empty-state archive-empty">
              <span>▣</span>
              <h3>{query ? "ไม่พบรายการสำรอง" : "คลังสำรองยังว่าง"}</h3>
              <p>{query ? "ลองเปลี่ยนคำค้นหา" : "งานที่เสร็จสิ้นและกดลบจะมาอยู่ที่นี่"}</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
