import { useMemo, useState } from "react";
import {
  downloadCsv,
  formatExportDate,
  makeExportFilename,
} from "../services/reportExportService";
import type { Ticket } from "../types/ticket";

type PeriodMode = "day" | "month" | "year";

interface PeriodStat {
  key: string;
  label: string;
  fullLabel: string;
  total: number;
  waiting: number;
  inProgress: number;
  done: number;
  archived: number;
}

interface StatisticsPageProps {
  tickets: Ticket[];
  isLoading: boolean;
  errorMessage: string;
  canExport: boolean;
}

const BANGKOK_OFFSET = 7 * 60 * 60 * 1000;
const thaiMonths = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

const statusLabels = {
  waiting: "รอรับเรื่อง",
  in_progress: "กำลังดำเนินการ",
  done: "เสร็จสิ้น",
} as const;

const priorityLabels = {
  urgent: "เร่งด่วน",
  normal: "ปกติ",
  low: "ไม่เร่งด่วน",
} as const;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getBangkokParts(value: string | Date) {
  const source = value instanceof Date ? value : new Date(value);
  const date = new Date(source.getTime() + BANGKOK_OFFSET);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

function getPeriodKey(value: string, mode: PeriodMode) {
  const { year, month, day } = getBangkokParts(value);
  if (mode === "year") return String(year);
  if (mode === "month") return `${year}-${pad(month + 1)}`;
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function makePeriods(mode: PeriodMode): PeriodStat[] {
  const now = getBangkokParts(new Date());
  const count = mode === "day" ? 7 : mode === "month" ? 12 : 5;

  return Array.from({ length: count }, (_, index) => {
    const distance = count - index - 1;
    const cursor =
      mode === "day"
        ? new Date(Date.UTC(now.year, now.month, now.day - distance))
        : mode === "month"
          ? new Date(Date.UTC(now.year, now.month - distance, 1))
          : new Date(Date.UTC(now.year - distance, 0, 1));
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const day = cursor.getUTCDate();

    if (mode === "day") {
      return {
        key: `${year}-${pad(month + 1)}-${pad(day)}`,
        label: `${day} ${thaiMonths[month]}`,
        fullLabel: `${day} ${thaiMonths[month]} ${year + 543}`,
        total: 0,
        waiting: 0,
        inProgress: 0,
        done: 0,
        archived: 0,
      };
    }

    if (mode === "month") {
      return {
        key: `${year}-${pad(month + 1)}`,
        label: `${thaiMonths[month]} ${String(year + 543).slice(-2)}`,
        fullLabel: `${thaiMonths[month]} ${year + 543}`,
        total: 0,
        waiting: 0,
        inProgress: 0,
        done: 0,
        archived: 0,
      };
    }

    return {
      key: String(year),
      label: String(year + 543),
      fullLabel: `พ.ศ. ${year + 543}`,
      total: 0,
      waiting: 0,
      inProgress: 0,
      done: 0,
      archived: 0,
    };
  });
}

function TrendChart({ periods }: { periods: PeriodStat[] }) {
  const width = 760;
  const height = 270;
  const margin = { top: 20, right: 20, bottom: 48, left: 42 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(1, ...periods.map((period) => period.total));
  const step = periods.length > 1 ? plotWidth / (periods.length - 1) : 0;
  const x = (index: number) => margin.left + index * step;
  const y = (value: number) =>
    margin.top + plotHeight - (value / maxValue) * plotHeight;
  const totalPoints = periods
    .map((period, index) => `${x(index)},${y(period.total)}`)
    .join(" ");
  const donePoints = periods
    .map((period, index) => `${x(index)},${y(period.done)}`)
    .join(" ");

  return (
    <div className="trend-chart-wrap">
      <div className="chart-legend">
        <span><i className="legend-total" /> คำขอทั้งหมด</span>
        <span><i className="legend-done" /> เสร็จสิ้น</span>
      </div>
      <svg
        className="trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="กราฟแนวโน้มจำนวนคำขอและงานที่เสร็จสิ้น"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const lineY = margin.top + plotHeight - ratio * plotHeight;
          return (
            <g key={ratio}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={lineY}
                y2={lineY}
                className="chart-grid-line"
              />
              <text x={margin.left - 10} y={lineY + 4} className="chart-y-label">
                {Math.round(maxValue * ratio)}
              </text>
            </g>
          );
        })}

        <polyline points={totalPoints} className="chart-line chart-line-total" />
        <polyline points={donePoints} className="chart-line chart-line-done" />

        {periods.map((period, index) => (
          <g key={period.key}>
            <circle cx={x(index)} cy={y(period.total)} r="5" className="chart-dot-total">
              <title>{`${period.fullLabel}: ทั้งหมด ${period.total} คำขอ`}</title>
            </circle>
            <circle cx={x(index)} cy={y(period.done)} r="4" className="chart-dot-done">
              <title>{`${period.fullLabel}: เสร็จสิ้น ${period.done} คำขอ`}</title>
            </circle>
            <text x={x(index)} y={height - 18} className="chart-x-label">
              {period.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function StatisticsPage({
  tickets,
  isLoading,
  errorMessage,
  canExport,
}: StatisticsPageProps) {
  const [mode, setMode] = useState<PeriodMode>("day");

  const periods = useMemo(() => {
    const nextPeriods = makePeriods(mode);
    const byKey = new Map(nextPeriods.map((period) => [period.key, period]));

    tickets.forEach((ticket) => {
      const period = byKey.get(getPeriodKey(ticket.createdAt, mode));
      if (!period) return;
      period.total += 1;
      if (ticket.status === "waiting") period.waiting += 1;
      if (ticket.status === "in_progress") period.inProgress += 1;
      if (ticket.status === "done") period.done += 1;
      if (ticket.archivedAt) period.archived += 1;
    });

    return nextPeriods;
  }, [mode, tickets]);

  const summary = useMemo(
    () =>
      periods.reduce(
        (result, period) => ({
          total: result.total + period.total,
          waiting: result.waiting + period.waiting,
          inProgress: result.inProgress + period.inProgress,
          done: result.done + period.done,
          archived: result.archived + period.archived,
        }),
        { total: 0, waiting: 0, inProgress: 0, done: 0, archived: 0 },
      ),
    [periods],
  );

  const departmentStats = useMemo(() => {
    const keys = new Set(periods.map((period) => period.key));
    const counts = new Map<string, number>();
    tickets.forEach((ticket) => {
      if (!keys.has(getPeriodKey(ticket.createdAt, mode))) return;
      counts.set(
        ticket.targetDepartment,
        (counts.get(ticket.targetDepartment) ?? 0) + 1,
      );
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [mode, periods, tickets]);

  const rangeTickets = useMemo(() => {
    const keys = new Set(periods.map((period) => period.key));
    return tickets.filter((ticket) =>
      keys.has(getPeriodKey(ticket.createdAt, mode)),
    );
  }, [mode, periods, tickets]);

  const completionRate = summary.total
    ? Math.round((summary.done / summary.total) * 100)
    : 0;
  const rangeLabel =
    mode === "day" ? "7 วันล่าสุด" : mode === "month" ? "12 เดือนล่าสุด" : "5 ปีล่าสุด";
  const maxDepartment = Math.max(1, ...departmentStats.map(([, total]) => total));

  function handleExportReport() {
    const rows: Array<Array<string | number>> = [
      ["รายงานสถิติคำขอภายในองค์กร"],
      ["ช่วงรายงาน", rangeLabel],
      ["ส่งออกเมื่อ", formatExportDate(new Date())],
      ["คำขอทั้งหมด", summary.total],
      ["รอรับเรื่อง", summary.waiting],
      ["กำลังดำเนินการ", summary.inProgress],
      ["เสร็จสิ้น", summary.done],
      ["คลังสำรอง", summary.archived],
      ["อัตราสำเร็จ", `${completionRate}%`],
      [],
      [
        "ช่วงเวลา",
        "ทั้งหมด",
        "รอรับเรื่อง",
        "กำลังดำเนินการ",
        "เสร็จสิ้น",
        "คลังสำรอง",
      ],
      ...[...periods].reverse().map((period) => [
        period.fullLabel,
        period.total,
        period.waiting,
        period.inProgress,
        period.done,
        period.archived,
      ]),
      [],
      [
        "เลขคำขอ",
        "วันที่แจ้ง",
        "ชื่อผู้แจ้ง",
        "อีเมล",
        "แผนกผู้ส่ง",
        "แผนกปลายทาง",
        "ประเภทคำขอ",
        "ความสำคัญ",
        "หัวข้อ",
        "สถานะ",
        "ผู้รับผิดชอบ",
        "คลังสำรอง",
      ],
      ...rangeTickets.map((ticket) => [
        ticket.code,
        formatExportDate(ticket.createdAt),
        ticket.requesterName,
        ticket.requesterEmail,
        ticket.requesterDepartment,
        ticket.targetDepartment,
        ticket.category,
        priorityLabels[ticket.priority],
        ticket.subject,
        statusLabels[ticket.status],
        ticket.assignedToName ?? "ยังไม่ได้มอบหมาย",
        ticket.archivedAt ? "เก็บสำรองแล้ว" : "รายการปัจจุบัน",
      ]),
    ];

    downloadCsv(makeExportFilename(`request-report-${mode}`), rows);
  }

  return (
    <section className="content subpage-content" id="statistics-top">
      <header className="subpage-header">
        <div className="mobile-brand">RC</div>
        <div>
          <span className="eyebrow">Analytics</span>
          <h1>สถิติคำขอภายในองค์กร</h1>
          <p>ติดตามปริมาณงานและผลการดำเนินงานตามช่วงเวลา</p>
        </div>
        <div className="statistics-header-actions">
          <div className="period-tabs" aria-label="เลือกช่วงสถิติ">
            {([
              ["day", "รายวัน"],
              ["month", "รายเดือน"],
              ["year", "รายปี"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                className={mode === value ? "active" : ""}
                onClick={() => setMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {canExport && <button
            className="export-report-button"
            type="button"
            disabled={isLoading}
            onClick={handleExportReport}
          >
            <span>⇩</span> Export รายงาน
          </button>}
        </div>
      </header>

      {errorMessage && <p className="notice error-notice subpage-error">{errorMessage}</p>}

      <div className="statistics-note">
        <span>ช่วงที่แสดง: <strong>{rangeLabel}</strong></span>
        <span>นับตามวันที่สร้างคำขอ และรวมรายการในคลังสำรอง</span>
      </div>

      <section className="analytics-summary" aria-label="สรุปสถิติ">
        <article><small>คำขอทั้งหมด</small><strong>{summary.total}</strong><span>{rangeLabel}</span></article>
        <article><small>เสร็จสิ้น</small><strong>{summary.done}</strong><span>อัตราสำเร็จ {completionRate}%</span></article>
        <article><small>กำลังดำเนินการ</small><strong>{summary.inProgress}</strong><span>รอรับเรื่อง {summary.waiting}</span></article>
        <article><small>คลังสำรอง</small><strong>{summary.archived}</strong><span>ยังเก็บข้อมูลครบถ้วน</span></article>
      </section>

      <section className="analytics-layout">
        <article className="analytics-card trend-card">
          <div className="analytics-card-heading">
            <div>
              <span className="eyebrow">Trend</span>
              <h2>แนวโน้มคำขอ</h2>
            </div>
            <span className="result-count">{rangeLabel}</span>
          </div>
          {isLoading ? <div className="analytics-loading">กำลังโหลดสถิติ…</div> : <TrendChart periods={periods} />}
        </article>

        <aside className="analytics-card department-stats-card">
          <div className="analytics-card-heading">
            <div>
              <span className="eyebrow">Departments</span>
              <h2>แยกตามแผนกปลายทาง</h2>
            </div>
          </div>
          <div className="department-bars">
            {departmentStats.map(([department, total]) => (
              <div key={department}>
                <span><b>{department}</b><small>{total} คำขอ</small></span>
                <i><b style={{ width: `${(total / maxDepartment) * 100}%` }} /></i>
              </div>
            ))}
            {!isLoading && departmentStats.length === 0 && (
              <p className="mini-empty">ยังไม่มีข้อมูลในช่วงนี้</p>
            )}
          </div>
        </aside>
      </section>

      <section className="analytics-card period-table-card">
        <div className="analytics-card-heading">
          <div>
            <span className="eyebrow">Breakdown</span>
            <h2>รายละเอียดแต่ละช่วง</h2>
          </div>
        </div>
        <div className="period-table" role="table" aria-label="รายละเอียดสถิติแต่ละช่วง">
          <div className="period-row period-head" role="row">
            <span>ช่วงเวลา</span><span>ทั้งหมด</span><span>รอรับเรื่อง</span><span>กำลังทำ</span><span>เสร็จสิ้น</span><span>สำรอง</span>
          </div>
          {[...periods].reverse().map((period) => (
            <div className="period-row" role="row" key={period.key}>
              <strong>{period.fullLabel}</strong>
              <span>{period.total}</span>
              <span>{period.waiting}</span>
              <span>{period.inProgress}</span>
              <span>{period.done}</span>
              <span>{period.archived}</span>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
