"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, Circle, Clock3, ListChecks } from "lucide-react";
import type { TaskSummary } from "@task-platform/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { personalTaskTimeLabel, taskTimeIsOverdue } from "@/lib/task-time";

type TodoView = "open" | "completed";
type TodoItem = { task: TaskSummary; source: "assigned" | "published" };

export function PersonalTodoList() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [view, setView] = useState<TodoView>("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([
      apiFetch<TaskSummary[]>("/tasks?scope=assigned&pageSize=100"),
      apiFetch<TaskSummary[]>("/tasks?scope=published&pageSize=100"),
    ]).then(([assigned, published]) => {
      const merged = new Map<string, TodoItem>();
      assigned.data.forEach((task) => merged.set(task.id, { task, source: "assigned" }));
      published.data.forEach((task) => {
        if (!merged.has(task.id)) merged.set(task.id, { task, source: "published" });
      });
      setItems([...merged.values()]);
    }).catch((err: unknown) => {
      setError(err instanceof ApiError ? err.message : "个人待办加载失败");
    }).finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => ({
    open: items.filter(({ task }) => task.status !== "COMPLETED").length,
    completed: items.filter(({ task }) => task.status === "COMPLETED").length,
  }), [items]);

  const visible = useMemo(() => items
    .filter(({ task }) => view === "completed" ? task.status === "COMPLETED" : task.status !== "COMPLETED")
    .sort(compareTodos), [items, view]);

  return <section className="todo-panel">
    <div className="todo-panel-header">
      <div>
        <span className="eyebrow">个人清单</span>
        <h2><ListChecks size={22} /> 我的待办</h2>
      </div>
      <div className="todo-tabs" role="tablist" aria-label="待办状态">
        <button className={view === "open" ? "active" : ""} role="tab" aria-selected={view === "open"} onClick={() => setView("open")}>待处理 <span>{counts.open}</span></button>
        <button className={view === "completed" ? "active" : ""} role="tab" aria-selected={view === "completed"} onClick={() => setView("completed")}>已完成 <span>{counts.completed}</span></button>
      </div>
    </div>
    {loading ? <div className="todo-loading">正在整理你的待办…</div>
      : error ? <div className="form-message" role="alert">{error}</div>
      : visible.length ? <div className="todo-list">{visible.map((item) => <TodoRow item={item} key={item.task.id} />)}</div>
      : <div className="todo-empty"><CheckCircle2 size={26} /><strong>{view === "open" ? "当前没有待处理事项" : "还没有已完成事项"}</strong><span>{view === "open" ? "新的项目任务会出现在这里。" : "完成的任务会保留在这里方便回顾。"}</span></div>}
  </section>;
}

function TodoRow({ item: { task, source } }: { item: TodoItem }) {
  const completed = task.status === "COMPLETED";
  const timeLabel = personalTaskTimeLabel(task, completed);
  const overdue = taskTimeIsOverdue(task, completed);
  return <Link className={`todo-row${completed ? " completed" : ""}`} href={`/tasks/${task.id}`}>
    <span className="todo-check" aria-hidden="true">{completed ? <CheckCircle2 /> : <Circle />}</span>
    <span className="todo-main">
      <strong>{task.title}</strong>
      <span className="todo-context">
        <span className="project-pill"><i style={{ background: task.project.color }} />{task.project.name}</span>
        <span>{source === "published" ? "我创建的" : "分配给我"}</span>
      </span>
    </span>
    <span className={`todo-deadline${overdue ? " overdue" : ""}`}><Clock3 size={15} />{timeLabel}</span>
    <span className="todo-next">{nextAction(task, source)}<ChevronRight size={16} /></span>
  </Link>;
}

function compareTodos(left: TodoItem, right: TodoItem) {
  if (left.task.status === "COMPLETED" && right.task.status !== "COMPLETED") return 1;
  if (right.task.status === "COMPLETED" && left.task.status !== "COMPLETED") return -1;
  const leftValue = left.task.personalDueAt ?? left.task.deadline;
  const rightValue = right.task.personalDueAt ?? right.task.deadline;
  const leftTime = leftValue ? new Date(leftValue).getTime() : Number.POSITIVE_INFINITY;
  const rightTime = rightValue ? new Date(rightValue).getTime() : Number.POSITIVE_INFINITY;
  return leftTime - rightTime || left.task.title.localeCompare(right.task.title, "zh-CN");
}

function nextAction(task: TaskSummary, source: TodoItem["source"]) {
  if (task.status === "COMPLETED") return "查看记录";
  if (source === "published") {
    if (task.status === "SUBMITTED") return "去验收";
    if (task.status === "PUBLISHED") return "等待推进";
    return "查看进度";
  }
  if (task.status === "CLAIMED") return "开始处理";
  if (task.status === "REVISION_REQUESTED") return "按反馈修改";
  if (task.status === "SUBMITTED") return "等待验收";
  return "继续处理";
}
