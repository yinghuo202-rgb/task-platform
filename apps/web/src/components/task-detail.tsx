"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Gift } from "lucide-react";
import type { TaskSummary } from "@task-platform/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { taskTimeLabel } from "@/lib/task-time";
import { Button, EmptyState, StatusBadge, Textarea } from "./ui";

type Requirement = { id: string; title: string; description: string; required: boolean };
type Assignment = { id: string; assigneeId: string; status: string; assignee: { displayName: string } };
type Attachment = { id: string; originalName: string; size: number };
type TaskDetailType = TaskSummary & {
  publisherId: string;
  description: string; locationDescription: string | null; rewardFulfillmentStatus: string;
  requirements: Requirement[]; assignments: Assignment[]; attachments: Attachment[]; version: number; createdAt: string; shareToken: string;
};
type Application = { id: string; message: string; status: string; applicant: { displayName: string; username: string; bio: string | null } };
type Submission = { id: string; content: string; status: string; reviewMessage: string | null; submittedAt: string; submitter: { displayName: string } };
type Comment = { id: string; content: string; createdAt: string; author: { id: string; displayName: string } };

export function TaskDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const [task, setTask] = useState<TaskDetailType | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [message, setMessage] = useState("");
  const [submission, setSubmission] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const value = (await apiFetch<TaskDetailType>(`/tasks/${id}${location.search}`)).data;
      setTask(value);
      if (user && value.publisherId === user.id) {
        setApplications((await apiFetch<Application[]>(`/tasks/${id}/applications`)).data);
      }
      if (user && (value.publisherId === user.id || value.assignments.some((item) => item.assigneeId === user.id))) {
        setSubmissions((await apiFetch<Submission[]>(`/tasks/${id}/submissions`)).data);
        setComments((await apiFetch<Comment[]>(`/tasks/${id}/comments`)).data);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "任务加载失败");
    }
  }, [id, user]);
  useEffect(() => { void load(); }, [load]);

  const action = async (path: string, body?: unknown) => {
    setBusy(true); setError("");
    try {
      await apiFetch(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      setMessage(""); setSubmission("");
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "操作失败"); }
    finally { setBusy(false); }
  };

  if (error && !task) return <EmptyState title="无法打开任务" description={error} action={{ href: "/tasks", label: "返回全部待办" }} />;
  if (!task) return <div className="loading">正在加载任务…</div>;
  const isPublisher = user?.id === task.publisherId;
  const assignment = task.assignments.find((item) => item.assigneeId === user?.id);
  return <div className="detail-grid">
    <div className="detail-main">
      <article className="card">
        <div className="task-card-top"><span className="project-pill"><i style={{ background: task.project.color }} />la vie</span><StatusBadge status={task.status} /></div>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.3rem)" }}>{task.title}</h1>
        <p className="muted">{task.summary}</p>
        <div className="task-meta"><span>{task.publisher.displayName} 写下</span><span>·</span><span>{formatDate(task.publishedAt ?? task.createdAt)}</span></div>
      </article>
      {task.description !== task.summary && <section className="card"><h2>备注</h2><div className="prose">{task.description}</div></section>}
      {task.attachments.length > 0 && <section className="card"><h2>附件</h2><ul>{task.attachments.map((file) => <li key={file.id}><a href={`/api/v1/attachments/${file.id}`}>{file.originalName}</a> <small className="muted">({Math.ceil(file.size / 1024)} KB)</small></li>)}</ul></section>}

      {isPublisher && applications.length > 0 && <section className="card"><h2>想做的人</h2><div className="form-stack">{applications.map((app) => <div className="requirement" key={app.id}><strong>{app.applicant.displayName}</strong><p>{app.message}</p>{app.status === "PENDING" && <div className="button-row"><Button className="small" disabled={busy} onClick={() => void action(`/applications/${app.id}/accept`)}>交给对方</Button><Button className="secondary small" disabled={busy} onClick={() => void action(`/applications/${app.id}/reject`)}>暂时不</Button></div>}<StatusBadge status={app.status} /></div>)}</div></section>}

      {submissions.length > 0 && <section className="card"><h2>完成记录</h2><div className="form-stack">{submissions.map((item) => <div className="requirement" key={item.id}><div className="task-card-top"><strong>{item.submitter.displayName}</strong><StatusBadge status={item.status} /></div><div className="prose">{item.content}</div>{item.reviewMessage && <div className="notice">补充：{item.reviewMessage}</div>}{isPublisher && item.status === "SUBMITTED" && <div className="button-row"><Button disabled={busy} onClick={() => void action(`/submissions/${item.id}/approve`)}>确认完成</Button><Button className="secondary" disabled={busy} onClick={() => { const note = window.prompt("想让对方补充什么？"); if (note?.trim()) void action(`/submissions/${item.id}/request-revision`, { message: note }); }}>请对方补充</Button></div>}</div>)}</div></section>}

      {(isPublisher || assignment) && <section className="card"><h2>协作留言</h2><div className="form-stack">{comments.length ? comments.map((item) => <div key={item.id}><strong>{item.author.displayName}</strong><p className="prose">{item.content}</p></div>) : <p className="muted">还没有留言。任务参与者可以在这里补充信息。</p>}<Textarea aria-label="新留言" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="仅发布者和参与者可见；请不要填写敏感个人信息" /><Button disabled={busy || !comment.trim()} onClick={async () => { await action(`/tasks/${id}/comments`, { content: comment }); setComment(""); }}>发送留言</Button></div></section>}
    </div>

    <aside className="detail-side">
      <section className="card"><h2>时间</h2><dl className="stat-list">
        <div><dt>安排</dt><dd>{taskTimeLabel(task)}</dd></div>
      </dl></section>
      {task.rewardDescription && <section className="card task-reward-panel"><h2><Gift size={17} />完成奖励</h2><p>{task.rewardDescription}</p></section>}
      <section className="card form-stack">
        {error && <div className="form-message" role="alert">{error}</div>}
        {!user && <Link className="button" href={`/login?next=/tasks/${id}`}>登录后查看</Link>}
        {user && !isPublisher && !assignment && ["PUBLISHED", "CLAIMED"].includes(task.status) && (task.claimMode === "AUTO"
          ? <Button disabled={busy} onClick={() => void action(`/tasks/${id}/claim`)}>我来做</Button>
          : <><Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="想说的话" /><Button disabled={busy || !message.trim()} onClick={() => void action(`/tasks/${id}/applications`, { message })}>告诉对方</Button></>)}
        {isPublisher && task.status === "DRAFT" && <Button disabled={busy} onClick={() => void action(`/tasks/${id}/publish`)}>放进清单</Button>}
        {isPublisher && ["DRAFT", "PUBLISHED"].includes(task.status) && <Link className="button secondary" href={`/tasks/${id}/edit`}>修改</Link>}
        {isPublisher && ["DRAFT", "PUBLISHED"].includes(task.status) && <Button className="danger" disabled={busy} onClick={() => window.confirm("确定从清单里取消这件事？") && void action(`/tasks/${id}/cancel`)}>取消</Button>}
        {assignment?.status === "ASSIGNED" && task.status === "CLAIMED" && <Button disabled={busy} onClick={() => void action(`/tasks/${id}/start`)}>确认开始</Button>}
        {assignment && ["IN_PROGRESS", "REVISION_REQUESTED"].includes(task.status) && <><Textarea value={submission} onChange={(event) => setSubmission(event.target.value)} placeholder="写下完成情况" /><Button disabled={busy || !submission.trim()} onClick={() => void action(`/tasks/${id}/submissions`, { content: submission })}>告诉对方已完成</Button></>}
      </section>
      <div className="notice">这件事只在 la vie 成员之间可见。</div>
    </aside>
  </div>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
