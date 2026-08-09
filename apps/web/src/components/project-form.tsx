"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import type { ProjectKind, ProjectSummary } from "@task-platform/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { Button, Field, Input, Textarea } from "./ui";

type Values = { name: string; description: string; color: string; kind: ProjectKind };

const projectKinds: Array<{ kind: ProjectKind; icon: string; title: string; description: string; color: string }> = [
  { kind: "COMPANION", icon: "✦", title: "la vie", description: "日历、手帐和两个人的清单", color: "#8fb8ab" },
  { kind: "GENERAL", icon: "○", title: "其他空间", description: "标准任务清单与成员协作", color: "#8498c2" },
];

export function ProjectForm() {
  const router = useRouter();
  const form = useForm<Values>({ defaultValues: { name: "", description: "", color: "#3157f6", kind: "GENERAL" } });
  const selectedKind = useWatch({ control: form.control, name: "kind" });
  const submit = form.handleSubmit(async (values) => {
    try {
      const project = await apiFetch<ProjectSummary>("/projects", { method: "POST", body: JSON.stringify(values) });
      router.push(`/projects/${project.data.id}`);
    } catch (error) {
      form.setError("root", { message: error instanceof ApiError ? error.message : "项目创建失败" });
    }
  });

  return <form className="form-card form-stack" onSubmit={submit}>
    <Field label="空间布局" required>
      <div className="project-kind-picker" role="group" aria-label="空间布局">
        {projectKinds.map((item) => <button type="button" aria-label={`${item.title}：${item.description}`} aria-pressed={selectedKind === item.kind} className={`project-kind-option kind-${item.kind.toLowerCase()} ${selectedKind === item.kind ? "active" : ""}`} key={item.kind} onClick={() => { form.setValue("kind", item.kind, { shouldDirty: true }); form.setValue("color", item.color, { shouldDirty: true }); }}>
          <span aria-hidden="true">{item.icon}</span><strong>{item.title}</strong><small>{item.description}</small>
        </button>)}
      </div>
    </Field>
    <Field label="空间名称" required error={form.formState.errors.name?.message}><Input placeholder={selectedKind === "COMPANION" ? "例如：la vie" : "例如：家庭计划"} {...form.register("name", { required: "请输入空间名称", minLength: { value: 2, message: "至少输入 2 个字符" } })} /></Field>
    <Field label="项目说明"><Textarea placeholder="说明项目目标、范围和协作约定" {...form.register("description")} /></Field>
    <Field label="项目颜色"><Input type="color" {...form.register("color")} /></Field>
    {form.formState.errors.root?.message && <div className="form-message" role="alert">{form.formState.errors.root.message}</div>}
    <Button disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "正在创建…" : "创建项目"}</Button>
  </form>;
}
