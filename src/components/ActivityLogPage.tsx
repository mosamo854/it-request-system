import { useEffect, useMemo, useState } from "react";
import {
  getActivityLogs,
  subscribeToActivityLogs,
} from "../services/activityLogService";
import {
  downloadCsv,
  formatExportDate,
  makeExportFilename,
} from "../services/reportExportService";
import type { ActivityAction, ActivityLog } from "../types/activityLog";

interface ActivityLogPageProps {
  onOpenRequest: (requestId: string) => void;
  canExport: boolean;
  canOpenRequests: boolean;
}

const actionMeta: Record<
  ActivityAction,
  { label: string; icon: string; tone: string }
> = {
  request_created: { label: "สร้างคำขอ", icon: "+", tone: "blue" },
  request_assigned: { label: "มอบหมายงาน", icon: "→", tone: "cyan" },
  status_changed: { label: "เปลี่ยนสถานะ", icon: "↻", tone: "purple" },
  request_archived: { label: "เก็บสำรอง", icon: "▣", tone: "orange" },
  request_restored: { label: "กู้คืนคำขอ", icon: "↥", tone: "green" },
  request_deleted: { label: "ลบถาวร", icon: "×", tone: "red" },
  request_auto_deleted: { label: "ลบอัตโนมัติ", icon: "◷", tone: "slate" },
  department_created: { label: "เพิ่มแผนก", icon: "◇", tone: "cyan" },
  user_created: { label: "เพิ่มผู้ใช้", icon: "♙", tone: "green" },
  user_updated: { label: "แก้ไขผู้ใช้", icon: "✎", tone: "purple" },
  admin_access_updated: { label: "กำหนดสิทธิ์ Admin", icon: "◆", tone: "purple" },
};

const actionOptions: Array<["all" | ActivityAction, string]> = [
  ["all", "ทุกกิจกรรม"],
  ["request_created", "สร้างคำขอ"],
  ["request_assigned", "มอบหมายงาน"],
  ["status_changed", "เปลี่ยนสถานะ"],
  ["request_archived", "เก็บสำรอง"],
  ["request_restored", "กู้คืนคำขอ"],
  ["request_deleted", "ลบถาวร"],
  ["request_auto_deleted", "ลบอัตโนมัติ"],
  ["department_created", "เพิ่มแผนก"],
  ["user_created", "เพิ่มผู้ใช้"],
  ["user_updated", "แก้ไขผู้ใช้"],
  ["admin_access_updated", "กำหนดสิทธิ์ Admin"],
];

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
  return "โหลดประวัติการดำเนินการไม่สำเร็จ";
}

function getBangkokDateKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value instanceof Date ? value : new Date(value));
}

function activityMatchesQuery(activity: ActivityLog, query: string) {
  if (!query) return true;
  return [
    activity.actorName,
    activity.actorEmail,
    activity.requestCode,
    activity.description,
    actionMeta[activity.action].label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("th")
    .includes(query);
}

export default function ActivityLogPage({
  onOpenRequest,
  canExport,
  canOpenRequests,
}: ActivityLogPageProps) {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<"all" | ActivityAction>(
    "all",
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadActivities(refresh = false) {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMessage("");

    try {
      setActivities(await getActivityLogs());
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadActivities();
    const unsubscribe = subscribeToActivityLogs((activity) => {
      setActivities((current) => [
        activity,
        ...current.filter((item) => item.id !== activity.id),
      ].slice(0, 300));
    });

    return unsubscribe;
  }, []);

  const normalizedQuery = query.trim().toLocaleLowerCase("th");
  const filteredActivities = useMemo(
    () =>
      activities.filter(
        (activity) =>
          (actionFilter === "all" || activity.action === actionFilter) &&
          activityMatchesQuery(activity, normalizedQuery),
      ),
    [actionFilter, activities, normalizedQuery],
  );

  const summary = useMemo(() => {
    const today = getBangkokDateKey(new Date());
    return {
      today: activities.filter(
        (activity) => getBangkokDateKey(activity.createdAt) === today,
      ).length,
      requests: activities.filter(
        (activity) => activity.entityType === "request",
      ).length,
      users: activities.filter((activity) => activity.entityType === "user")
        .length,
      systemDeletes: activities.filter(
        (activity) => activity.action === "request_auto_deleted",
      ).length,
    };
  }, [activities]);

  function handleExport() {
    const rows: Array<Array<string | number>> = [
      ["รายงานประวัติการดำเนินการ"],
      ["ส่งออกเมื่อ", formatExportDate(new Date())],
      ["จำนวนรายการ", filteredActivities.length],
      [],
      [
        "วันเวลา",
        "กิจกรรม",
        "เลขคำขอ",
        "รายละเอียด",
        "ผู้ดำเนินการ",
        "อีเมลผู้ดำเนินการ",
        "ประเภทข้อมูล",
      ],
      ...filteredActivities.map((activity) => [
        formatExportDate(activity.createdAt),
        actionMeta[activity.action].label,
        activity.requestCode ?? "",
        activity.description,
        activity.actorName ?? "ระบบอัตโนมัติ",
        activity.actorEmail ?? "",
        activity.entityType,
      ]),
    ];
    downloadCsv(makeExportFilename("request-activity-log"), rows);
  }

  return (
    <section className="content subpage-content activity-page" id="activity-top">
      <header className="subpage-header activity-page-header">
        <div className="mobile-brand">RC</div>
        <div>
          <span className="eyebrow">Audit Trail</span>
          <h1>ประวัติการดำเนินการ</h1>
          <p>ตรวจสอบว่าใครทำอะไรกับระบบและดำเนินการเมื่อใด</p>
        </div>
        <div className="activity-header-actions">
          <button
            className="secondary-export-button"
            type="button"
            disabled={isRefreshing}
            onClick={() => void loadActivities(true)}
          >
            {isRefreshing ? "กำลังโหลด…" : "↻ โหลดใหม่"}
          </button>
          {canExport && <button
            className="export-report-button"
            type="button"
            disabled={filteredActivities.length === 0}
            onClick={handleExport}
          >
            <span>⇩</span> Export CSV
          </button>}
        </div>
      </header>

      <section className="activity-summary" aria-label="สรุปประวัติ">
        <article><small>กิจกรรมวันนี้</small><strong>{summary.today}</strong><span>รายการ</span></article>
        <article><small>เกี่ยวกับคำขอ</small><strong>{summary.requests}</strong><span>จาก 300 รายการล่าสุด</span></article>
        <article><small>จัดการผู้ใช้</small><strong>{summary.users}</strong><span>สร้างและแก้ไข</span></article>
        <article><small>ระบบลบอัตโนมัติ</small><strong>{summary.systemDeletes}</strong><span>ครบกำหนด 7 วัน</span></article>
      </section>

      <section className="activity-panel">
        <div className="activity-toolbar">
          <label className="activity-search">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาผู้ดำเนินการ เลขคำขอ หรือรายละเอียด"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="ล้างคำค้นหา">×</button>
            )}
          </label>
          <select
            value={actionFilter}
            onChange={(event) =>
              setActionFilter(event.target.value as "all" | ActivityAction)
            }
            aria-label="กรองประเภทกิจกรรม"
          >
            {actionOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <span className="activity-result-count">
            {filteredActivities.length} รายการ
          </span>
        </div>

        {errorMessage && (
          <div className="activity-error">
            <strong>โหลดประวัติไม่สำเร็จ</strong>
            <p>{errorMessage}</p>
            <small>ตรวจสอบว่า Run setup_activity_logs.sql แล้ว</small>
          </div>
        )}

        {isLoading && (
          <div className="activity-empty-state">
            <i className="um-button-spinner" />
            <p>กำลังโหลดประวัติ…</p>
          </div>
        )}

        {!isLoading && !errorMessage && filteredActivities.length === 0 && (
          <div className="activity-empty-state">
            <span>⌕</span>
            <h2>ไม่พบประวัติที่ตรงกัน</h2>
            <p>ลองเปลี่ยนคำค้นหาหรือประเภทกิจกรรม</p>
          </div>
        )}

        {!isLoading && !errorMessage && filteredActivities.length > 0 && (
          <div className="activity-list">
            {filteredActivities.map((activity) => {
              const meta = actionMeta[activity.action];
              return (
                <article className="activity-item" key={activity.id}>
                  <span className={`activity-icon activity-${meta.tone}`}>
                    {meta.icon}
                  </span>
                  <div className="activity-item-main">
                    <div className="activity-item-title">
                      <strong>{meta.label}</strong>
                      {activity.requestCode && <b>{activity.requestCode}</b>}
                    </div>
                    <p>{activity.description}</p>
                    <span className="activity-actor">
                      <i>{(activity.actorName ?? "ร").charAt(0)}</i>
                      <span>
                        <strong>{activity.actorName ?? "ระบบอัตโนมัติ"}</strong>
                        {activity.actorEmail && <small>{activity.actorEmail}</small>}
                      </span>
                    </span>
                  </div>
                  <div className="activity-item-side">
                    <time dateTime={activity.createdAt}>
                      {formatExportDate(activity.createdAt)}
                    </time>
                    {canOpenRequests && activity.requestId && (
                      <button
                        type="button"
                        onClick={() => onOpenRequest(activity.requestId!)}
                      >
                        เปิดคำขอ →
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
