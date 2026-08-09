"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderKey, Search, ShieldCheck, UserRound } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, EmptyState, Input, StatusBadge } from "./ui";

type ProjectRole = "OWNER" | "MANAGER" | "MEMBER" | "VIEWER";
type ProjectOption = { id: string; name: string; color: string };
type Membership = {
  id: string;
  role: ProjectRole;
  project: ProjectOption & { archivedAt?: string | null };
};
type AccessUser = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "DISABLED";
  projectMemberships: Membership[];
};
type AccessOverview = { users: AccessUser[]; projects: ProjectOption[] };

const roleLabels: Record<ProjectRole, string> = {
  OWNER: "空间主人",
  MANAGER: "管理员",
  MEMBER: "可一起编辑",
  VIEWER: "仅查看",
};

export function AdminMemberAccess() {
  const { user, loading: authLoading } = useAuth();
  const [overview, setOverview] = useState<AccessOverview | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setOverview((await apiFetch<AccessOverview>("/admin/access")).data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "成员权限加载失败");
    }
  }, []);

  useEffect(() => {
    if (user?.role === "ADMIN") void load();
  }, [user, load]);

  const visibleUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!overview || !keyword) return overview?.users ?? [];
    return overview.users.filter((item) =>
      [item.displayName, item.username, item.email].some((value) => value.toLowerCase().includes(keyword)),
    );
  }, [overview, search]);

  const saveAccess = async (userId: string, projectId: string, role: Exclude<ProjectRole, "OWNER">) => {
    const key = `${userId}:${projectId}`;
    setBusyKey(key); setError("");
    try {
      await apiFetch(`/admin/users/${userId}/projects/${projectId}`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "项目权限保存失败");
    } finally {
      setBusyKey("");
    }
  };

  const removeAccess = async (userId: string, projectId: string, projectName: string) => {
    if (!window.confirm(`确定将该成员移出“${projectName}”？移出后将无法查看空间内容。`)) return;
    const key = `${userId}:${projectId}`;
    setBusyKey(key); setError("");
    try {
      await apiFetch(`/admin/users/${userId}/projects/${projectId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "移除项目权限失败");
    } finally {
      setBusyKey("");
    }
  };

  const toggleStatus = async (member: AccessUser) => {
    const nextStatus = member.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    if (!window.confirm(nextStatus === "DISABLED" ? "禁用后该成员会立即退出登录，确定继续？" : "确定恢复该成员账号？")) return;
    const key = `status:${member.id}`;
    setBusyKey(key); setError("");
    try {
      await apiFetch(`/admin/users/${member.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "账号状态更新失败");
    } finally {
      setBusyKey("");
    }
  };

  if (authLoading) return <div className="loading">正在验证管理员权限…</div>;
  if (user?.role !== "ADMIN") return <EmptyState title="无权访问" description="此页面仅系统管理员可见。" action={{ href: "/", label: "返回首页" }} />;
  if (error && !overview) return <EmptyState title="加载失败" description={error} />;
  if (!overview) return <div className="loading">正在加载成员权限…</div>;

  return <>
    <div className="notice access-policy">
      <ShieldCheck size={20} />
      <span><strong>la vie 是私密空间</strong>只有这里的成员能看到清单、日历和手帐；仅查看成员不能修改内容。</span>
    </div>
    <div className="access-toolbar">
      <Search size={18} />
      <Input aria-label="搜索成员" placeholder="搜索姓名、用户名或邮箱" value={search} onChange={(event) => setSearch(event.target.value)} />
      <span>{visibleUsers.length} 位成员</span>
    </div>
    {error && <div className="form-message" role="alert">{error}</div>}
    <div className="access-list">
      {visibleUsers.map((member) => <MemberAccessCard
        key={member.id}
        member={member}
        projects={overview.projects}
        busyKey={busyKey}
        onSave={saveAccess}
        onRemove={removeAccess}
        onToggleStatus={toggleStatus}
      />)}
    </div>
    {!visibleUsers.length && <EmptyState title="没有找到成员" description="换一个姓名、用户名或邮箱试试。" />}
  </>;
}

function MemberAccessCard({
  member,
  projects,
  busyKey,
  onSave,
  onRemove,
  onToggleStatus,
}: {
  member: AccessUser;
  projects: ProjectOption[];
  busyKey: string;
  onSave: (userId: string, projectId: string, role: Exclude<ProjectRole, "OWNER">) => Promise<void>;
  onRemove: (userId: string, projectId: string, projectName: string) => Promise<void>;
  onToggleStatus: (member: AccessUser) => Promise<void>;
}) {
  const available = projects.filter((project) => !member.projectMemberships.some((item) => item.project.id === project.id));
  const [projectId, setProjectId] = useState(available[0]?.id ?? "");
  const [role, setRole] = useState<Exclude<ProjectRole, "OWNER">>("MEMBER");
  const statusBusy = busyKey === `status:${member.id}`;

  useEffect(() => {
    if (!available.some((project) => project.id === projectId)) setProjectId(available[0]?.id ?? "");
  }, [available, projectId]);

  return <section className="card access-card">
    <div className="access-card-header">
      <span className="avatar-placeholder"><UserRound size={18} /></span>
      <div>
        <div className="access-identity">
          <h2>{member.displayName}</h2>
          {member.role === "ADMIN" && <span className="badge">空间管理员</span>}
          <StatusBadge status={member.status} />
        </div>
        <p>@{member.username} · {member.email}</p>
      </div>
      <Button
        className={`${member.status === "ACTIVE" ? "danger" : "secondary"} small`}
        disabled={statusBusy}
        onClick={() => void onToggleStatus(member)}
      >
        {member.status === "ACTIVE" ? "禁用账号" : "恢复账号"}
      </Button>
    </div>
    {member.role === "ADMIN" && <p className="muted access-admin-note">空间管理员可以管理全部成员和内容。</p>}
    <div className="access-memberships">
      {member.projectMemberships.map((membership) => {
        const rowBusy = busyKey === `${member.id}:${membership.project.id}`;
        return <div className="access-membership" key={membership.id}>
          <span className="project-dot" style={{ background: membership.project.color }} />
          <strong>{membership.project.name}</strong>
          {membership.role === "OWNER"
            ? <span className="role-labels">{roleLabels.OWNER}</span>
            : <select
              className="input"
              aria-label={`${member.displayName}在${membership.project.name}的角色`}
              disabled={rowBusy || member.status !== "ACTIVE"}
              value={membership.role}
              onChange={(event) => void onSave(member.id, membership.project.id, event.target.value as Exclude<ProjectRole, "OWNER">)}
            >
              <option value="MANAGER">管理员</option>
              <option value="MEMBER">可一起编辑</option>
              <option value="VIEWER">仅查看</option>
            </select>}
          {membership.role !== "OWNER" && <Button
            className="secondary small"
            disabled={rowBusy}
            onClick={() => void onRemove(member.id, membership.project.id, membership.project.name)}
          >
            移出空间
          </Button>}
        </div>;
      })}
      {!member.projectMemberships.length && <div className="access-empty"><FolderKey size={18} /><span>还没有加入 la vie，看不到空间内容。</span></div>}
    </div>
    {member.status === "ACTIVE" && <div className="access-add">
      <select className="input" aria-label={`为${member.displayName}选择项目`} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
        <option value="">{available.length ? "选择空间" : "已加入 la vie"}</option>
        {available.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
      </select>
      <select className="input" aria-label={`为${member.displayName}选择角色`} value={role} onChange={(event) => setRole(event.target.value as Exclude<ProjectRole, "OWNER">)}>
        <option value="MEMBER">可一起编辑</option>
        <option value="VIEWER">仅查看</option>
        <option value="MANAGER">管理员</option>
      </select>
      <Button
        className="small"
        disabled={!projectId || busyKey === `${member.id}:${projectId}`}
        onClick={() => void onSave(member.id, projectId, role)}
      >
        加入空间
      </Button>
    </div>}
  </section>;
}
