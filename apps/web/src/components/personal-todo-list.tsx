"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Check, Circle, Gift, HeartHandshake, History, Inbox, Plus, Send } from "lucide-react";
import type { PublicUser, TaskSummary } from "@task-platform/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { personalTaskTimeLabel, taskTimeIsOverdue } from "@/lib/task-time";

type SharedWish = {
  id: string;
  title: string;
  completedAt: string | null;
  completedBy: PublicUser | null;
};

type BoardTask = { task: TaskSummary; available?: boolean };

export function PersonalTodoList() {
  const [wishes, setWishes] = useState<SharedWish[]>([]);
  const [assigned, setAssigned] = useState<BoardTask[]>([]);
  const [published, setPublished] = useState<BoardTask[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [newWish, setNewWish] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [wishResult, assignedResult, publishedResult, availableResult] = await Promise.all([
        apiFetch<SharedWish[]>("/shared-wishes"),
        apiFetch<TaskSummary[]>("/tasks?scope=assigned&pageSize=100"),
        apiFetch<TaskSummary[]>("/tasks?scope=published&pageSize=100"),
        apiFetch<TaskSummary[]>("/tasks?scope=available&pageSize=100"),
      ]);
      setWishes(wishResult.data);
      setAssigned([
        ...availableResult.data.map((task) => ({ task, available: true })),
        ...assignedResult.data.map((task) => ({ task })),
      ]);
      setPublished(publishedResult.data.map((task) => ({ task })));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "清单加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const completedCount = useMemo(() =>
    wishes.filter((wish) => wish.completedAt).length
    + assigned.filter(({ task }) => task.status === "COMPLETED").length
    + published.filter(({ task }) => task.status === "COMPLETED").length,
  [assigned, published, wishes]);

  const createWish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newWish.trim()) return;
    setBusy("new-wish"); setError("");
    try {
      const result = await apiFetch<SharedWish>("/shared-wishes", { method: "POST", body: JSON.stringify({ title: newWish.trim() }) });
      setWishes((current) => [...current, result.data]);
      setNewWish("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "添加失败");
    } finally { setBusy(""); }
  };

  const toggleWish = async (wish: SharedWish) => {
    setBusy(wish.id); setError("");
    try {
      const result = await apiFetch<SharedWish>(`/shared-wishes/${wish.id}/completed`, {
        method: "PATCH",
        body: JSON.stringify({ completed: !wish.completedAt }),
      });
      setWishes((current) => current.map((item) => item.id === wish.id ? result.data : item));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "状态更新失败");
    } finally { setBusy(""); }
  };

  const claim = async (taskId: string) => {
    setBusy(taskId); setError("");
    try {
      await apiFetch(`/tasks/${taskId}/claim`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "接取失败");
    } finally { setBusy(""); }
  };

  const visibleWishes = wishes.filter((wish) => showCompleted || !wish.completedAt);
  const visibleAssigned = assigned.filter(({ task }) => showCompleted || task.status !== "COMPLETED").sort(compareTasks);
  const visiblePublished = published.filter(({ task }) => showCompleted || task.status !== "COMPLETED").sort(compareTasks);

  return <section className="list-board">
    <div className="list-board-toolbar">
      <p>共同愿望不需要接取；个人任务由一方发布，另一方接取并完成。</p>
      <button type="button" className={showCompleted ? "active" : ""} onClick={() => setShowCompleted((value) => !value)}><History size={15} />{showCompleted ? "隐藏已完成" : `显示已完成 · ${completedCount}`}</button>
    </div>
    {error && <div className="form-message" role="alert">{error}</div>}
    {loading ? <div className="loading">正在整理我们的清单…</div> : <div className="list-board-columns">
      <section className="list-column together-column">
        <ColumnHeader icon={<HeartHandshake />} eyebrow="TOGETHER" title="一起做的事" count={visibleWishes.length} />
        <form className="wish-quick-add" autoComplete="off" onSubmit={createWish}><input autoComplete="off" aria-label="新的一起做事项" value={newWish} maxLength={500} onChange={(event) => setNewWish(event.target.value)} placeholder="再加一件想一起做的事" /><button type="submit" aria-label="添加" disabled={!newWish.trim() || busy === "new-wish"}><Plus size={16} /></button></form>
        <div className="list-column-scroll">{visibleWishes.length ? visibleWishes.map((wish) => <button type="button" className={`wish-row${wish.completedAt ? " completed" : ""}`} key={wish.id} disabled={busy === wish.id} onClick={() => void toggleWish(wish)}><span className="wish-check">{wish.completedAt ? <Check /> : <Circle />}</span><span><strong>{wish.title}</strong>{wish.completedAt && <small>{completionLabel(wish.completedAt, wish.completedBy?.displayName)}</small>}</span></button>) : <ColumnEmpty text={showCompleted ? "还没有共同愿望" : "愿望都完成啦"} />}</div>
      </section>

      <section className="list-column assigned-column">
        <ColumnHeader icon={<Inbox />} eyebrow="FOR ME" title="我接取的" count={visibleAssigned.length} />
        <div className="list-column-scroll task-mini-list">{visibleAssigned.length ? visibleAssigned.map(({ task, available }) => <TaskMiniCard key={task.id} task={task} mode={available ? "available" : "assigned"} busy={busy === task.id} onClaim={() => void claim(task.id)} />) : <ColumnEmpty text="暂时没有要接取的任务" />}</div>
      </section>

      <section className="list-column published-column">
        <ColumnHeader icon={<Send />} eyebrow="FROM ME" title="我发布的" count={visiblePublished.length} action={<Link href="/tasks/new"><Plus size={14} />发布</Link>} />
        <div className="list-column-scroll task-mini-list">{visiblePublished.length ? visiblePublished.map(({ task }) => <TaskMiniCard key={task.id} task={task} mode="published" />) : <ColumnEmpty text="还没有发布给对方的任务" />}</div>
      </section>
    </div>}
  </section>;
}

function ColumnHeader({ icon, eyebrow, title, count, action }: { icon: React.ReactNode; eyebrow: string; title: string; count: number; action?: React.ReactNode }) {
  return <header className="list-column-header"><span>{icon}</span><div><small>{eyebrow}</small><h2>{title}<b>{count}</b></h2></div>{action}</header>;
}

function TaskMiniCard({ task, mode, busy = false, onClaim }: { task: TaskSummary; mode: "available" | "assigned" | "published"; busy?: boolean; onClaim?: () => void }) {
  const completed = task.status === "COMPLETED";
  const completionTime = mode === "assigned" ? task.personalCompletedAt : task.completedAt;
  const overdue = mode === "assigned" && taskTimeIsOverdue(task, completed);
  const reward = rewardLabel(task);
  return <article className={`task-mini-card${completed ? " completed" : ""}`}>
    <div className="task-mini-top"><span className={`task-mini-dot ${mode}`} /> <small>{mode === "available" ? `${task.publisher.displayName} 发布` : statusLabel(task, mode)}</small>{completed && completionTime && <time>{formatDate(completionTime)}</time>}</div>
    <Link href={`/tasks/${task.id}`}><strong>{task.title}</strong><p>{task.summary}</p></Link>
    <div className="task-mini-foot">{reward && <span><Gift size={13} />{reward}</span>}{mode === "assigned" && !completed && <span className={overdue ? "overdue" : ""}><CalendarCheck size={13} />{personalTaskTimeLabel(task, false)}</span>}{mode === "available" && task.claimMode === "AUTO" && <button type="button" disabled={busy} onClick={onClaim}>{busy ? "接取中…" : "我来接"}</button>}{mode === "available" && task.claimMode !== "AUTO" && <Link href={`/tasks/${task.id}`}>查看申请</Link>}</div>
  </article>;
}

function ColumnEmpty({ text }: { text: string }) {
  return <div className="list-column-empty"><Check size={20} /><span>{text}</span></div>;
}

function compareTasks(left: BoardTask, right: BoardTask) {
  if (Boolean(left.available) !== Boolean(right.available)) return left.available ? -1 : 1;
  if (left.task.status === "COMPLETED" && right.task.status !== "COMPLETED") return 1;
  if (right.task.status === "COMPLETED" && left.task.status !== "COMPLETED") return -1;
  const leftDate = left.task.personalDueAt ?? left.task.deadline ?? left.task.publishedAt;
  const rightDate = right.task.personalDueAt ?? right.task.deadline ?? right.task.publishedAt;
  return (leftDate ? new Date(leftDate).getTime() : Number.MAX_SAFE_INTEGER) - (rightDate ? new Date(rightDate).getTime() : Number.MAX_SAFE_INTEGER);
}

function rewardLabel(task: TaskSummary) {
  if (task.rewardDescription) return task.rewardDescription;
  if (task.rewardAmount) return `${task.rewardAmount} ${task.rewardType === "POINTS" ? "积分" : ""}`.trim();
  return "";
}

function statusLabel(task: TaskSummary, mode: "assigned" | "published") {
  if (task.status === "COMPLETED") return "已完成";
  if (mode === "published" && task.status === "PUBLISHED") return "等待对方接取";
  if (task.status === "SUBMITTED") return mode === "published" ? "等待你确认" : "等待对方确认";
  if (task.status === "REVISION_REQUESTED") return "需要再处理";
  if (task.status === "IN_PROGRESS") return "进行中";
  if (task.status === "CLAIMED") return "已接取";
  return "已发布";
}

function completionLabel(value: string, person?: string) {
  return `${person ? `${person} · ` : ""}${formatDate(value)}完成`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(value));
}
