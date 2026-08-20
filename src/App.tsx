import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import ArchivePage from "./components/ArchivePage";
import AttachmentImage from "./components/AttachmentImage";
import ChatDrawer from "./components/ChatDrawer";
import LoginPage from "./components/LoginPage";
import NotificationCenter from "./components/NotificationCenter";
import StatisticsPage from "./components/StatisticsPage";
import UserManagementPage from "./components/UserManagementPage";
import { supabase } from "./lib/supabase";
import { getDepartments } from "./services/departmentService";
import { validateImage } from "./services/imageService";
import { getCurrentProfile } from "./services/profileService";
import {
  archiveTicket,
  createTicket,
  getTickets,
  permanentlyDeleteTicket,
  restoreTicket,
  updateTicketStatus,
} from "./services/ticketService";
import type {
  CreateTicketInput,
  Ticket,
  TicketPriority,
  TicketStatus,
} from "./types/ticket";
import type { UserProfile } from "./types/profile";
import type { Department } from "./types/department";

type AppView = "dashboard" | "statistics" | "archive" | "users";

const ALL_DEPARTMENTS = "ทุกแผนก";

const statusMeta: Record<
  TicketStatus,
  { label: string; className: string }
> = {
  waiting: { label: "รอรับเรื่อง", className: "status-waiting" },
  in_progress: { label: "กำลังดำเนินการ", className: "status-progress" },
  done: { label: "เสร็จสิ้น", className: "status-done" },
};

const priorityMeta: Record<
  TicketPriority,
  { label: string; className: string }
> = {
  urgent: { label: "เร่งด่วน", className: "priority-urgent" },
  normal: { label: "ปกติ", className: "priority-normal" },
  low: { label: "ไม่เร่งด่วน", className: "priority-low" },
};

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const today = new Date();
  const dateText = date.toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
  });
  const todayText = today.toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
  });
  const time = date.toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (dateText === todayText) return `วันนี้ · ${time}`;

  return `${date.toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
  })} · ${time}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
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

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [activeView, setActiveView] = useState<AppView>("dashboard");
  const [activeDepartment, setActiveDepartment] = useState(ALL_DEPARTMENTS);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [submittedCode, setSubmittedCode] = useState("");
  const [requestImagePreview, setRequestImagePreview] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeChatTicket, setActiveChatTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      if (isMounted) {
        setSession(data.session);
        setIsAuthLoading(false);
      }
    }

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setActiveView("dashboard");
      }
      setIsAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setTickets([]);
      setDepartments([]);
      setProfile(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const sessionUserId = session.user.id;

    async function loadAppData() {
      setIsLoading(true);
      setPageError("");
      try {
        const [profileData, ticketData, departmentData] = await Promise.all([
          getCurrentProfile(sessionUserId),
          getTickets(),
          getDepartments(),
        ]);
        if (isMounted) {
          setProfile(profileData);
          setTickets(ticketData);
          setDepartments(departmentData);
        }
      } catch (error) {
        if (isMounted) {
          setProfile(null);
          setPageError(getErrorMessage(error));
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadAppData();
    return () => {
      isMounted = false;
    };
  }, [session]);

  const isAdmin = profile?.role === "admin";

  const departmentNames = useMemo(
    () => [ALL_DEPARTMENTS, ...departments.map((department) => department.name)],
    [departments],
  );

  const activeTickets = useMemo(
    () => (isAdmin ? tickets.filter((ticket) => !ticket.archivedAt) : tickets),
    [isAdmin, tickets],
  );

  const archivedTickets = useMemo(
    () => tickets.filter((ticket) => Boolean(ticket.archivedAt)),
    [tickets],
  );

  const filteredTickets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return activeTickets.filter((ticket) => {
      const matchesDepartment =
        activeDepartment === ALL_DEPARTMENTS ||
        ticket.department === activeDepartment;
      const matchesStatus =
        statusFilter === "all" || ticket.status === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        [
          ticket.code,
          ticket.subject,
          ticket.requesterName,
          ticket.department,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesDepartment && matchesStatus && matchesQuery;
    });
  }, [activeDepartment, activeTickets, query, statusFilter]);

  const counts = useMemo(
    () => ({
      all: activeTickets.length,
      waiting: activeTickets.filter((ticket) => ticket.status === "waiting").length,
      inProgress: activeTickets.filter(
        (ticket) => ticket.status === "in_progress",
      ).length,
      done: activeTickets.filter((ticket) => ticket.status === "done").length,
    }),
    [activeTickets],
  );

  function showView(view: AppView, targetId?: string) {
    if (view !== "dashboard" && !isAdmin) return;
    setActiveView(view);
    window.setTimeout(() => {
      if (targetId) {
        document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 0);
  }

  function openRequestForm() {
    if (isAdmin) return;
    setSubmittedCode("");
    setFormError("");
    setIsFormOpen(true);
  }

  function closeRequestForm() {
    setIsFormOpen(false);
    setRequestImagePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  }

  function handleRequestImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setFormError("");

    setRequestImagePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });

    if (!file) return;

    try {
      validateImage(file);
      setRequestImagePreview(URL.createObjectURL(file));
    } catch (error) {
      event.currentTarget.value = "";
      setFormError(getErrorMessage(error));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    if (!profile || profile.role !== "user" || !profile.department) {
      setFormError("บัญชีนี้ยังไม่มีข้อมูลแผนก หรือไม่มีสิทธิ์ส่งคำขอ");
      return;
    }

    const input: CreateTicketInput = {
      requesterUserId: profile.id,
      requesterName: profile.fullName,
      requesterEmail: profile.email,
      department: profile.department,
      category: String(form.get("category") ?? ""),
      priority: String(form.get("priority") ?? "normal") as TicketPriority,
      subject: String(form.get("subject") ?? ""),
      detail: String(form.get("detail") ?? ""),
    };
    const imageEntry = form.get("image");
    const image =
      imageEntry instanceof File && imageEntry.size > 0 ? imageEntry : undefined;

    setFormError("");
    setIsSubmitting(true);

    try {
      const newTicket = await createTicket(input, image);
      setTickets((current) => [newTicket, ...current]);
      setSubmittedCode(newTicket.code);
      formElement.reset();
      setRequestImagePreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStatusChange(id: string, nextStatus: TicketStatus) {
    if (!isAdmin) return;
    const previousStatus = tickets.find((ticket) => ticket.id === id)?.status;
    setPageError("");
    setUpdatingId(id);
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === id ? { ...ticket, status: nextStatus } : ticket,
      ),
    );

    try {
      const updated = await updateTicketStatus(id, nextStatus);
      setTickets((current) =>
        current.map((ticket) => (ticket.id === id ? updated : ticket)),
      );
    } catch (error) {
      if (previousStatus) {
        setTickets((current) =>
          current.map((ticket) =>
            ticket.id === id ? { ...ticket, status: previousStatus } : ticket,
          ),
        );
      }
      setPageError(getErrorMessage(error));
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleArchive(id: string) {
    if (!isAdmin) return;
    const ticket = tickets.find((item) => item.id === id);
    if (!ticket || ticket.status !== "done") return;

    const confirmed = window.confirm(
      `ลบ ${ticket.code} ออกจากรายการหลักและเก็บไว้ในคลังสำรองหรือไม่?`,
    );
    if (!confirmed) return;

    setPageError("");
    setArchivingId(id);
    try {
      const updated = await archiveTicket(id, profile.id);
      setTickets((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      );
      setActiveChatTicket(null);
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setArchivingId(null);
    }
  }

  async function handleRestore(id: string) {
    if (!isAdmin) return;
    setPageError("");
    setRestoringId(id);
    try {
      const updated = await restoreTicket(id);
      setTickets((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      );
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setRestoringId(null);
    }
  }

  async function handlePermanentDelete(id: string) {
    if (!isAdmin) return;
    const ticket = tickets.find((item) => item.id === id);
    if (!ticket?.archivedAt) return;

    const confirmed = window.confirm(
      `ลบ ${ticket.code} ถาวรหรือไม่?\n\nคำขอ แชต และรูปภาพทั้งหมดจะถูกลบและไม่สามารถกู้คืนได้`,
    );
    if (!confirmed) return;

    setPageError("");
    setDeletingId(id);
    try {
      await permanentlyDeleteTicket(id);
      setTickets((current) => current.filter((item) => item.id !== id));
      setActiveChatTicket((current) => (current?.id === id ? null : current));
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleOpenNotificationRequest(requestId: string) {
    setActiveView("dashboard");
    setPageError("");

    try {
      const refreshedTickets = await getTickets();
      setTickets(refreshedTickets);
      const targetTicket = refreshedTickets.find(
        (ticket) => ticket.id === requestId,
      );

      if (targetTicket) {
        setActiveChatTicket(targetTicket);
      } else {
        setPageError("ไม่พบคำขอนี้ หรือคำขอถูกลบออกจากระบบแล้ว");
      }
    } catch (error) {
      setPageError(getErrorMessage(error));
    }

    window.setTimeout(() => {
      document
        .getElementById("requests")
        ?.scrollIntoView({ behavior: "smooth" });
    }, 0);
  }

  async function handleSignOut() {
    setPageError("");
    setActiveChatTicket(null);
    setProfile(null);
    setActiveView("dashboard");
    const { error } = await supabase.auth.signOut();
    if (error) setPageError(getErrorMessage(error));
  }

  if (isAuthLoading) {
    return (
      <main className="auth-loading">
        <span className="brand-mark">IT</span>
        <div className="loading-spinner" />
        <p>กำลังตรวจสอบการเข้าสู่ระบบ…</p>
      </main>
    );
  }

  if (!session) return <LoginPage />;

  if (isLoading && !profile) {
    return (
      <main className="auth-loading">
        <span className="brand-mark">IT</span>
        <div className="loading-spinner" />
        <p>กำลังโหลดสิทธิ์ผู้ใช้งาน…</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="profile-error-page">
        <span className="brand-mark">IT</span>
        <h1>ไม่พบข้อมูลสิทธิ์ผู้ใช้งาน</h1>
        <p>{pageError || "กรุณา Run schema.sql และตั้งค่า Admin ก่อนใช้งาน"}</p>
        <button className="primary-button" onClick={() => void handleSignOut()}>
          ออกจากระบบ
        </button>
      </main>
    );
  }

  const userEmail = session.user.email ?? "ผู้ใช้งาน";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#top"
          aria-label="IT Desk หน้าหลัก"
          onClick={(event) => {
            event.preventDefault();
            showView("dashboard", "top");
          }}
        >
          <span className="brand-mark">IT</span>
          <span>
            <strong>IT Desk</strong>
            <small>Request Center</small>
          </span>
        </a>

        <nav className="side-nav" aria-label="เมนูหลัก">
          <button
            className={activeView === "dashboard" ? "active" : ""}
            onClick={() => showView("dashboard", "top")}
          >
            <span>⌂</span> ภาพรวม
          </button>
          <button onClick={() => showView("dashboard", "requests")}>
            <span>≡</span> {isAdmin ? "คำขอทั้งหมด" : "คำขอของฉัน"} <b>{counts.all}</b>
          </button>
          {isAdmin && (
            <>
              <button
                className={activeView === "statistics" ? "active" : ""}
                onClick={() => showView("statistics")}
              >
                <span>⌁</span> สถิติ
              </button>
              <button
                className={activeView === "archive" ? "active" : ""}
                onClick={() => showView("archive")}
              >
                <span>▣</span> คลังสำรอง <b>{archivedTickets.length}</b>
              </button>
              <button
                className={activeView === "users" ? "active" : ""}
                onClick={() => showView("users")}
              >
                <span>♙</span> จัดการผู้ใช้
              </button>
            </>
          )}
        </nav>

        <div className="sidebar-help">
          <span className="help-icon">?</span>
          <strong>ต้องการความช่วยเหลือด่วน?</strong>
          <p>
            โทรภายใน 1200
            <br />
            จันทร์–ศุกร์ 08:30–17:30
          </p>
        </div>

        <div className="profile-mini">
          <span className="avatar">{userEmail.charAt(0).toUpperCase()}</span>
          <span>
            <strong title={userEmail}>{profile.fullName}</strong>
            <small>{isAdmin ? "Admin · ฝ่าย IT" : profile.department}</small>
          </span>
          <button
            className="logout-button"
            onClick={() => void handleSignOut()}
            aria-label="ออกจากระบบ"
          >
            ออก
          </button>
        </div>
      </aside>

      <nav className="mobile-view-nav" aria-label="เปลี่ยนหน้า">
        <button
          className={activeView === "dashboard" ? "active" : ""}
          onClick={() => showView("dashboard", "top")}
        >
          ภาพรวม
        </button>
        {isAdmin && (
          <>
            <button
              className={activeView === "statistics" ? "active" : ""}
              onClick={() => showView("statistics")}
            >
              สถิติ
            </button>
            <button
              className={activeView === "archive" ? "active" : ""}
              onClick={() => showView("archive")}
            >
              สำรอง ({archivedTickets.length})
            </button>
            <button
              className={activeView === "users" ? "active" : ""}
              onClick={() => showView("users")}
            >
              ผู้ใช้
            </button>
          </>
        )}
      </nav>

      {activeView === "dashboard" && (
      <section className="content" id="top">
        <header className="topbar">
          <div className="mobile-brand">IT</div>
          <div>
            <span className="eyebrow">IT Service Management</span>
            <h1>{isAdmin ? "ศูนย์จัดการคำขอ IT" : "คำขอ IT ของฉัน"}</h1>
          </div>
          {isAdmin ? (
            <button className="primary-button" onClick={() => showView("users")}>
              <span>＋</span> เพิ่มผู้ใช้
            </button>
          ) : (
            <button className="primary-button" onClick={openRequestForm}>
              <span>＋</span> ส่งคำขอใหม่
            </button>
          )}
        </header>

        <section className="welcome-card">
          <div className="welcome-copy">
            <span className="live-pill">
              <i /> IT Support พร้อมให้บริการ
            </span>
            <h2>
              {isAdmin ? "คำขอจากทุกแผนก" : "มีปัญหาเรื่องไอที"}
              <br />
              {isAdmin ? "จัดการได้ในที่เดียว" : "แจ้งเราได้เลย"}
            </h2>
            <p>
              {isAdmin
                ? "เปลี่ยนสถานะ ตอบแชต เก็บคำขอ และติดตามสถิติของทีม IT"
                : "ส่งรายละเอียดปัญหา ติดตามสถานะ และแชตกับทีม IT ได้ในที่เดียว"}
            </p>
            {isAdmin ? (
              <button className="light-button" onClick={() => showView("statistics")}>
                ดูสถิติ <span>→</span>
              </button>
            ) : (
              <button className="light-button" onClick={openRequestForm}>
                เริ่มส่งคำขอ <span>→</span>
              </button>
            )}
          </div>

          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="monitor">
              <div className="monitor-screen">
                <span className="mini-line long" />
                <span className="mini-line" />
                <span className="mini-line medium" />
                <div className="mini-check">✓</div>
              </div>
              <span className="monitor-stand" />
            </div>
            <span className="floating-dot dot-one" />
            <span className="floating-dot dot-two" />
          </div>
        </section>

        <section className="stats-grid" aria-label="สรุปคำขอ">
          <button
            className={statusFilter === "all" ? "stat-card selected" : "stat-card"}
            onClick={() => setStatusFilter("all")}
          >
            <span className="stat-icon all-icon">≡</span>
            <span>
              <small>{isAdmin ? "คำขอทั้งหมด" : "คำขอของฉัน"}</small>
              <strong>{counts.all}</strong>
            </span>
            <i>ดูทั้งหมด →</i>
          </button>
          <button
            className={statusFilter === "waiting" ? "stat-card selected" : "stat-card"}
            onClick={() => setStatusFilter("waiting")}
          >
            <span className="stat-icon waiting-icon">◷</span>
            <span>
              <small>รอรับเรื่อง</small>
              <strong>{counts.waiting}</strong>
            </span>
            <i>รายการ</i>
          </button>
          <button
            className={
              statusFilter === "in_progress" ? "stat-card selected" : "stat-card"
            }
            onClick={() => setStatusFilter("in_progress")}
          >
            <span className="stat-icon progress-icon">↻</span>
            <span>
              <small>กำลังดำเนินการ</small>
              <strong>{counts.inProgress}</strong>
            </span>
            <i>รายการ</i>
          </button>
          <button
            className={statusFilter === "done" ? "stat-card selected" : "stat-card"}
            onClick={() => setStatusFilter("done")}
          >
            <span className="stat-icon done-icon">✓</span>
            <span>
              <small>เสร็จสิ้น</small>
              <strong>{counts.done}</strong>
            </span>
            <i>รายการ</i>
          </button>
        </section>

        <section className={isAdmin ? "workspace-grid" : "workspace-grid user-workspace"}>
          <div className="request-panel" id="requests">
            <div className="section-heading">
              <div>
                <span className="eyebrow">รายการล่าสุด</span>
                <h2>{isAdmin ? "คำขอของทุกแผนก" : "รายการคำขอของฉัน"}</h2>
              </div>
              <span className="result-count">
                {isLoading ? "กำลังโหลด…" : `${filteredTickets.length} รายการ`}
              </span>
            </div>

            {pageError && <p className="notice error-notice">{pageError}</p>}

            <div className="toolbar">
              <label className="search-box">
                <span>⌕</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ค้นหาเลขคำขอ หัวข้อ หรือชื่อผู้แจ้ง"
                />
              </label>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as TicketStatus | "all")
                }
                aria-label="กรองตามสถานะ"
              >
                <option value="all">ทุกสถานะ</option>
                <option value="waiting">รอรับเรื่อง</option>
                <option value="in_progress">กำลังดำเนินการ</option>
                <option value="done">เสร็จสิ้น</option>
              </select>
            </div>

            {isAdmin && <div className="department-tabs" aria-label="กรองตามแผนก">
              {departmentNames.map((department) => (
                <button
                  key={department}
                  className={activeDepartment === department ? "active" : ""}
                  onClick={() => setActiveDepartment(department)}
                >
                  {department}
                </button>
              ))}
            </div>}

            <div className="ticket-list">
              {filteredTickets.map((ticket) => (
                <article className="ticket-card" key={ticket.id}>
                  <div
                    className={`priority-rail ${priorityMeta[ticket.priority].className}`}
                  />
                  <div className="ticket-main">
                    <div className="ticket-topline">
                      <span className="ticket-code">{ticket.code}</span>
                      <span
                        className={`status-badge ${statusMeta[ticket.status].className}`}
                      >
                        <i /> {statusMeta[ticket.status].label}
                      </span>
                      {!isAdmin && ticket.archivedAt && (
                        <span className="history-badge">เก็บเป็นประวัติแล้ว</span>
                      )}
                    </div>
                    <h3>{ticket.subject}</h3>
                    <p>{ticket.detail}</p>
                    {ticket.imagePath && (
                      <AttachmentImage
                        path={ticket.imagePath}
                        alt={`รูปประกอบคำขอ ${ticket.code}`}
                        className="ticket-attachment"
                      />
                    )}
                    <div className="ticket-meta">
                      <span className="avatar small">
                        {ticket.requesterName.charAt(0)}
                      </span>
                      <span>
                        <b>{ticket.requesterName}</b>
                        <small>{ticket.department}</small>
                      </span>
                      <span className="meta-divider" />
                      <span
                        className={`priority-label ${priorityMeta[ticket.priority].className}`}
                      >
                        {priorityMeta[ticket.priority].label}
                      </span>
                      <time>{formatCreatedAt(ticket.createdAt)}</time>
                    </div>
                  </div>
                  <div className="ticket-action">
                    {isAdmin && <label>
                      <span>
                        {updatingId === ticket.id
                          ? "กำลังบันทึก…"
                          : "อัปเดตสถานะ"}
                      </span>
                      <select
                        value={ticket.status}
                        disabled={updatingId === ticket.id}
                        onChange={(event) =>
                          void handleStatusChange(
                            ticket.id,
                            event.target.value as TicketStatus,
                          )
                        }
                      >
                        <option value="waiting">รอรับเรื่อง</option>
                        <option value="in_progress">กำลังดำเนินการ</option>
                        <option value="done">เสร็จสิ้น</option>
                      </select>
                    </label>}
                    <button
                      className="chat-button"
                      onClick={() => setActiveChatTicket(ticket)}
                    >
                      <span>•••</span> เปิดแชต
                    </button>
                    {isAdmin && ticket.status === "done" && (
                      <button
                        className="archive-ticket-button"
                        disabled={archivingId === ticket.id}
                        onClick={() => void handleArchive(ticket.id)}
                      >
                        {archivingId === ticket.id
                          ? "กำลังเก็บ…"
                          : "⌫ ลบและเก็บสำรอง"}
                      </button>
                    )}
                  </div>
                </article>
              ))}

              {!isLoading && filteredTickets.length === 0 && (
                <div className="empty-state">
                  <span>⌕</span>
                  <h3>ไม่พบคำขอ</h3>
                  <p>ลองเปลี่ยนคำค้นหา แผนก หรือสถานะ</p>
                </div>
              )}
            </div>
          </div>

          {isAdmin && <aside className="department-panel" id="departments">
            <div className="section-heading">
              <div>
                <span className="eyebrow">ภาพรวม</span>
                <h2>คำขอแยกตามแผนก</h2>
              </div>
            </div>

            <div className="department-list">
              {departmentNames.slice(1).map((department, index) => {
                const total = activeTickets.filter(
                  (ticket) => ticket.department === department,
                ).length;
                const palette = ["blue", "violet", "orange", "green"][
                  index % 4
                ];

                return (
                  <button
                    key={department}
                    onClick={() => {
                      setActiveDepartment(department);
                      document
                        .getElementById("requests")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    <span className={`department-icon ${palette}`}>
                      {department.replace("ฝ่าย", "").charAt(0)}
                    </span>
                    <span>
                      <strong>{department}</strong>
                      <small>{total} คำขอ</small>
                    </span>
                    <i>
                      <b style={{ width: `${Math.max(total * 20, 8)}%` }} />
                    </i>
                    <span>›</span>
                  </button>
                );
              })}
            </div>

            <div className="sla-card">
              <span className="sla-ring">
                <strong>92%</strong>
              </span>
              <div>
                <small>การแก้ไขตามเวลา</small>
                <strong>อยู่ในเกณฑ์ดี</strong>
                <p>เฉลี่ย 2 ชม. 18 นาที</p>
              </div>
            </div>
          </aside>}
        </section>
      </section>
      )}

      {isAdmin && activeView === "statistics" && (
        <StatisticsPage
          tickets={tickets}
          isLoading={isLoading}
          errorMessage={pageError}
        />
      )}

      {isAdmin && activeView === "archive" && (
        <ArchivePage
          tickets={archivedTickets}
          isLoading={isLoading}
          errorMessage={pageError}
          restoringId={restoringId}
          deletingId={deletingId}
          onRestore={(id) => void handleRestore(id)}
          onDelete={(id) => void handlePermanentDelete(id)}
          onOpenChat={setActiveChatTicket}
        />
      )}

      {isAdmin && activeView === "users" && (
        <UserManagementPage
          currentProfile={profile}
          departments={departments}
          onDepartmentCreated={(department) =>
            setDepartments((current) =>
              [...current, department].sort((left, right) =>
                left.name.localeCompare(right.name, "th"),
              ),
            )
          }
        />
      )}

      {isFormOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeRequestForm();
          }}
        >
          <section
            className="request-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-form-title"
          >
            <button
              className="close-button"
              onClick={closeRequestForm}
              aria-label="ปิดฟอร์ม"
            >
              ×
            </button>

            {submittedCode ? (
              <div className="success-view">
                <span className="success-check">✓</span>
                <span className="eyebrow">ส่งคำขอสำเร็จ</span>
                <h2>ทีม IT รับเรื่องแล้ว</h2>
                <p>
                  เลขคำขอของคุณคือ <strong>{submittedCode}</strong>
                  <br />
                  สามารถติดตามสถานะได้จากหน้ารายการ
                </p>
                <button
                  className="primary-button"
                  onClick={closeRequestForm}
                >
                  กลับไปหน้ารายการ
                </button>
              </div>
            ) : (
              <>
                <div className="modal-heading">
                  <span className="eyebrow">แจ้งปัญหา IT</span>
                  <h2 id="request-form-title">ส่งคำขอใหม่</h2>
                  <p>
                    กรอกรายละเอียดให้ครบ เพื่อให้ทีม IT ช่วยเหลือคุณได้เร็วขึ้น
                  </p>
                </div>

                <form onSubmit={handleSubmit}>
                  <div className="form-grid">
                    <div className="requester-profile-summary full-width">
                      <span className="avatar">{profile.fullName.charAt(0)}</span>
                      <span>
                        <small>ส่งคำขอในชื่อ</small>
                        <strong>{profile.fullName}</strong>
                        <b>{profile.email} · {profile.department ?? "ยังไม่ระบุแผนก"}</b>
                      </span>
                      <i>ข้อมูลผู้แจ้งถูกล็อกจากบัญชี Login</i>
                    </div>
                    <label>
                      <span>ประเภทปัญหา *</span>
                      <select name="category" required defaultValue="">
                        <option value="" disabled>
                          เลือกประเภท
                        </option>
                        <option>คอมพิวเตอร์และอุปกรณ์</option>
                        <option>โปรแกรมและระบบ</option>
                        <option>อินเทอร์เน็ตและเครือข่าย</option>
                        <option>เครื่องพิมพ์</option>
                        <option>บัญชีผู้ใช้และรหัสผ่าน</option>
                        <option>อื่น ๆ</option>
                      </select>
                    </label>

                    <fieldset className="full-width priority-fieldset">
                      <legend>ระดับความเร่งด่วน *</legend>
                      <div className="priority-options">
                        <label>
                          <input
                            type="radio"
                            name="priority"
                            value="urgent"
                          />
                          <span>
                            <i className="red" /> เร่งด่วน
                            <small>งานหยุดชะงัก</small>
                          </span>
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="priority"
                            value="normal"
                            defaultChecked
                          />
                          <span>
                            <i className="yellow" /> ปกติ
                            <small>ยังพอทำงานได้</small>
                          </span>
                        </label>
                        <label>
                          <input type="radio" name="priority" value="low" />
                          <span>
                            <i className="green" /> ไม่เร่งด่วน
                            <small>คำถามทั่วไป</small>
                          </span>
                        </label>
                      </div>
                    </fieldset>

                    <label className="full-width">
                      <span>หัวข้อ *</span>
                      <input
                        name="subject"
                        required
                        minLength={3}
                        maxLength={120}
                        placeholder="สรุปปัญหาสั้น ๆ"
                      />
                    </label>
                    <label className="full-width">
                      <span>รายละเอียด *</span>
                      <textarea
                        name="detail"
                        required
                        minLength={3}
                        maxLength={3000}
                        rows={4}
                        placeholder="อธิบายสิ่งที่เกิดขึ้น ข้อความแจ้งเตือน และเวลาที่เริ่มพบปัญหา"
                      />
                    </label>
                    <div className="full-width request-image-field">
                      <span>รูปประกอบ (ถ้ามี)</span>
                      <input
                        name="image"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleRequestImageChange}
                      />
                      <small>รองรับ JPG, PNG, WEBP หรือ GIF ขนาดไม่เกิน 5 MB</small>
                      {requestImagePreview && (
                        <span className="request-image-preview">
                          <img src={requestImagePreview} alt="ตัวอย่างรูปที่จะส่ง" />
                          <button
                            type="button"
                            onClick={(event) => {
                              const input = event.currentTarget
                                .closest(".request-image-field")
                                ?.querySelector<HTMLInputElement>('input[type="file"]');
                              if (input) input.value = "";
                              setRequestImagePreview((current) => {
                                if (current) URL.revokeObjectURL(current);
                                return "";
                              });
                            }}
                          >
                            ลบรูป
                          </button>
                        </span>
                      )}
                    </div>
                  </div>

                  {formError && (
                    <p className="notice error-notice">{formError}</p>
                  )}

                  <div className="form-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={closeRequestForm}
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "กำลังส่ง…" : "ส่งคำขอ"} <span>→</span>
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      )}

      {activeChatTicket && (
        <ChatDrawer
          ticket={activeChatTicket}
          currentUserId={session.user.id}
          currentUserEmail={userEmail}
          onClose={() => setActiveChatTicket(null)}
        />
      )}

      <NotificationCenter
        userId={profile.id}
        onOpenRequest={(requestId) =>
          void handleOpenNotificationRequest(requestId)
        }
      />
    </main>
  );
}

export default App;
