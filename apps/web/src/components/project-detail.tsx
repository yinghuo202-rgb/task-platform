"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, UsersRound } from "lucide-react";
import type { ProjectRole, ProjectSummary } from "@task-platform/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { Button, EmptyState, Input } from "./ui";
import { TaskList } from "./task-list";
import { CompanionTaskLobby } from "./companion-task-lobby";

const roleLabels: Record<ProjectRole, string> = { OWNER: "负责人", MANAGER: "管理员", MEMBER: "成员", VIEWER: "只读成员" };

export function ProjectDetail({ id }: { id: string }) {
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [newRole, setNewRole] = useState<ProjectRole>("MEMBER");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setProject((await apiFetch<ProjectSummary>(`/projects/${id}`)).data); }
    catch (err) { setError(err instanceof ApiError ? err.message : "项目加载失败"); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (error && !project) return <EmptyState title="无法打开项目" description={error} action={{ href: "/projects", label: "返回项目列表" }} />;
  if (!project) return <div className="loading">正在加载项目…</div>;
  const canManage = ["OWNER", "MANAGER"].includes(project.currentRole);
  const projectKind = project.kind === "COMPANION" ? "companion" : "default";

  const addMember = async () => {
    if (!identifier.trim()) return;
    setBusy(true); setError("");
    try {
      await apiFetch(`/projects/${id}/members`, { method: "POST", body: JSON.stringify({ identifier, role: newRole }) });
      setIdentifier("");
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "添加成员失败"); }
    finally { setBusy(false); }
  };

  const updateRole = async (memberId: string, role: ProjectRole) => {
    setBusy(true);
    try {
      await apiFetch(`/projects/${id}/members/${memberId}`, { method: "PATCH", body: JSON.stringify({ role }) });
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "角色更新失败"); }
    finally { setBusy(false); }
  };

  const removeMember = async (memberId: string) => {
    if (!window.confirm("确定将该成员移出项目？")) return;
    setBusy(true);
    try {
      await apiFetch(`/projects/${id}/members/${memberId}`, { method: "DELETE" });
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "移除成员失败"); }
    finally { setBusy(false); }
  };

  return <div className={`project-experience project-${projectKind}`}>
    {projectKind === "companion" ? <div className="project-header companion-project-header">
      <div className="companion-project-copy"><span className="eyebrow">PLAYMATE CLUB · {roleLabels[project.currentRole]}</span><h1>{project.name}</h1><p>{project.description || "一起游戏、看电影、阅读和运动，让每一段空闲时间都有好搭子。"}</p>
        {project.currentRole !== "VIEWER" && <Link className="button companion-publish" href={`/tasks/new?project=${id}`}><Plus size={17} />发布快乐服务单</Link>}
      </div>
      <div className="companion-project-art" aria-hidden="true"><span>🎮</span><span>🎬</span><span>📚</span><strong>随时营业</strong></div>
    </div> : <div className="project-header">
      <span className="project-mark" style={{ background: project.color }} />
      <div><span className="eyebrow">内部项目 · {roleLabels[project.currentRole]}</span><h1>{project.name}</h1><p>{project.description || "暂无项目说明"}</p></div>
      <div className="button-row">{project.currentRole !== "VIEWER" && <Link className="button" href={`/tasks/new?project=${id}`}><Plus size={17} />新建任务</Link>}</div>
    </div>}
    {error && <div className="form-message" style={{ marginBottom: 16 }}>{error}</div>}
    <div className={`project-columns project-columns-${projectKind}`}>
      <section>
        {projectKind === "companion" ? <CompanionTaskLobby projectId={id} /> : <><div className="section-heading"><div><span className="eyebrow">项目任务</span><h2>协作清单</h2></div></div><TaskList projectId={id} /></>}
      </section>
      <aside className="card project-member-panel">
        <div className="section-heading"><div><span className="eyebrow">权限</span><h2><UsersRound size={20} /> 项目成员</h2></div></div>
        {canManage && <div className="form-stack" style={{ marginBottom: 18 }}>
          <Input aria-label="用户名或邮箱" placeholder="输入用户名或邮箱" value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
          <div className="form-grid">
            <select className="input" aria-label="项目角色" value={newRole} onChange={(event) => setNewRole(event.target.value as ProjectRole)}>
              <option value="MEMBER">成员</option><option value="VIEWER">只读成员</option>{project.currentRole === "OWNER" && <option value="MANAGER">管理员</option>}
            </select>
            <Button className="small" disabled={busy || !identifier.trim()} onClick={() => void addMember()}>添加</Button>
          </div>
        </div>}
        <div className="member-list">{project.members.map((member) => <div className="member-row" key={member.id}>
          <span className="avatar-placeholder">{member.user.displayName.slice(0, 1)}</span>
          <span><strong>{member.user.displayName}</strong><small>@{member.user.username}</small></span>
          <span className="member-actions">{project.currentRole === "OWNER" && member.role !== "OWNER"
            ? <select className="input" aria-label={`${member.user.displayName}的角色`} disabled={busy} value={member.role} onChange={(event) => void updateRole(member.id, event.target.value as ProjectRole)}><option value="MANAGER">管理员</option><option value="MEMBER">成员</option><option value="VIEWER">只读</option></select>
            : <span className="role-labels">{roleLabels[member.role]}</span>}
          {canManage && member.role !== "OWNER" && !(project.currentRole === "MANAGER" && member.role === "MANAGER") && <Button className="secondary small" disabled={busy} onClick={() => void removeMember(member.id)}>移除</Button>}</span>
        </div>)}</div>
      </aside>
    </div>
  </div>;
}
