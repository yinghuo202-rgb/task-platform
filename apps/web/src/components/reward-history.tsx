"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Gift, Sparkles } from "lucide-react";
import type { TaskSummary } from "@task-platform/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { EmptyState, StatusBadge } from "./ui";

type RewardRecord = TaskSummary & { rewardFulfillmentStatus?: string };

export function RewardHistory({ embedded = false }: { embedded?: boolean }) {
  const [tasks, setTasks] = useState<RewardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<RewardRecord[]>("/tasks?scope=assigned&pageSize=100")
      // 只统计当前用户自己的接取记录，避免多人任务被其他成员完成时重复计入。
      .then(({ data }) => setTasks(data.filter((task) => task.personalAssignmentStatus === "COMPLETED")))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "奖励记录加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const rewards = useMemo(() => tasks.map((task) => ({ task, label: rewardLabel(task), completedAt: task.personalCompletedAt ?? task.completedAt })), [tasks]);
  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const reward of rewards) counts.set(reward.label, (counts.get(reward.label) ?? 0) + 1);
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [rewards]);

  return <section className={`reward-page${embedded ? " embedded" : ""}`}>
    {embedded ? <div className="reward-inline-heading"><div><h2>收到的奖励</h2><p>每一次完成，都会在这里留下一个小小的回礼。</p></div></div> : <div className="section-heading"><div><span className="eyebrow">LA VIE · REWARDS</span><h1>收到的奖励</h1><p className="muted">每一次完成，都会在这里留下一个小小的回礼。</p></div><Link className="button secondary" href="/tasks"><Sparkles size={16} />去清单</Link></div>}
    {loading ? <div className="loading">正在整理奖励记录…</div> : error ? <EmptyState title="奖励记录加载失败" description={error} /> : <>
      <div className="stat-grid reward-stats">
        <div className="stat-card candy-pink"><span>收到次数</span><strong>{rewards.length}</strong><small>已完成的接取任务</small></div>
        <div className="stat-card candy-yellow"><span>奖励种类</span><strong>{summary.length}</strong><small>不同的回礼</small></div>
      </div>
      {rewards.length ? <div className="reward-history-grid">
        <section className="card"><h2>奖励汇总</h2><div className="reward-summary-list">{summary.map(([label, count]) => <div className="reward-summary-row" key={label}><span><Gift size={15} />{label}</span><strong>{count} 次</strong></div>)}</div></section>
        <section className="card"><h2>获得记录</h2><div className="reward-record-list">{rewards.map(({ task, label, completedAt }) => <Link className="reward-record" href={`/tasks/${task.id}`} key={task.id}><span className="reward-record-icon"><CheckCircle2 size={17} /></span><span><strong>{label}</strong><small>{task.title}{completedAt ? ` · ${formatDate(completedAt)}收到` : ""}</small></span><StatusBadge status="COMPLETED" /><ArrowRight size={16} /></Link>)}</div></section>
      </div> : <EmptyState title="还没有收到奖励" description="完成一次接取的任务后，奖励会自动记录在这里。" action={{ href: "/tasks", label: "去看看清单" }} />}
    </>}
  </section>;
}

function rewardLabel(task: TaskSummary) {
  if (task.rewardDescription?.trim()) return task.rewardDescription.trim();
  if (task.rewardAmount) return `${task.rewardAmount}${task.rewardType === "POINTS" ? " 积分" : ""}`;
  return "一份没有写下来的回礼";
}

function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(value)); }
