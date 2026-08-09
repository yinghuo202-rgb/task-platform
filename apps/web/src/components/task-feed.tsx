"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TaskSummary } from "@task-platform/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { TaskCard } from "./task-card";
import { EmptyState } from "./ui";

export function TaskFeed({ limit = 6 }: { limit?: number }) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    void apiFetch<TaskSummary[]>(`/tasks?pageSize=${limit}`)
      .then((result) => setTasks(result.data))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "任务加载失败"))
      .finally(() => setLoading(false));
  }, [limit]);
  if (loading) return <div className="loading">正在加载待办…</div>;
  if (error) return <EmptyState title="无法加载待办" description={error} />;
  if (!tasks.length) return <EmptyFeed />;
  return <div className="card-grid">{tasks.map((task) => <TaskCard key={task.id} task={task} />)}</div>;
}

function EmptyFeed() {
  return <div className="empty"><h2>还没有项目任务</h2><p>进入项目后添加第一条需求或待办。</p><Link className="button" href="/tasks/new">添加任务</Link></div>;
}
