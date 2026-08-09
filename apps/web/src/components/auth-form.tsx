"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from "@task-platform/shared-validation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Field, Input } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  return mode === "login" ? <LoginForm /> : <RegisterForm />;
}

function LoginForm() {
  const router = useRouter();
  const auth = useAuth();
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const submit = handleSubmit(async (values) => {
    try {
      await apiFetch("/auth/login", { method: "POST", body: JSON.stringify(values) });
      await auth.refresh();
      router.push("/dashboard");
    } catch (error) {
      setError("root", { message: error instanceof ApiError ? error.message : "网络异常，请稍后重试" });
    }
  });
  return <form className="form-stack" onSubmit={submit} noValidate>
    <Field label="用户名或邮箱" required error={errors.identifier?.message}><Input autoComplete="username" {...register("identifier")} /></Field>
    <Field label="密码" required error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register("password")} /></Field>
    {errors.root?.message && <div className="form-message" role="alert">{errors.root.message}</div>}
    <Button disabled={isSubmitting}>{isSubmitting ? "正在登录…" : "登录"}</Button>
    <p className="muted">还没有账号？<Link href="/register">立即注册</Link></p>
  </form>;
}

function RegisterForm() {
  const router = useRouter();
  const auth = useAuth();
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });
  const submit = handleSubmit(async (values) => {
    try {
      await apiFetch("/auth/register", { method: "POST", body: JSON.stringify(values) });
      await auth.refresh();
      router.push("/dashboard");
    } catch (error) {
      setError("root", { message: error instanceof ApiError ? error.message : "网络异常，请稍后重试" });
    }
  });
  return <form className="form-stack" onSubmit={submit} noValidate>
    <div className="form-grid">
      <Field label="用户名" required error={errors.username?.message}><Input autoCapitalize="none" autoComplete="username" {...register("username")} /></Field>
      <Field label="显示名称" required error={errors.displayName?.message}><Input autoComplete="name" {...register("displayName")} /></Field>
    </div>
    <Field label="邮箱" required error={errors.email?.message}><Input type="email" inputMode="email" autoComplete="email" {...register("email")} /></Field>
    <Field label="密码" required error={errors.password?.message}><Input type="password" autoComplete="new-password" {...register("password")} /></Field>
    <Field label="空间邀请码" error={errors.inviteCode?.message}><Input type="password" autoComplete="off" placeholder="由空间管理员提供" {...register("inviteCode")} /></Field>
    {errors.root?.message && <div className="form-message" role="alert">{errors.root.message}</div>}
    <Button disabled={isSubmitting}>{isSubmitting ? "正在加入…" : "加入 la vie"}</Button>
    <p className="muted">已有账号？<Link href="/login">返回登录</Link></p>
  </form>;
}
