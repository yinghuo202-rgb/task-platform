"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button, EmptyState } from "./ui";

type Notification = { id: string; taskId: string | null; title: string; content: string; readAt: string | null; createdAt: string };

export function NotificationsList() {
  const [items, setItems] = useState<Notification[]>([]);
  const load = useCallback(() => apiFetch<Notification[]>("/notifications?pageSize=50").then(({ data }) => setItems(data)), []);
  useEffect(() => { void load(); }, [load]);
  const read = async (id: string) => { await apiFetch(`/notifications/${id}/read`, { method: "POST" }); await load(); };
  if (!items.length) return <EmptyState title="暂时没有提醒" description="手帐更新、任务发布和需要回应的协作进展会显示在这里。" />;
  return <div className="card" style={{ padding: 0 }}>{items.map((item) => <div className={`notification ${item.readAt ? "read" : ""}`} key={item.id}><span className="notification-dot" aria-label={item.readAt ? "已读" : "未读"} /><div><strong>{item.taskId ? <Link href={`/tasks/${item.taskId}`}>{item.title}</Link> : item.title}</strong><p className="muted">{item.content}</p><small className="muted">{new Date(item.createdAt).toLocaleString("zh-CN")}</small></div>{!item.readAt && <Button className="secondary small" onClick={() => void read(item.id)}>标为已读</Button>}</div>)}</div>;
}
