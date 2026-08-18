"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import type { ProjectSummary } from "@task-platform/shared-types";
import { taskSchema, type TaskInput } from "@task-platform/shared-validation";
import { apiFetch, ApiError } from "@/lib/api";
import { Button, Field, Input, Textarea } from "./ui";

const defaults: TaskInput = {
  projectId: "", title: "", summary: "", description: "稍后一起补充", visibility: "PRIVATE",
  claimMode: "AUTO", maxAssignees: 1, rewardType: "OTHER", rewardAmount: null,
  rewardDescription: "", locationType: "UNSPECIFIED", locationDescription: "",
  timeMode: "BEFORE", durationValue: 1, durationUnit: "DAYS", deadline: null,
  requirements: [{ title: "完成确认", description: "完成后由对方确认即可", required: true, sortOrder: 0 }],
};

type ExistingTask = TaskInput & { id: string; version: number; deadline: string | null };

export function TaskForm({ taskId, initialProjectId = "" }: { taskId?: string; initialProjectId?: string }) {
  const router = useRouter();
  const [loadError, setLoadError] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const form = useForm<TaskInput>({
    resolver: zodResolver(taskSchema),
    defaultValues: { ...defaults, projectId: initialProjectId },
  });
  const timeMode = useWatch({ control: form.control, name: "timeMode" });
  const selectedProjectId = useWatch({ control: form.control, name: "projectId" });
  const selectedProject = projects.find((project) => project.id === selectedProjectId);

  useEffect(() => {
    void apiFetch<ProjectSummary[]>("/projects")
      .then(({ data }) => {
        setProjects(data);
        if (!form.getValues("projectId") && data[0]) form.setValue("projectId", data[0].id);
      })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "项目加载失败"))
      .finally(() => setProjectsLoading(false));
  }, [form]);

  useEffect(() => {
    if (!taskId) return;
    void apiFetch<ExistingTask>(`/tasks/${taskId}`).then(({ data }) => form.reset({
      ...data,
      rewardAmount: data.rewardAmount,
      deadline: data.deadline ? toDateTimeLocal(data.deadline) : null,
      requirements: data.requirements.map((item, index) => ({ ...item, sortOrder: index })),
    })).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "任务加载失败"));
  }, [taskId, form]);

  const submit = form.handleSubmit(async (values) => {
    try {
      const normalized = {
        ...values,
        description: values.summary,
        visibility: "PRIVATE" as const,
        claimMode: "AUTO" as const,
        maxAssignees: 1,
        rewardType: "OTHER" as const,
        rewardAmount: null,
        locationType: "UNSPECIFIED" as const,
        durationValue: values.timeMode === "WITHIN" ? values.durationValue : null,
        durationUnit: values.timeMode === "WITHIN" ? values.durationUnit : null,
        requirements: [{
          title: "完成确认",
          description: "完成后由对方确认即可",
          required: true,
          sortOrder: 0,
        }],
        deadline: values.timeMode === "WITHIN" ? null : values.deadline ? new Date(values.deadline).toISOString() : null,
      };
      const currentVersion = taskId ? (await apiFetch<{ version: number }>(`/tasks/${taskId}`)).data.version : undefined;
      const result = taskId
        ? await apiFetch<{ id: string }>(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ ...normalized, version: currentVersion }) })
        : await apiFetch<{ id: string }>("/tasks", { method: "POST", body: JSON.stringify(normalized) });
      if (!taskId) await apiFetch(`/tasks/${result.data.id}/publish`, { method: "POST" });
      router.push(`/tasks/${result.data.id}`);
    } catch (error) {
      form.setError("root", { message: error instanceof ApiError ? error.message : "保存失败，请稍后重试" });
    }
  });

  if (loadError && !projects.length) return <div className="form-stack"><div className="form-message">{loadError}</div><Link className="button secondary" href="/login">登录后继续</Link></div>;
  return <form className="form-stack" onSubmit={(event) => event.preventDefault()} noValidate>
    <input type="hidden" {...form.register("projectId")} />
    <input type="hidden" {...form.register("description")} />
    <div className="task-space-note"><span style={{ background: selectedProject?.color ?? "#91c5b6" }} />{projectsLoading ? "正在打开 la vie…" : selectedProject?.name ?? "la vie"}</div>
    <Field label="想请对方做的事" required error={form.formState.errors.title?.message}><Input autoFocus placeholder="例如：帮我选一张照片做头像" {...form.register("title")} /></Field>
    <Field label="什么时候" required error={form.formState.errors.timeMode?.message}>
      <select className="input" {...form.register("timeMode")}>
        <option value="BEFORE">在某个时间前</option>
        <option value="WITHIN">开始后一段时间内</option>
        <option value="AT">约在具体时间</option>
      </select>
    </Field>
    {timeMode === "WITHIN"
      ? <div className="form-grid">
        <Field label="多长时间内" required error={form.formState.errors.durationValue?.message}><Input type="number" min="1" step="1" {...form.register("durationValue", { valueAsNumber: true })} /></Field>
        <Field label="单位" required error={form.formState.errors.durationUnit?.message}><select className="input" {...form.register("durationUnit")}><option value="MINUTES">分钟</option><option value="HOURS">小时</option><option value="DAYS">天</option></select></Field>
      </div>
      : <Field label={timeMode === "AT" ? "具体执行时间" : "截止时间"} required error={form.formState.errors.deadline?.message}><Input type="datetime-local" {...form.register("deadline")} /></Field>}
    <Field label="备注" required error={form.formState.errors.summary?.message}><Textarea style={{ minHeight: 110 }} placeholder="写下要准备的东西，或想告诉对方的话" {...form.register("summary")} /></Field>
    <Field label="完成奖励（可选）" error={form.formState.errors.rewardDescription?.message}><Input aria-label="完成奖励" placeholder="例如：请喝奶茶、周末做一顿饭、送一束花" maxLength={500} {...form.register("rewardDescription")} /></Field>
    {form.formState.errors.root?.message && <div className="form-message" role="alert">{form.formState.errors.root.message}</div>}
    {!projectsLoading && !projects.length && <div className="notice">你还没有加入 la vie，请联系空间管理员。</div>}
    <Button type="button" disabled={form.formState.isSubmitting || !projects.length} onClick={() => void submit()}>{form.formState.isSubmitting ? "保存中…" : taskId ? "保存修改" : "发布给对方"}</Button>
  </form>;
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
