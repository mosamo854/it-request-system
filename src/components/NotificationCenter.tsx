import { useEffect, useMemo, useRef, useState } from "react";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
} from "../services/notificationService";
import type {
  AppNotification,
  NotificationType,
} from "../types/notification";

interface NotificationCenterProps {
  userId: string;
  onOpenRequest: (requestId: string) => void;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "โหลดการแจ้งเตือนไม่สำเร็จ";
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "เมื่อสักครู่";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} นาทีที่แล้ว`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ชั่วโมงที่แล้ว`;

  return date.toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function NotificationIcon({ type }: { type: NotificationType }) {
  if (type === "message_received") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 5h14v10H9l-4 4V5Z" />
        <path d="M8.5 9.5h7M8.5 12.5h4" />
      </svg>
    );
  }

  if (type === "status_changed") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="m8.5 12 2.2 2.2 4.8-5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4h10v16H7z" />
      <path d="M9.5 8h5M9.5 12h5M12 15v3M10.5 16.5h3" />
    </svg>
  );
}

export default function NotificationCenter({
  userId,
  onOpenRequest,
}: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [toast, setToast] = useState<AppNotification | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.readAt).length,
    [notifications],
  );

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setErrorMessage("");

    void getNotifications()
      .then((items) => {
        if (isMounted) setNotifications(items);
      })
      .catch((error) => {
        if (isMounted) setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    const unsubscribe = subscribeToNotifications(userId, {
      onInsert: (notification) => {
        setNotifications((current) => [
          notification,
          ...current.filter((item) => item.id !== notification.id),
        ].slice(0, 40));
        setToast(notification);
        if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => setToast(null), 5000);
      },
      onUpdate: (notification) => {
        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id ? notification : item,
          ),
        );
      },
    });

    return () => {
      isMounted = false;
      unsubscribe();
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, [userId]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        isOpen &&
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function handleOpenNotification(notification: AppNotification) {
    setToast(null);
    setIsOpen(false);

    if (!notification.readAt) {
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, readAt } : item,
        ),
      );
      try {
        await markNotificationRead(notification.id);
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      }
    }

    if (notification.requestId) onOpenRequest(notification.requestId);
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0) return;
    const previous = notifications;
    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) => (item.readAt ? item : { ...item, readAt })),
    );
    setIsMarkingAll(true);
    setErrorMessage("");

    try {
      await markAllNotificationsRead();
    } catch (error) {
      setNotifications(previous);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMarkingAll(false);
    }
  }

  return (
    <div className="notification-center" ref={rootRef}>
      {toast && !isOpen && (
        <button
          className="notification-toast"
          type="button"
          onClick={() => void handleOpenNotification(toast)}
        >
          <span className={`notification-type-icon type-${toast.type}`}>
            <NotificationIcon type={toast.type} />
          </span>
          <span>
            <strong>{toast.title}</strong>
            <small>{toast.body}</small>
          </span>
          <i>เปิดดู</i>
        </button>
      )}

      {isOpen && (
        <section className="notification-panel" aria-label="รายการแจ้งเตือน">
          <header>
            <div>
              <span>NOTIFICATION CENTER</span>
              <h2>การแจ้งเตือน</h2>
              <p>{unreadCount > 0 ? `ยังไม่ได้อ่าน ${unreadCount} รายการ` : "อ่านครบแล้ว"}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={unreadCount === 0 || isMarkingAll}
            >
              {isMarkingAll ? "กำลังบันทึก…" : "อ่านทั้งหมด"}
            </button>
          </header>

          <div className="notification-list">
            {isLoading && (
              <div className="notification-state">
                <i className="um-button-spinner" />
                <p>กำลังโหลดการแจ้งเตือน…</p>
              </div>
            )}

            {!isLoading && errorMessage && (
              <div className="notification-state notification-error-state">
                <span>!</span>
                <h3>โหลดการแจ้งเตือนไม่สำเร็จ</h3>
                <p>{errorMessage}</p>
                <small>ตรวจสอบว่า Run setup_notifications.sql แล้ว</small>
              </div>
            )}

            {!isLoading && !errorMessage && notifications.length === 0 && (
              <div className="notification-state">
                <span>✓</span>
                <h3>ยังไม่มีการแจ้งเตือน</h3>
                <p>รายการใหม่จะแสดงที่นี่แบบอัตโนมัติ</p>
              </div>
            )}

            {!isLoading && !errorMessage && notifications.map((notification) => (
              <button
                className={notification.readAt ? "" : "unread"}
                type="button"
                key={notification.id}
                onClick={() => void handleOpenNotification(notification)}
              >
                <span className={`notification-type-icon type-${notification.type}`}>
                  <NotificationIcon type={notification.type} />
                </span>
                <span>
                  <strong>{notification.title}</strong>
                  <p>{notification.body}</p>
                  <time dateTime={notification.createdAt}>
                    {formatNotificationTime(notification.createdAt)}
                  </time>
                </span>
                {!notification.readAt && <i aria-label="ยังไม่ได้อ่าน" />}
              </button>
            ))}
          </div>
        </section>
      )}

      <button
        className={`notification-bell ${isOpen ? "active" : ""}`}
        type="button"
        onClick={() => {
          setToast(null);
          setIsOpen((current) => !current);
        }}
        aria-expanded={isOpen}
        aria-label={`การแจ้งเตือน${unreadCount ? `ที่ยังไม่อ่าน ${unreadCount} รายการ` : ""}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6.5 9a5.5 5.5 0 0 1 11 0c0 6 2.5 6.5 2.5 6.5H4S6.5 15 6.5 9Z" />
          <path d="M9.8 19h4.4" />
        </svg>
        {unreadCount > 0 && (
          <span>{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>
    </div>
  );
}
