"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, Search, Sparkles, UserRound } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { EmptyState, Input, StatusBadge } from "./ui";

type Order = {
  id: string;
  status: string;
  assignedAt: string;
  dueAt: string | null;
  task: {
    id: string;
    title: string;
    status: string;
    category: string;
    project: { id: string; name: string; color: string };
  };
};

type MemberOrders = {
  id: string;
  username: string;
  displayName: string;
  status: "ACTIVE" | "DISABLED";
  stats: { active: number; completed: number; total: number };
  activeOrders: Order[];
  recentOrders: Order[];
};

export function AdminOrderBoard() {
  const { user, loading: authLoading } = useAuth();
  const [members, setMembers] = useState<MemberOrders[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    void apiFetch<MemberOrders[]>("/admin/orders")
      .then(({ data }) => setMembers(data))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "接单数据加载失败"))
      .finally(() => setLoading(false));
  }, [user]);

  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return keyword
      ? members.filter((member) => `${member.displayName} ${member.username}`.toLowerCase().includes(keyword))
      : members;
  }, [members, search]);

  const totals = useMemo(() => members.reduce((result, member) => ({
    active: result.active + member.stats.active,
    completed: result.completed + member.stats.completed,
    members: result.members + (member.stats.total ? 1 : 0),
  }), { active: 0, completed: 0, members: 0 }), [members]);

  if (authLoading || loading) return <div className="loading">正在整理今日接单…</div>;
  if (user?.role !== "ADMIN") return <EmptyState title="无权访问" description="此页面仅系统管理员可见。" />;
  if (error) return <EmptyState title="加载失败" description={error} />;

  return <div className="order-board">
    <div className="stat-grid order-stats">
      <div className="stat-card candy-pink"><span>正在服务</span><strong>{totals.active}</strong><small>个进行中的订单</small></div>
      <div className="stat-card candy-yellow"><span>累计完成</span><strong>{totals.completed}</strong><small>次快乐交付</small></div>
      <div className="stat-card candy-mint"><span>有接单记录</span><strong>{totals.members}</strong><small>位活跃成员</small></div>
    </div>
    <div className="access-toolbar order-search"><Search size={18} /><Input aria-label="搜索接单成员" placeholder="搜索成员昵称或用户名" value={search} onChange={(event) => setSearch(event.target.value)} /><span>{visible.length} 位成员</span></div>
    <div className="order-member-grid">
      {visible.map((member) => <section className="card order-member-card" key={member.id}>
        <header>
          <span className="order-avatar"><UserRound size={21} /></span>
          <div><h2>{member.displayName}</h2><p>@{member.username}</p></div>
          <StatusBadge status={member.status} />
        </header>
        <div className="order-member-stats">
          <span><strong>{member.stats.active}</strong>接单中</span>
          <span><strong>{member.stats.completed}</strong>已完成</span>
          <span><strong>{member.stats.total}</strong>总接单</span>
        </div>
        <div className="order-section-title"><Sparkles size={16} /><strong>当前接单</strong></div>
        <div className="mini-order-list">
          {member.activeOrders.length ? member.activeOrders.map((order) => <Link href={`/tasks/${order.task.id}`} key={order.id}>
            <span className="project-dot" style={{ background: order.task.project.color }} />
            <span><strong>{order.task.title}</strong><small>{order.task.project.name} · {formatDate(order.assignedAt)}接取</small></span>
            <StatusBadge status={order.status} />
          </Link>) : <div className="mini-order-empty"><CheckCircle2 size={18} />当前空闲，可以安排新单</div>}
        </div>
        {member.recentOrders.length > 0 && <details className="order-history-fold">
          <summary><Clock3 size={15} />查看最近接单（{member.recentOrders.length}）</summary>
          <div>{member.recentOrders.map((order) => <Link href={`/tasks/${order.task.id}`} key={order.id}><span>{order.task.title}</span><StatusBadge status={order.status} /></Link>)}</div>
        </details>}
      </section>)}
    </div>
    {!visible.length && <EmptyState title="没有找到成员" description="换一个昵称或用户名试试。" />}
  </div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(value));
}
