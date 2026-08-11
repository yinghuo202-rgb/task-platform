"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent, type ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, Check, ChevronLeft, ChevronRight, ListTodo, Plus, Trash2, UserPlus, X } from "lucide-react";
import type { CalendarEvent as PersonalCalendarEvent, CalendarFeedEvent, CalendarSubscriptionOverview, TaskSummary } from "@task-platform/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { personalTaskTimeLabel } from "@/lib/task-time";
import { Button, Field, Input, Textarea } from "./ui";

type CalendarView = "month" | "week" | "day";
type CalendarEntrySummary = { id: string; type: "JOURNAL" | "REVIEW"; title: string; entryDate: string; rating: number | string | null };
type CalendarEntryIndexResponse = { records: CalendarEntrySummary[]; total: number; canImport: boolean };
type CalendarItem = {
  id: string;
  source: "personal" | "subscribed" | "task" | "entry";
  title: string;
  start: Date;
  end: Date;
  color: string;
  description?: string | null;
  task?: TaskSummary;
  event?: CalendarFeedEvent;
  ownerName?: string;
  entry?: CalendarEntrySummary;
  allDay?: boolean;
};
type EventForm = { title: string; description: string; startsAt: string; endsAt: string; color: string };

const weekLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const colors = ["#8f86b7", "#c98f9f", "#79a89b", "#c9a36d", "#7f9db8"];

export function CalendarWorkspace() {
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [view, setView] = useState<CalendarView>("month");
  const [events, setEvents] = useState<CalendarFeedEvent[]>([]);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [journalEntries, setJournalEntries] = useState<CalendarEntrySummary[]>([]);
  const [subscriptions, setSubscriptions] = useState<CalendarSubscriptionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(() => eventFormFor(new Date()));
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [subscriptionBusy, setSubscriptionBusy] = useState("");

  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) setView("day");
  }, []);

  const range = useMemo(() => calendarRange(anchor, view), [anchor, view]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [eventResponse, taskResponse, entryResponse] = await Promise.all([
        apiFetch<CalendarFeedEvent[]>(`/calendar/feed?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`),
        apiFetch<TaskSummary[]>("/tasks?scope=assigned&pageSize=100"),
        apiFetch<CalendarEntryIndexResponse>(`/entries?view=index&limit=5000&from=${localDateKey(range.from)}&to=${localDateKey(range.to)}`),
      ]);
      setEvents(eventResponse.data);
      setTasks(taskResponse.data);
      setJournalEntries(entryResponse.data.records);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "日历加载失败");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { void load(); }, [load]);

  const loadSubscriptions = useCallback(async () => {
    try {
      const response = await apiFetch<CalendarSubscriptionOverview>("/calendar/subscriptions");
      setSubscriptions(response.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "订阅信息加载失败");
    }
  }, []);

  useEffect(() => { void loadSubscriptions(); }, [loadSubscriptions]);

  const items = useMemo<CalendarItem[]>(() => [
    ...events.map((event) => ({ id: event.id, source: event.editable ? "personal" as const : "subscribed" as const, title: event.title, start: new Date(event.startsAt), end: new Date(event.endsAt), color: event.color, description: event.description, event, ownerName: event.owner.displayName })),
    ...tasks.flatMap((task) => {
      const dueValue = task.personalDueAt ?? task.deadline;
      if (!dueValue || task.personalAssignmentStatus === "COMPLETED" || task.personalAssignmentStatus === "CANCELLED") return [];
      const dueAt = new Date(dueValue);
      return [{ id: `task-${task.id}`, source: "task" as const, title: task.title, start: dueAt, end: new Date(dueAt.getTime() + 45 * 60_000), color: task.project.color, task }];
    }),
    ...journalEntries.map((entry) => {
      const start = new Date(`${entry.entryDate.slice(0, 10)}T00:00:00`);
      return { id: `entry-${entry.id}`, source: "entry" as const, title: entry.title, start, end: addDays(start, 1), color: entry.type === "REVIEW" ? "#9b91b4" : "#86aa9e", entry, allDay: true };
    }),
  ].sort((left, right) => left.start.getTime() - right.start.getTime()), [events, journalEntries, tasks]);

  const selectedItems = useMemo(() => items.filter((item) => occursOn(item, selectedDate)), [items, selectedDate]);
  const unscheduledTasks = useMemo(() => tasks.filter((task) => !task.personalDueAt && !task.deadline && task.personalAssignmentStatus !== "COMPLETED" && task.personalAssignmentStatus !== "CANCELLED"), [tasks]);

  const openCreate = (date = selectedDate) => {
    setEditingId(null);
    setConfirmingDelete(false);
    setForm(eventFormFor(date));
    setEditorOpen(true);
  };
  const openEdit = (event: PersonalCalendarEvent) => {
    setEditingId(event.id);
    setConfirmingDelete(false);
    setForm({ title: event.title, description: event.description ?? "", startsAt: toLocalInput(new Date(event.startsAt)), endsAt: toLocalInput(new Date(event.endsAt)), color: event.color });
    setEditorOpen(true);
  };

  const runSubscriptionAction = async (key: string, action: () => Promise<unknown>) => {
    setSubscriptionBusy(key);
    setError("");
    try {
      await action();
      await Promise.all([loadSubscriptions(), load()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "订阅操作失败");
    } finally {
      setSubscriptionBusy("");
    }
  };

  const saveEvent = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    const startsAt = new Date(form.startsAt);
    const endsAt = new Date(form.endsAt);
    if (!form.title.trim()) return setError("请填写日程名称");
    if (startsAt >= endsAt) return setError("结束时间需要晚于开始时间");
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/calendar/events${editingId ? `/${editingId}` : ""}`, {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({ title: form.title, description: form.description, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), color: form.color, allDay: false }),
      });
      setEditorOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "日程保存失败");
    } finally {
      setSaving(false);
    }
  };

  const removeEvent = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await apiFetch(`/calendar/events/${editingId}`, { method: "DELETE" });
      setEditorOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "日程删除失败");
    } finally {
      setSaving(false);
    }
  };

  const moveEvent = async (event: PersonalCalendarEvent, dayDelta: number, minuteDelta: number) => {
    const startsAt = shiftCalendarTime(new Date(event.startsAt), dayDelta, minuteDelta);
    const endsAt = shiftCalendarTime(new Date(event.endsAt), dayDelta, minuteDelta);
    if (startsAt >= endsAt) return;
    setError("");
    setEvents((current) => current.map((item) => item.id === event.id ? { ...item, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() } : item));
    try {
      await apiFetch(`/calendar/events/${event.id}`, { method: "PATCH", body: JSON.stringify({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }) });
    } catch (err) {
      setEvents((current) => current.map((item) => item.id === event.id ? { ...item, startsAt: event.startsAt, endsAt: event.endsAt } : item));
      setError(err instanceof ApiError ? err.message : "日程移动失败");
    }
  };

  const navigate = (direction: number) => setAnchor((current) => view === "month"
    ? new Date(current.getFullYear(), current.getMonth() + direction, 1)
    : addDays(current, direction * (view === "day" ? 1 : 7)));
  const goToday = () => { const today = new Date(); setAnchor(today); setSelectedDate(startOfDay(today)); };

  return <div className="calendar-page">
    <header className="calendar-page-header">
      <div><span className="eyebrow">LA VIE · TODAY</span><h1>日历</h1><p>把自己的安排、两个人的日子和要完成的事情放在一起。</p></div>
      <div className="calendar-header-actions"><Button className="secondary" onClick={() => setSubscriptionOpen(true)}><UserPlus size={17} />订阅日历{(subscriptions?.incoming.filter((item) => item.status === "PENDING").length ?? 0) > 0 && <b>{subscriptions!.incoming.filter((item) => item.status === "PENDING").length}</b>}</Button><Button onClick={() => openCreate()}><Plus size={17} />新建日程</Button></div>
    </header>
    <section className="calendar-surface">
      <div className="calendar-toolbar">
        <div className="calendar-navigation"><button onClick={goToday}>今天</button><button aria-label="上一段时间" onClick={() => navigate(-1)}><ChevronLeft size={18} /></button><button aria-label="下一段时间" onClick={() => navigate(1)}><ChevronRight size={18} /></button><h2>{rangeLabel(anchor, view)}</h2></div>
        <div className="calendar-view-tabs" role="tablist" aria-label="日历视图"><button className={view === "month" ? "active" : ""} aria-selected={view === "month"} role="tab" onClick={() => setView("month")}>月</button><button className={view === "week" ? "active" : ""} aria-selected={view === "week"} role="tab" onClick={() => setView("week")}>周</button><button className={view === "day" ? "active" : ""} aria-selected={view === "day"} role="tab" onClick={() => setView("day")}>日</button></div>
      </div>
      {error && <div className="form-message calendar-message" role="alert">{error}</div>}
      <div className="calendar-content">
        <div className="calendar-main">
          {loading ? <div className="calendar-loading">正在同步你的时间安排…</div> : view === "month"
            ? <MonthCalendar anchor={anchor} items={items} selectedDate={selectedDate} onSelect={(date) => setSelectedDate(startOfDay(date))} onCreate={(date) => openCreate(date)} onEdit={openEdit} />
            : <WeekCalendar mode={view} anchor={anchor} items={items} selectedDate={selectedDate} onSelect={(date) => setSelectedDate(startOfDay(date))} onCreate={(date) => openCreate(date)} onEdit={openEdit} onMove={(event, dayDelta, minuteDelta) => void moveEvent(event, dayDelta, minuteDelta)} />}
        </div>
        <aside className="calendar-agenda">
          <div className="calendar-agenda-date"><span>{weekLabels[(selectedDate.getDay() + 6) % 7]}</span><strong>{selectedDate.getDate()}</strong><small>{selectedDate.getMonth() + 1} 月</small></div>
          <div className="calendar-agenda-heading"><div><h3>{isToday(selectedDate) ? "今天的安排" : "当天安排"}</h3><p>{selectedItems.length ? `${selectedItems.length} 项日程` : "给自己留一点空白"}</p></div><button aria-label="在当天新建日程" onClick={() => openCreate(selectedDate)}><Plus size={17} /></button></div>
          <div className="calendar-agenda-list">{selectedItems.length ? selectedItems.map((item) => <CalendarAgendaItem item={item} onEdit={openEdit} key={item.id} />) : <div className="calendar-agenda-empty"><CalendarDays size={24} /><span>当天还没有安排</span></div>}</div>
          {unscheduledTasks.length > 0 && <div className="unscheduled-orders"><h3><ListTodo size={17} />待安排的事情</h3>{unscheduledTasks.slice(0, 4).map((task) => <Link href={`/tasks/${task.id}`} key={task.id}><i style={{ background: task.project.color }} /><span><strong>{task.title}</strong><small>还没有安排时间</small></span></Link>)}</div>}
          <div className="calendar-legend"><span><i className="personal" />我的日程</span><span><i className="subscribed" />共享日程</span><span><i className="order" />清单</span><span><i className="entry" />手帐</span></div>
        </aside>
      </div>
    </section>
    {editorOpen && <div className="calendar-dialog-backdrop">
      <section className="calendar-dialog" role="dialog" aria-modal="true" aria-labelledby="calendar-dialog-title">
        <header><div><span className="eyebrow">PERSONAL SCHEDULE</span><h2 id="calendar-dialog-title">{editingId ? "编辑日程" : "新建日程"}</h2></div><button aria-label="关闭" onClick={() => setEditorOpen(false)}><X size={20} /></button></header>
        <form className="form-stack" onSubmit={(event) => void saveEvent(event)}>
          <Field label="日程名称" required><Input autoFocus maxLength={120} placeholder="例如：一起去逛花市" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field>
          <div className="form-grid"><Field label="开始时间" required><Input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></Field><Field label="结束时间" required><Input type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></Field></div>
          <Field label="备注"><Textarea maxLength={1000} placeholder="补充地点、准备事项或提醒" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
          <fieldset className="calendar-color-field"><legend>日程颜色</legend><div>{colors.map((color) => <button aria-label={`选择颜色 ${color}`} aria-pressed={form.color === color} className={form.color === color ? "active" : ""} key={color} onClick={() => setForm({ ...form, color })} style={{ background: color }} type="button" />)}</div></fieldset>
          <div className="calendar-dialog-actions">{editingId && <Button aria-pressed={confirmingDelete} className="danger" disabled={saving} onClick={() => confirmingDelete ? void removeEvent() : setConfirmingDelete(true)} type="button"><Trash2 size={16} />{confirmingDelete ? "再次点击，确认删除" : "删除"}</Button>}<span /><Button className="secondary" onClick={() => { setConfirmingDelete(false); setEditorOpen(false); }} type="button">取消</Button><Button disabled={saving} type="submit">{saving ? "保存中…" : "保存日程"}</Button></div>
        </form>
      </section>
    </div>}
    {subscriptionOpen && <SubscriptionDialog
      busy={subscriptionBusy}
      overview={subscriptions}
      onClose={() => setSubscriptionOpen(false)}
      onRequest={(ownerId) => void runSubscriptionAction(`request-${ownerId}`, () => apiFetch(`/calendar/subscriptions/${ownerId}`, { method: "POST" }))}
      onRespond={(id, action) => void runSubscriptionAction(`${action}-${id}`, () => apiFetch(`/calendar/subscriptions/${id}/respond`, { method: "PATCH", body: JSON.stringify({ action }) }))}
      onCancel={(id) => void runSubscriptionAction(`cancel-${id}`, () => apiFetch(`/calendar/subscriptions/${id}`, { method: "DELETE" }))}
    />}
  </div>;
}

function SubscriptionDialog({ busy, overview, onClose, onRequest, onRespond, onCancel }: {
  busy: string;
  overview: CalendarSubscriptionOverview | null;
  onClose: () => void;
  onRequest: (ownerId: string) => void;
  onRespond: (id: string, action: "APPROVE" | "REJECT") => void;
  onCancel: (id: string) => void;
}) {
  const pending = overview?.incoming.filter((item) => item.status === "PENDING") ?? [];
  const subscribed = overview?.outgoing.filter((item) => item.status === "APPROVED") ?? [];
  const viewers = overview?.incoming.filter((item) => item.status === "APPROVED") ?? [];
  return <div className="calendar-dialog-backdrop">
    <section className="calendar-dialog subscription-dialog" role="dialog" aria-modal="true" aria-labelledby="subscription-dialog-title">
      <header><div><span className="eyebrow">SHARED CALENDAR</span><h2 id="subscription-dialog-title">订阅日历</h2><p>订阅申请通过后，对方的个人日程会叠加在你的日历中。</p></div><button aria-label="关闭订阅日历" onClick={onClose}><X size={20} /></button></header>
      {!overview ? <div className="subscription-empty">正在加载空间成员…</div> : <div className="subscription-sections">
        {pending.length > 0 && <section><h3>待处理申请 <b>{pending.length}</b></h3><div className="subscription-list">{pending.map((item) => <div className="subscription-row featured" key={item.id}><MemberIdentity user={item.subscriber!} /><div className="subscription-actions"><Button className="secondary small" disabled={!!busy} onClick={() => onRespond(item.id, "REJECT")}>拒绝</Button><Button className="small" disabled={!!busy} onClick={() => onRespond(item.id, "APPROVE")}><Check size={15} />同意</Button></div></div>)}</div></section>}
        <section><h3>可订阅的空间成员</h3><div className="subscription-list">{overview.candidates.length ? overview.candidates.map((candidate) => {
          const request = candidate.subscription;
          const approved = request?.status === "APPROVED";
          const waiting = request?.status === "PENDING";
          return <div className="subscription-row" key={candidate.id}><MemberIdentity projects={candidate.sharedProjects.map((project) => project.name)} user={candidate} /><Button className="secondary small" disabled={!!busy || approved || waiting} onClick={() => onRequest(candidate.id)}>{approved ? "已订阅" : waiting ? "等待对方同意" : request?.status === "REJECTED" ? "重新申请" : "申请订阅"}</Button></div>;
        }) : <div className="subscription-empty">当前空间中还没有其他成员</div>}</div></section>
        {subscribed.length > 0 && <section><h3>我的订阅</h3><div className="subscription-list compact">{subscribed.map((item) => <div className="subscription-row" key={item.id}><MemberIdentity user={item.owner!} /><Button className="ghost small" disabled={!!busy} onClick={() => onCancel(item.id)}>取消订阅</Button></div>)}</div></section>}
        {viewers.length > 0 && <section><h3>可以查看我日历的人</h3><div className="subscription-list compact">{viewers.map((item) => <div className="subscription-row" key={item.id}><MemberIdentity user={item.subscriber!} /><Button className="ghost small" disabled={!!busy} onClick={() => onCancel(item.id)}>停止共享</Button></div>)}</div></section>}
      </div>}
    </section>
  </div>;
}

function MemberIdentity({ user, projects }: { user: { displayName: string; username: string; avatarPath?: string | null }; projects?: string[] }) {
  return <div className="subscription-member"><span aria-hidden="true">{user.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>{projects?.length ? projects.join(" · ") : `@${user.username}`}</small></div></div>;
}

function MonthCalendar({ anchor, items, selectedDate, onSelect, onCreate, onEdit }: { anchor: Date; items: CalendarItem[]; selectedDate: Date; onSelect: (date: Date) => void; onCreate: (date: Date) => void; onEdit: (event: PersonalCalendarEvent) => void }) {
  const start = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  return <div className="calendar-month"><div className="calendar-week-labels">{weekLabels.map((label) => <span key={label}>{label}</span>)}</div><div className="calendar-month-grid">{days.map((day) => {
    const dayItems = items.filter((item) => occursOn(item, day));
    return <div className={`calendar-month-day${day.getMonth() !== anchor.getMonth() ? " outside" : ""}${isSameDay(day, selectedDate) ? " selected" : ""}`} key={day.toISOString()} onClick={() => onSelect(day)}>
      <header><span className={isToday(day) ? "today" : ""}>{day.getDate()}</span><button aria-label={`${formatDate(day)}新建日程`} onClick={(event) => { event.stopPropagation(); onCreate(day); }}><Plus size={14} /></button></header>
      <div className="calendar-month-events">{dayItems.slice(0, 3).map((item) => <CalendarPill item={item} onEdit={onEdit} key={item.id} />)}{dayItems.length > 3 && <span className="calendar-more">另有 {dayItems.length - 3} 项</span>}</div>
    </div>;
  })}</div></div>;
}

function WeekCalendar({ mode, anchor, items, selectedDate, onSelect, onCreate, onEdit, onMove }: { mode: "week" | "day"; anchor: Date; items: CalendarItem[]; selectedDate: Date; onSelect: (date: Date) => void; onCreate: (date: Date) => void; onEdit: (event: PersonalCalendarEvent) => void; onMove: (event: PersonalCalendarEvent, dayDelta: number, minuteDelta: number) => void }) {
  const days = useMemo(() => {
    const start = mode === "day" ? startOfDay(anchor) : startOfWeek(anchor);
    return Array.from({ length: mode === "day" ? 1 : 7 }, (_, index) => addDays(start, index));
  }, [anchor, mode]);
  const hours = Array.from({ length: 24 }, (_, index) => index);
  const columnStyle = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` };
  const headerStyle = { gridTemplateColumns: `54px repeat(${days.length}, minmax(0, 1fr))` };
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  useEffect(() => {
    const containsToday = days.some(isToday);
    scrollRef.current?.scrollTo({ top: Math.max(0, (containsToday ? currentMinutes : 8 * 60) - 220) });
  }, [currentMinutes, days]);
  return <div className={`calendar-week${mode === "day" ? " single-day" : ""}`}>
    <div className="calendar-week-header" style={headerStyle}><span />{days.map((day) => <button className={`${isToday(day) ? "today" : ""}${isSameDay(day, selectedDate) ? " selected" : ""}`} key={day.toISOString()} onClick={() => onSelect(day)}><small>{weekLabels[(day.getDay() + 6) % 7]}</small><strong>{day.getDate()}</strong></button>)}</div>
    <div className="calendar-week-all-day" style={headerStyle}><span>记录</span>{days.map((day) => <div key={day.toISOString()}>{items.filter((item) => item.allDay && occursOn(item, day)).map((item) => <Link href={`/journal?entry=${item.entry!.id}`} key={item.id}><i style={{ background: item.color }} />{item.title}</Link>)}</div>)}</div>
    <div className="calendar-week-scroll" ref={scrollRef}><div className="calendar-time-labels">{hours.map((hour) => <span style={{ top: hour * 60 }} key={hour}>{`${String(hour).padStart(2, "0")}:00`}</span>)}</div><div className="calendar-week-columns" style={columnStyle}>{days.map((day) => <div className="calendar-week-day" key={day.toISOString()} onDoubleClick={(event) => onCreate(withHour(day, Math.floor(event.nativeEvent.offsetY / 60)))}>{hours.map((hour) => <i style={{ top: hour * 60 }} key={hour} />)}{isToday(day) && <b className="calendar-current-time" aria-label="当前时间" style={{ top: currentMinutes }} />}{items.filter((item) => !item.allDay && occursOn(item, day)).map((item) => <WeekEvent item={item} onEdit={onEdit} onMove={onMove} key={item.id} />)}</div>)}</div></div>
  </div>;
}

function CalendarPill({ item, onEdit }: { item: CalendarItem; onEdit: (event: PersonalCalendarEvent) => void }) {
  const content = <><i style={{ background: item.color }} />{!item.allDay && <span>{formatTime(item.start)}</span>}<strong>{item.title}</strong></>;
  if (item.source === "entry") return <Link className="calendar-pill entry" href={`/journal?entry=${item.entry!.id}`} onClick={(event) => event.stopPropagation()}>{content}</Link>;
  if (item.source === "task") return <Link className="calendar-pill task" href={`/tasks/${item.task!.id}`} onClick={(event) => event.stopPropagation()}>{content}</Link>;
  if (item.source === "personal") return <button className="calendar-pill personal" onClick={(event) => { event.stopPropagation(); onEdit(item.event!); }}>{content}</button>;
  return <div className="calendar-pill subscribed" title={`${item.ownerName}的日程`}>{content}</div>;
}

function WeekEvent({ item, onEdit, onMove }: { item: CalendarItem; onEdit: (event: PersonalCalendarEvent) => void; onMove: (event: PersonalCalendarEvent, dayDelta: number, minuteDelta: number) => void }) {
  const minutes = item.start.getHours() * 60 + item.start.getMinutes();
  const duration = Math.max(32, Math.min((item.end.getTime() - item.start.getTime()) / 60_000, 180));
  const style = { top: minutes, height: duration, borderColor: item.color, background: `${item.color}18` };
  const content = <><strong>{item.title}</strong><small>{formatTime(item.start)}–{formatTime(item.end)}</small></>;
  if (item.source === "entry") return <Link className="calendar-week-event entry" href={`/journal?entry=${item.entry!.id}`} style={style}>{content}</Link>;
  if (item.source === "task") return <Link className="calendar-week-event task" href={`/tasks/${item.task!.id}`} style={style}>{content}</Link>;
  if (item.source === "personal") return <DraggableWeekEvent item={item} onEdit={onEdit} onMove={onMove} style={style}>{content}</DraggableWeekEvent>;
  return <div className="calendar-week-event subscribed" style={style}>{content}<small>{item.ownerName}</small></div>;
}

function DraggableWeekEvent({ item, onEdit, onMove, style, children }: { item: CalendarItem; onEdit: (event: PersonalCalendarEvent) => void; onMove: (event: PersonalCalendarEvent, dayDelta: number, minuteDelta: number) => void; style: CSSProperties; children: ReactNode }) {
  const pointer = useRef<{ x: number; y: number; moved: boolean }>({ x: 0, y: 0, moved: false });
  const [preview, setPreview] = useState<{ dayDelta: number; minuteDelta: number; columnWidth: number } | null>(null);
  const dragDelta = (event: PointerEvent<HTMLButtonElement>) => {
    const column = event.currentTarget.closest<HTMLElement>(".calendar-week-day");
    const columns = column?.parentElement;
    if (!column || !columns) return null;
    const currentIndex = Array.from(columns.children).indexOf(column);
    const rect = columns.getBoundingClientRect();
    const columnWidth = rect.width / columns.children.length;
    const nextIndex = Math.max(0, Math.min(columns.children.length - 1, Math.floor((event.clientX - rect.left) / columnWidth)));
    return { dayDelta: nextIndex - currentIndex, minuteDelta: Math.round((event.clientY - pointer.current.y) / 15) * 15, columnWidth };
  };
  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    pointer.current = { x: event.clientX, y: event.clientY, moved: false };
    setPreview(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (Math.abs(event.clientX - pointer.current.x) > 4 || Math.abs(event.clientY - pointer.current.y) > 4) {
      pointer.current.moved = true;
      setPreview(dragDelta(event));
    }
  };
  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!pointer.current.moved) { onEdit(item.event!); return; }
    const delta = dragDelta(event);
    setPreview(null);
    if (delta && (delta.dayDelta || delta.minuteDelta)) onMove(item.event!, delta.dayDelta, delta.minuteDelta);
  };
  const previewStart = preview ? shiftCalendarTime(new Date(item.event!.startsAt), preview.dayDelta, preview.minuteDelta) : null;
  const previewStyle = preview ? { transform: `translate(${preview.dayDelta * preview.columnWidth}px, ${preview.minuteDelta}px)` } : {};
  return <button aria-label={`${item.title}，拖动调整时间`} className={`calendar-week-event personal${preview ? " dragging" : ""}`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={() => setPreview(null)} style={{ ...style, ...previewStyle }}>{children}{previewStart && <span className="calendar-drag-preview">{formatTime(previewStart)}</span>}</button>;
}

function CalendarAgendaItem({ item, onEdit }: { item: CalendarItem; onEdit: (event: PersonalCalendarEvent) => void }) {
  const content = <><i style={{ background: item.color }} /><span><small>{item.allDay ? "当天手帐" : `${formatTime(item.start)}–${formatTime(item.end)}`}</small><strong>{item.title}</strong>{item.task && <em>{item.task.project.name} · {personalTaskTimeLabel(item.task)}</em>}{item.source === "subscribed" && <em>{item.ownerName}的日程</em>}</span></>;
  if (item.source === "entry") return <Link href={`/journal?entry=${item.entry!.id}`}>{content}</Link>;
  if (item.source === "task") return <Link href={`/tasks/${item.task!.id}`}>{content}</Link>;
  if (item.source === "personal") return <button onClick={() => onEdit(item.event!)}>{content}</button>;
  return <div className="subscribed">{content}</div>;
}

function calendarRange(anchor: Date, view: CalendarView) {
  if (view === "day") { const from = startOfDay(anchor); return { from, to: addDays(from, 1) }; }
  if (view === "week") { const from = startOfWeek(anchor); return { from, to: addDays(from, 7) }; }
  const from = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  return { from, to: addDays(from, 42) };
}
function startOfWeek(value: Date) { const date = startOfDay(value); return addDays(date, -((date.getDay() + 6) % 7)); }
function startOfDay(value: Date) { return new Date(value.getFullYear(), value.getMonth(), value.getDate()); }
function addDays(value: Date, amount: number) { const date = new Date(value); date.setDate(date.getDate() + amount); return date; }
function shiftCalendarTime(value: Date, dayDelta: number, minuteDelta: number) { const date = addDays(value, dayDelta); date.setMinutes(date.getMinutes() + minuteDelta); return date; }
function isSameDay(left: Date, right: Date) { return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate(); }
function isToday(value: Date) { return isSameDay(value, new Date()); }
function occursOn(item: CalendarItem, day: Date) { const start = startOfDay(day); const end = addDays(start, 1); return item.start < end && item.end > start; }
function formatTime(value: Date) { return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(value); }
function formatDate(value: Date) { return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(value); }
function rangeLabel(anchor: Date, view: CalendarView) { if (view === "month") return `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月`; if (view === "day") return formatDate(anchor); const start = startOfWeek(anchor); const end = addDays(start, 6); return `${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日`; }
function toLocalInput(value: Date) { const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }
function eventFormFor(value: Date): EventForm { const start = new Date(value.getFullYear(), value.getMonth(), value.getDate(), value.getHours() || 9, 0); if (start < new Date() && isToday(start)) start.setHours(new Date().getHours() + 1, 0, 0, 0); const end = new Date(start.getTime() + 60 * 60_000); return { title: "", description: "", startsAt: toLocalInput(start), endsAt: toLocalInput(end), color: "#958ab8" }; }
function withHour(value: Date, hour: number) { return new Date(value.getFullYear(), value.getMonth(), value.getDate(), Math.min(23, Math.max(0, hour)), 0); }
function localDateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
