"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckSquare2, UsersRound } from "lucide-react";
import type { ProjectSummary } from "@task-platform/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { EmptyState } from "./ui";

const roleLabels = { OWNER: "负责人", MANAGER: "管理员", MEMBER: "成员", VIEWER: "只读" } as const;
const kindMeta = {
  COMPANION: { className: "companion", label: "la vie", icon: "✦" },
  GENERAL: { className: "general", label: "空间", icon: "○" },
} as const;

export function ProjectList({ limit }: { limit?: number }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<ProjectSummary[]>("/projects")
      .then(({ data }) => setProjects(limit ? data.slice(0, limit) : data))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "项目加载失败"))
      .finally(() => setLoading(false));
  }, [limit]);

  if (loading) return <div className="loading">正在加载项目…</div>;
  if (error) return <EmptyState title="请先登录" description="项目和任务只对内部成员开放。" action={{ href: "/login", label: "登录" }} />;
  if (!projects.length) return <EmptyState title="还没有项目" description="先创建一个项目，再邀请成员并添加任务。" action={{ href: "/projects/new", label: "创建项目" }} />;

  return <div className="project-list">{projects.map((project) => {
    const kind = kindMeta[project.kind];
    return <Link className={`card project-card project-card-${kind.className}`} href={`/projects/${project.id}`} key={project.id}>
    <div className="project-card-head">
      <span className="project-kind-badge"><span aria-hidden="true">{kind.icon}</span>{kind.label}</span>
      <span className="badge">{roleLabels[project.currentRole]}</span>
    </div>
    <div><h2>{project.name}</h2><p>{project.description || "暂无项目说明"}</p></div>
    <div className="project-stats"><span><CheckSquare2 size={15} />{project._count.tasks} 项任务</span><span><UsersRound size={15} />{project._count.members} 位成员</span></div>
  </Link>})}</div>;
}
