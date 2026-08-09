"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import type { TaskSummary } from "@task-platform/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { EmptyState, Input } from "./ui";
import { TaskCard } from "./task-card";

const categories = [
  ["", "🌈", "全部"],
  ["游戏陪玩", "🎮", "游戏开黑"],
  ["影音陪伴", "🎬", "影音共赏"],
  ["阅读陪伴", "📚", "安静共读"],
  ["运动陪伴", "🏃", "运动打卡"],
  ["音乐陪伴", "🎧", "听歌分享"],
  ["休闲陪伴", "🫶", "轻松陪伴"],
] as const;

export function CompanionTaskLobby({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [category, setCategory] = useState("");
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
    return tasks.filter((task) => (!category || task.category === category)
      && (!keyword || `${task.title} ${task.summary}`.toLowerCase().includes(keyword)));
  }, [tasks, category, search]);

  if (loading) return <div className="loading">正在准备今日快乐菜单…</div>;
  if (error) return <EmptyState title="大厅暂时走神了" description={error} />;

  return <div className="companion-lobby">
    <div className="companion-lobby-head">
      <div><span className="eyebrow">PICK YOUR MOOD</span><h2>今天想找什么搭子？</h2><p>选一个心情频道，看看谁在等你。</p></div>
      <label className="companion-search"><Search size={18} /><Input aria-label="搜索陪伴服务" placeholder="搜索想一起做的事" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    </div>
    <div className="companion-categories" aria-label="陪伴服务分类">
      {categories.map(([value, emoji, label]) => <button className={category === value ? "active" : ""} key={value || "all"} onClick={() => setCategory(value)}><span>{emoji}</span><strong>{label}</strong><small>{value ? tasks.filter((task) => task.category === value).length : tasks.length}</small></button>)}
    </div>
    <div className="companion-results"><span><Sparkles size={16} />{visible.length} 张快乐服务单</span>{category && <button onClick={() => setCategory("")}>清除筛选</button>}</div>
    {visible.length ? <div className="card-grid companion-card-grid">{visible.map((task) => <TaskCard task={task} key={task.id} />)}</div>
      : <EmptyState title="这个频道还没有服务单" description="换个频道看看，或者发布你的第一张服务单。" action={{ href: `/tasks/new?project=${projectId}`, label: "发布服务单" }} />}
  </div>;
}
