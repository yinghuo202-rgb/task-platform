"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { TaskSummary } from "@task-platform/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { TaskCard } from "./task-card";
import { Button, EmptyState, Input } from "./ui";

export function TaskList({ projectId }: { projectId?: string }) {
  const params = useSearchParams();
  const [filters, setFilters] = useState({
    search: params.get("search") ?? "",
    status: params.get("status") ?? "",
    sort: params.get("sort") ?? "createdAt",
  });
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const query = new URLSearchParams({ page: String(page), pageSize: "12", ...(projectId ? { projectId } : {}), ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) });
    try {
      const result = await apiFetch<TaskSummary[]>(`/tasks?${query}`);
      setTasks(result.data);
      setTotalPages(Number(result.meta?.totalPages ?? 1));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "网络异常，请稍后重试");
    } finally { setLoading(false); }
  }, [filters, page, projectId]);
  useEffect(() => { void load(); }, [load]);

  const set = (key: keyof typeof filters, value: string) => { setPage(1); setFilters((current) => ({ ...current, [key]: value })); };
  return <>
    <div className="filters" aria-label="清单筛选">
      <Input className="search" aria-label="关键词搜索" placeholder="搜索事情标题或内容" value={filters.search} onChange={(event) => set("search", event.target.value)} />
      <select className="input" aria-label="状态" value={filters.status} onChange={(event) => set("status", event.target.value)}><option value="">全部状态</option><option value="PUBLISHED">等人来做</option><option value="CLAIMED">已安排</option><option value="IN_PROGRESS">进行中</option><option value="COMPLETED">已完成</option></select>
      <select className="input" aria-label="排序" value={filters.sort} onChange={(event) => set("sort", event.target.value)}><option value="createdAt">最近写下</option><option value="deadline">时间最近</option></select>
    </div>
    {loading ? <div className="loading" role="status">正在加载清单…</div>
      : error ? <EmptyState title="清单加载失败" description={error} />
      : !tasks.length ? <EmptyState title="还没有找到事情" description="可以调整筛选条件，或者写下一件想做的事。" action={{ href: "/tasks/new", label: "写下一件事" }} />
      : <div className="card-grid">{tasks.map((task) => <TaskCard task={task} key={task.id} />)}</div>}
    {totalPages > 1 && <div className="pagination"><Button className="secondary small" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</Button><span>{page} / {totalPages}</span><Button className="secondary small" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>下一页</Button></div>}
  </>;
}
