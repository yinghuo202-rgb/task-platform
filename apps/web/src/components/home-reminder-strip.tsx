"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CalendarClock, ChevronRight, ListPlus, NotebookPen } from "lucide-react";
import { apiFetch } from "@/lib/api";

type NotificationSummary = {
  id: string;
  type: string;
  title: string;
  content: string;
  readAt: string | null;
  createdAt: string;
};

export type UpcomingSchedule = {
  title: string;
  startsAt: Date;
};

type ReminderItem = {
  id: string;
  kind: "schedule" | "journal" | "task" | "notice";
  text: string;
  detail: string;
};

export function HomeReminderStrip({ upcoming }: { upcoming?: UpcomingSchedule | null }) {
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<NotificationSummary[]>("/notifications?pageSize=12");
      setNotifications(response.data);
      setUnread(typeof response.meta?.unread === "number" ? response.meta.unread : response.data.filter((item) => !item.readAt).length);
    } catch {
      // The calendar remains usable when the lightweight reminder refresh is unavailable.
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  const reminders = useMemo(() => buildReminderItems(upcoming, notifications), [notifications, upcoming]);

  return <Link className="home-reminder-strip" href="/notifications" aria-label="打开即时提醒">
    <span className="home-reminder-label"><span className="home-reminder-bell"><Bell size={16} />{unread > 0 && <i />}</span><strong>即时提醒</strong>{unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}</span>
    <span className="home-reminder-items">
      {reminders.length ? reminders.map((item) => <span className={`home-reminder-item ${item.kind}`} key={item.id}>
        <ReminderIcon kind={item.kind} />
        <span><strong>{item.text}</strong><small>{item.detail}</small></span>
      </span>) : <span className="home-reminder-empty">暂时没有需要处理的提醒</span>}
    </span>
    <ChevronRight className="home-reminder-next" size={18} />
  </Link>;
}

export function buildReminderItems(upcoming: UpcomingSchedule | null | undefined, notifications: NotificationSummary[]): ReminderItem[] {
  const result: ReminderItem[] = [];
  if (upcoming) {
    result.push({ id: "upcoming-schedule", kind: "schedule", text: upcoming.title, detail: scheduleTimeLabel(upcoming.startsAt) });
  }

  const candidates = notifications.filter((item) => !item.readAt).length
    ? notifications.filter((item) => !item.readAt)
    : notifications;
  const picked = new Set<ReminderItem["kind"]>();
  for (const notification of candidates) {
    const kind = notificationKind(notification);
    if (picked.has(kind)) continue;
    picked.add(kind);
    result.push({
      id: notification.id,
      kind,
      text: notification.content || notification.title,
      detail: notification.title,
    });
    if (result.length >= 3) break;
  }
  return result.slice(0, 3);
}

function notificationKind(notification: NotificationSummary): ReminderItem["kind"] {
  if (notification.type === "TASK_PUBLISHED") return "task";
  if (notification.title.includes("手帐")) return "journal";
  return "notice";
}

function ReminderIcon({ kind }: { kind: ReminderItem["kind"] }) {
  if (kind === "schedule") return <CalendarClock size={15} />;
  if (kind === "journal") return <NotebookPen size={15} />;
  if (kind === "task") return <ListPlus size={15} />;
  return <Bell size={15} />;
}

function scheduleTimeLabel(value: Date): string {
  const now = new Date();
  const date = value.toLocaleDateString("zh-CN");
  const today = now.toLocaleDateString("zh-CN");
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toLocaleDateString("zh-CN");
  const prefix = date === today ? "今天" : date === tomorrow ? "明天" : `${value.getMonth() + 1}月${value.getDate()}日`;
  return `${prefix} ${value.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}
