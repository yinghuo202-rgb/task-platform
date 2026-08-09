"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, Gamepad2, History, Sparkles } from "lucide-react";
import type { TaskSummary } from "@task-platform/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { personalTaskTimeLabel } from "@/lib/task-time";
import { EmptyState, StatusBadge } from "./ui";

type View = "active" | "history";

export function PersonalOrderHistory() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [view, setView] = useState<View>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<TaskSummary[]>("/tasks?scope=assigned&pageSize=100")
      .then(({ data }) => setTasks(data))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "接单记录加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const active = useMemo(() => tasks.filter((task) => task.personalAssignmentStatus !== "COMPLETED" && task.status !== "COMPLETED"), [tasks]);
  const history = useMemo(() => tasks.filter((task) => task.personalAssignmentStatus === "COMPLETED" || task.status === "COMPLETED"), [tasks]);
  const visible = view === "active" ? active : history;

  return <>
    <div className="section-heading">
      <div><span className="eyebrow">我的服务单</span><h1>我的接单</h1><p className="muted">正在陪伴的、已经完成的，都在这里留下记录。</p></div>
      <Link className="button secondary" href="/tasks"><Sparkles size={17} />去大厅看看</Link>
    </div>
    {loading ? <div className="loading">正在翻找你的接单记录…</div>
      : error ? <EmptyState title="加载失败" description={error} />
      : <div className="personal-orders">
        <div className="stat-grid order-stats">
          <div className="stat-card candy-pink"><span>接单中</span><strong>{active.length}</strong><small>件快乐进行时</small></div>
          <div className="stat-card candy-yellow"><span>已完成</span><strong>{history.length}</strong><small>次陪伴记录</small></div>
          <div className="stat-card candy-mint"><span>累计接单</span><strong>{tasks.length}</strong><small>继续保持好状态</small></div>
        </div>
        <div className="todo-tabs order-tabs" role="tablist" aria-label="接单记录">
          <button className={view === "active" ? "active" : ""} role="tab" aria-selected={view === "active"} onClick={() => setView("active")}><Gamepad2 size={16} />接单中 <span>{active.length}</span></button>
          <button className={view === "history" ? "active" : ""} role="tab" aria-selected={view === "history"} onClick={() => setView("history")}><History size={16} />历史接单 <span>{history.length}</span></button>
        </div>
        {visible.length ? <div className="order-history-list">{visible.map((task) => <Link href={`/tasks/${task.id}`} className="order-history-row" key={task.id}>
          <span className="order-service-icon">{serviceEmoji(task.category)}</span>
          <span className="order-history-main"><strong>{task.title}</strong><small><i style={{ background: task.project.color }} />{task.project.name} · {task.personalAssignedAt ? `${formatDate(task.personalAssignedAt)} 接取` : "接取时间待记录"}</small></span>
          <span className="order-history-time"><Clock3 size={15} />{personalTaskTimeLabel(task, task.status === "COMPLETED")}</span>
          <StatusBadge status={task.personalAssignmentStatus ?? task.status} />
          <ArrowRight size={17} />
        </Link>)}</div>
          : <div className="todo-empty"><CheckCircle2 size={28} /><strong>{view === "active" ? "现在没有进行中的接单" : "还没有历史接单"}</strong><span>{view === "active" ? "去任务大厅挑一件喜欢的事吧。" : "完成的陪伴服务会保存在这里。"}</span></div>}
      </div>}
  </>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(value));
}

function serviceEmoji(category: string) {
  if (category.includes("游戏")) return "🎮";
  if (category.includes("阅读")) return "📚";
  if (category.includes("运动")) return "🏃";
  if (category.includes("影音")) return "🎬";
  if (category.includes("音乐")) return "🎧";
  if (category.includes("订单")) return "🧾";
  if (category.includes("商品")) return "📦";
  if (category.includes("视觉")) return "🎨";
  if (category.includes("活动")) return "🎉";
  if (category.includes("客服")) return "💬";
  if (category.includes("库存")) return "🗃️";
  if (category.includes("数据")) return "📊";
  return "🌈";
}
