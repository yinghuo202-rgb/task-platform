"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth, type Viewer } from "@/lib/auth";
import { Button, Field, Input, Textarea } from "./ui";

type Values = { displayName: string; bio: string };

export function ProfileForm() {
  const { user, refresh } = useAuth();
  const [message, setMessage] = useState("");
  const form = useForm<Values>({ defaultValues: { displayName: "", bio: "" } });
  useEffect(() => { if (user) form.reset({ displayName: user.displayName, bio: user.bio ?? "" }); }, [user, form]);
  const submit = form.handleSubmit(async (values) => {
    setMessage("");
    try {
      await apiFetch<Viewer>("/users/me", { method: "PATCH", body: JSON.stringify(values) });
      await refresh();
      setMessage("个人资料已保存");
    } catch (error) { form.setError("root", { message: error instanceof ApiError ? error.message : "保存失败" }); }
  });
  return <form className="form-card form-stack" onSubmit={submit}>
    <Field label="用户名"><Input value={user?.username ?? ""} disabled /></Field>
    <Field label="邮箱"><Input value={user?.email ?? ""} disabled /></Field>
    <Field label="显示名称" required error={form.formState.errors.displayName?.message}><Input {...form.register("displayName", { required: "请输入显示名称", maxLength: 64 })} /></Field>
    <Field label="个人简介" error={form.formState.errors.bio?.message}><Textarea {...form.register("bio", { maxLength: { value: 1000, message: "最多 1000 个字符" } })} /></Field>
    {form.formState.errors.root?.message && <div className="form-message">{form.formState.errors.root.message}</div>}
    {message && <div className="notice" role="status">{message}</div>}
    <Button disabled={form.formState.isSubmitting}>保存资料</Button>
  </form>;
}
