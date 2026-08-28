import { useMemo, useState } from "react";
import type { Ticket } from "../types/ticket";

interface ArchivePageProps {
  tickets: Ticket[];
  isLoading: boolean;
  errorMessage: string;
  restoringId: string | null;
  deletingId: string | null;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenChat: (ticket: Ticket) => void;
  canRestore: boolean;
  canDelete: boolean;
}

const BACKUP_RETENTION_DAYS = 7;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

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

function getExpiryInfo(archivedAt: string | null) {
  if (!archivedAt) {
    return { expiresAt: null, remainingLabel: "—", expired: false };
  }

  const expiresAt =
    new Date(archivedAt).getTime() +
    BACKUP_RETENTION_DAYS * DAY_IN_MILLISECONDS;
  const remainingMilliseconds = expiresAt - Date.now();
  const remainingDays = Math.max(
    0,
    Math.ceil(remainingMilliseconds / DAY_IN_MILLISECONDS),
  );

  return {
    expiresAt: new Date(expiresAt).toISOString(),
    remainingLabel:
      remainingMilliseconds <= 0
        ? "รอลบอัตโนมัติ"
        : `เหลือ ${remainingDays} วัน`,
    expired: remainingMilliseconds <= 0,
  };
}

export default function ArchivePage({
  tickets,
  isLoading,
  errorMessage,
  restoringId,
  deletingId,
  onRestore,
  onDelete,
  onOpenChat,
  canRestore,
  canDelete,
}: ArchivePageProps) {
  const [query, setQuery] = useState("");

  const filteredTickets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tickets.filter((ticket) =>
      !normalized
        ? true
        : [
            ticket.code,
            ticket.subject,
            ticket.requesterName,
            ticket.requesterDepartment,
            ticket.targetDepartment,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalized),
    );
  }, [query, tickets]);

  return (
    <section className="content subpage-content" id="archive-top">
      <header className="subpage-header">
        <div className="mobile-brand">RC</div>
        <div>
          <span className="eyebrow">Backup Archive</span>
          <h1>คลังสำรองคำขอ</h1>
          <p>กู้คืนได้ภายใน 7 วัน ก่อนระบบลบคำขอ แชต และไฟล์แนบถาวร</p>
        </div>
        <span className="archive-total">{tickets.length} รายการ</span>
      </header>

      {errorMessage && (
        <p className="notice error-notice subpage-error">{errorMessage}</p>
      )}

      <div className="archive-info">
        <span>7</span>
        <div>
          <strong>เก็บข้อมูลสำรองไว้ 7 วัน</strong>
          <p>
            Admin กู้คืนหรือลบถาวรได้ทันที หากไม่ดำเนินการ
            ระบบจะลบให้อัตโนมัติเมื่อครบกำหนด
          </p>
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
          {filteredTickets.map((ticket) => {
            const expiry = getExpiryInfo(ticket.archivedAt);

            return (
              <article className="archive-card" key={ticket.id}>
                <div className="archive-card-main">
                  <div className="ticket-topline">
                    <span className="ticket-code">{ticket.code}</span>
                    <span
                      className={`archive-badge${expiry.expired ? " expired" : ""}`}
                    >
                      {expiry.remainingLabel}
                    </span>
                  </div>
                  <h2>{ticket.subject}</h2>
                  <p>{ticket.detail}</p>
                  <div className="archive-meta">
                    <span>
                      <small>ผู้แจ้ง</small>
                      <b>{ticket.requesterName}</b>
                    </span>
                    <span>
                      <small>แผนกผู้ส่ง</small>
                      <b>{ticket.requesterDepartment}</b>
                    </span>
                    <span>
                      <small>แผนกปลายทาง</small>
                      <b>{ticket.targetDepartment}</b>
                    </span>
                    <span>
                      <small>วันที่ส่ง</small>
                      <b>{formatDate(ticket.createdAt)}</b>
                    </span>
                    <span>
                      <small>เก็บสำรองเมื่อ</small>
                      <b>{formatDate(ticket.archivedAt)}</b>
                    </span>
                    <span>
                      <small>ลบถาวรอัตโนมัติ</small>
                      <b>{formatDate(expiry.expiresAt)}</b>
                    </span>
                  </div>
                </div>
                <div className="archive-actions">
                  <button
                    className="chat-button"
                    onClick={() => onOpenChat(ticket)}
                  >
                    <span>•••</span> เปิดแชต
                  </button>
                  {canRestore && <button
                    className="restore-button"
                    disabled={restoringId === ticket.id}
                    onClick={() => onRestore(ticket.id)}
                  >
                    {restoringId === ticket.id
                      ? "กำลังกู้คืน…"
                      : "↶ กู้คืนรายการ"}
                  </button>}
                  {canDelete && <button
                    className="permanent-delete-button"
                    disabled={deletingId === ticket.id}
                    onClick={() => onDelete(ticket.id)}
                  >
                    {deletingId === ticket.id
                      ? "กำลังลบถาวร…"
                      : "⌫ ลบถาวรทันที"}
                  </button>}
                </div>
              </article>
            );
          })}

          {!isLoading && filteredTickets.length === 0 && (
            <div className="empty-state archive-empty">
              <span>▣</span>
              <h3>{query ? "ไม่พบรายการสำรอง" : "คลังสำรองยังว่าง"}</h3>
              <p>
                {query
                  ? "ลองเปลี่ยนคำค้นหา"
                  : "งานที่เสร็จสิ้นและกดลบจะมาอยู่ที่นี่"}
              </p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
