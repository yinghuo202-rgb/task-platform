"use client";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

type Envelope<T> = { data: T; meta?: Record<string, unknown>; requestId: string };

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  const part = document.cookie.split("; ").find((item) => item.startsWith("csrf_token="));
  return part ? decodeURIComponent(part.split("=").slice(1).join("=")) : "";
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<Envelope<T>> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers.set("x-csrf-token", csrfToken());
  const response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: "include" });
  if (response.status === 401 && retry && path !== "/auth/refresh") {
    const refreshed = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
    if (refreshed.ok) return apiFetch<T>(path, init, false);
  }
  const payload = await response.json() as Envelope<T> | { message?: string; code?: string };
  if (!response.ok) throw new ApiError("message" in payload ? payload.message ?? "请求失败" : "请求失败", response.status, "code" in payload ? payload.code ?? "REQUEST_FAILED" : "REQUEST_FAILED");
  return payload as Envelope<T>;
}

export const postJson = <T>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
