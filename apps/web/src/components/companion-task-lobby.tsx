"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import type { TaskSummary } from "@task-platform/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { EmptyState, Input } from "./ui";
import { TaskCard } from "./task-card";

export function CompanionTaskLobby({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<TaskSummary[]>(`/tasks?projectId=${projectId}&pageSize=100`)
      .then(({ data }) => setTasks(data))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "服务单加载失败"))
      .finally(() => setLoading(false));
  }, [projectId]);

  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return tasks.filter((task) => !keyword || `${task.title} ${task.summary}`.toLowerCase().includes(keyword));
  }, [tasks, search]);

  if (loading) return <div className="loading">正在准备今日快乐菜单…</div>;
  if (error) return <EmptyState title="大厅暂时走神了" description={error} />;

  return <div className="companion-lobby">
    <div className="companion-lobby-head">
      <div><span className="eyebrow">LA VIE · TASKS</span><h2>今天想一起做什么？</h2><p>搜索一件想做的事，接下来一起完成。</p></div>
      <label className="companion-search"><Search size={18} /><Input aria-label="搜索陪伴服务" placeholder="搜索想一起做的事" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    </div>
    <div className="companion-results"><span><Sparkles size={16} />{visible.length} 张快乐服务单</span></div>
    {visible.length ? <div className="card-grid companion-card-grid">{visible.map((task) => <TaskCard task={task} key={task.id} />)}</div>
      : <EmptyState title="还没有找到合适的事情" description="换个关键词看看，或者写下一件想让对方做的事。" action={{ href: `/tasks/new?project=${projectId}`, label: "发布一件事" }} />}
  </div>;
}
