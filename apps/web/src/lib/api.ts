"use client";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

type Envelope<T> = { data: T; meta?: Record<string, unknown>; requestId: string };

let refreshRequest: Promise<boolean> | null = null;
const REFRESH_EXEMPT_PATHS = new Set(["/auth/login", "/auth/register", "/auth/refresh"]);

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
  const response = await fetchResponse(`/api/v1${path}`, { ...init, headers, credentials: "include" });
  if (response.status === 401 && retry && !REFRESH_EXEMPT_PATHS.has(path)) {
    if (await refreshSession()) return apiFetch<T>(path, init, false);
  }
  const raw = await response.text();
  const payload = parsePayload(raw);
  if (!response.ok) {
    const message = response.status === 429
      ? "操作太快了，请稍等片刻再试"
      : typeof payload?.message === "string" ? payload.message : `请求失败（${response.status}）`;
    const code = typeof payload?.code === "string" ? payload.code : response.status === 429 ? "TOO_MANY_REQUESTS" : "REQUEST_FAILED";
    throw new ApiError(message, response.status, code);
  }
  if (!payload || !("data" in payload)) throw new ApiError("服务器返回格式不正确", 502, "INVALID_RESPONSE");
  return payload as Envelope<T>;
}

function refreshSession(): Promise<boolean> {
  if (refreshRequest) return refreshRequest;
  refreshRequest = runSessionRefresh().finally(() => { refreshRequest = null; });
  return refreshRequest;
}

async function runSessionRefresh(): Promise<boolean> {
  const refresh = async () => {
    const active = await fetchResponse("/api/v1/auth/me", { method: "GET", credentials: "include" });
    if (active.ok) return true;
    const response = await fetchResponse("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
    return response.ok;
  };
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("la-vie-session-refresh", refresh);
  }
  return refresh();
}

async function fetchResponse(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError("网络连接失败，请检查 NAS 连接后重试", 0, "NETWORK_ERROR");
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function parsePayload(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export const postJson = <T>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
