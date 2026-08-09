"use client";

import { useEffect, useState } from "react";
import type { TaskSummary } from "@task-platform/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { TaskCard } from "./task-card";
import { EmptyState } from "./ui";

export function ScopedTaskList({ scope, title, description }: { scope: "published" | "applications" | "assigned" | "completed"; title: string; description: string }) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void apiFetch<TaskSummary[]>(`/tasks?scope=${scope}&pageSize=50`).then(({ data }) => setTasks(data)).catch((err: unknown) => setError(err instanceof ApiError ? err.message : "加载失败")).finally(() => setLoading(false));
  }, [scope]);
  return <><div className="section-heading"><div><span className="eyebrow">我的任务</span><h1>{title}</h1><p className="muted">{description}</p></div></div>{loading ? <div className="loading">正在加载…</div> : error ? <EmptyState title="加载失败" description={error} /> : tasks.length ? <div className="card-grid">{tasks.map((task) => <TaskCard key={task.id} task={task} />)}</div> : <EmptyState title="这里还没有任务" description={description} action={{ href: "/tasks", label: "浏览任务" }} />}</>;
}
