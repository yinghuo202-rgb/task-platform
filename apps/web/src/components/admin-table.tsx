"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, EmptyState, StatusBadge } from "./ui";

type Row = Record<string, unknown> & { id: string };

export function AdminTable({ mode }: { mode: "users" | "tasks" | "disputes" | "audit-logs" }) {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setRows((await apiFetch<Row[]>(`/admin/${mode}`)).data); }
    catch (err) { setError(err instanceof ApiError ? err.message : "加载失败"); }
  }, [mode]);
  useEffect(() => { if (user?.role === "ADMIN") void load(); }, [user, load]);
  if (loading) return <div className="loading">正在验证管理员权限…</div>;
  if (user?.role !== "ADMIN") return <EmptyState title="无权访问" description="此页面仅管理员可见。" action={{ href: "/", label: "返回首页" }} />;
  if (error) return <EmptyState title="加载失败" description={error} />;
  if (!rows.length) return <EmptyState title="暂无数据" description="此列表当前为空。" />;
  return <div className="table-wrap"><table className="responsive"><thead><tr>{headers(mode).map((item) => <th key={item}>{item}</th>)}</tr></thead><tbody>{rows.map((row) => <AdminRow key={row.id} mode={mode} row={row} reload={load} />)}</tbody></table></div>;
}

function AdminRow({ mode, row, reload }: { mode: "users" | "tasks" | "disputes" | "audit-logs"; row: Row; reload: () => Promise<void> }) {
  const act = async (path: string, init?: RequestInit) => { if (!window.confirm("确定执行此管理操作？")) return; await apiFetch(path, init ?? { method: "POST" }); await reload(); };
  if (mode === "users") return <tr><td data-label="用户">{String(row.displayName)}<br /><small>@{String(row.username)}</small></td><td data-label="邮箱">{String(row.email)}</td><td data-label="角色">{String(row.role)}</td><td data-label="状态"><StatusBadge status={String(row.status)} /></td><td data-label="操作"><Button className={row.status === "ACTIVE" ? "danger small" : "secondary small"} onClick={() => void act(`/admin/users/${row.id}/status`, { method: "PATCH", body: JSON.stringify({ status: row.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }) })}>{row.status === "ACTIVE" ? "禁用" : "恢复"}</Button></td></tr>;
  if (mode === "tasks") return <tr><td data-label="任务"><Link href={`/tasks/${row.id}`}>{String(row.title)}</Link></td><td data-label="分类">{String(row.category)}</td><td data-label="状态"><StatusBadge status={String(row.status)} /></td><td data-label="创建时间">{new Date(String(row.createdAt)).toLocaleDateString("zh-CN")}</td><td data-label="操作"><Button className={row.status === "REMOVED" ? "secondary small" : "danger small"} onClick={() => void act(`/admin/tasks/${row.id}/${row.status === "REMOVED" ? "restore" : "remove"}`)}>{row.status === "REMOVED" ? "恢复" : "下架"}</Button></td></tr>;
  if (mode === "disputes") return <tr><td data-label="任务"><Link href={`/tasks/${row.id}`}>{String(row.title)}</Link></td><td data-label="状态"><StatusBadge status={String(row.status)} /></td><td data-label="更新时间">{new Date(String(row.updatedAt)).toLocaleString("zh-CN")}</td><td data-label="操作"><Button className="small" onClick={() => { const message = window.prompt("裁定说明"); if (message) void act(`/admin/disputes/${row.id}/resolve`, { method: "POST", body: JSON.stringify({ status: "IN_PROGRESS", message }) }); }}>恢复进行</Button></td></tr>;
  return <tr><td data-label="动作">{String(row.action)}</td><td data-label="实体">{String(row.entityType)} {row.entityId ? String(row.entityId).slice(0, 8) : ""}</td><td data-label="操作者">{actorName(row.actor)}</td><td data-label="时间">{new Date(String(row.createdAt)).toLocaleString("zh-CN")}</td></tr>;
}

function headers(mode: string) {
  if (mode === "users") return ["用户", "邮箱", "角色", "状态", "操作"];
  if (mode === "tasks") return ["任务", "分类", "状态", "创建时间", "操作"];
  if (mode === "disputes") return ["任务", "状态", "更新时间", "操作"];
  return ["动作", "实体", "操作者", "时间"];
}
function actorName(actor: unknown) { return actor && typeof actor === "object" && "displayName" in actor ? String(actor.displayName) : "系统"; }
