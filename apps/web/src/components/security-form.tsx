"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { apiFetch, ApiError } from "@/lib/api";
import { Button, Field, Input } from "./ui";

type Values = { currentPassword: string; newPassword: string; confirmPassword: string };

export function SecurityForm() {
  const [message, setMessage] = useState("");
  const form = useForm<Values>();
  const submit = form.handleSubmit(async (values) => {
    if (values.newPassword !== values.confirmPassword) return form.setError("confirmPassword", { message: "两次密码不一致" });
    try {
      await apiFetch("/auth/password", { method: "PATCH", body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }) });
      form.reset(); setMessage("密码已修改，其他登录会话已撤销");
    } catch (error) { form.setError("root", { message: error instanceof ApiError ? error.message : "修改失败" }); }
  });
  return <form className="form-card form-stack" onSubmit={submit}>
    <Field label="当前密码" required><Input type="password" autoComplete="current-password" {...form.register("currentPassword", { required: true })} /></Field>
    <Field label="新密码" required error={form.formState.errors.newPassword?.message}><Input type="password" autoComplete="new-password" {...form.register("newPassword", { minLength: { value: 8, message: "密码至少 8 位" } })} /></Field>
    <Field label="确认新密码" required error={form.formState.errors.confirmPassword?.message}><Input type="password" autoComplete="new-password" {...form.register("confirmPassword", { required: true })} /></Field>
    {form.formState.errors.root?.message && <div className="form-message">{form.formState.errors.root.message}</div>}
    {message && <div className="notice">{message}</div>}
    <Button disabled={form.formState.isSubmitting}>修改密码并撤销其他会话</Button>
  </form>;
}
