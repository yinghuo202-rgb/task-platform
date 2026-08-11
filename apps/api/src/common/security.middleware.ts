import { timingSafeEqual } from "node:crypto";
import { ForbiddenException, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_EXEMPT = new Set([
  "/api/v1/auth/register",
  "/api/v1/auth/login",
  "/api/v1/auth/refresh",
]);

export class SecurityMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.header("origin");
    if (origin && !this.allowedOrigins(req).has(origin) && !this.isLoopbackOrigin(origin)) {
      throw new ForbiddenException({ code: "INVALID_ORIGIN", message: "请求来源不受信任" });
    }

    if (!CSRF_EXEMPT.has(req.path) && req.cookies?.access_token) {
      const cookie = typeof req.cookies.csrf_token === "string" ? req.cookies.csrf_token : "";
      const header = req.header("x-csrf-token") ?? "";
      const a = Buffer.from(cookie);
      const b = Buffer.from(header);
      if (!cookie || a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new ForbiddenException({ code: "CSRF_VALIDATION_FAILED", message: "CSRF 校验失败，请刷新页面后重试" });
      }
    }
    next();
  }

  private allowedOrigins(req: Request): Set<string> {
    const origins = new Set<string>();
    for (const value of [process.env.PUBLIC_APP_URL, ...(process.env.ALLOWED_ORIGINS ?? "").split(",")]) {
      if (!value?.trim()) continue;
      try { origins.add(new URL(value.trim()).origin); } catch { /* ConfigModule validates PUBLIC_APP_URL; ignore malformed optional entries. */ }
    }
    // The browser and the API are normally same-origin. Deriving the public
    // request origin lets a reverse proxy serve the same private app through
    // a LAN IP, a VPN address, or an HTTPS domain without editing secrets.
    const host = req.get("host");
    if (host) {
      // TLS is often terminated by the NAS or an upstream tunnel. The hop
      // between that proxy and this container can still be HTTP, so accept
      // either scheme for the exact public Host seen by this request.
      origins.add(`http://${host}`);
      origins.add(`https://${host}`);
    }
    return origins;
  }

  private isLoopbackOrigin(origin: string): boolean {
    try {
      const url = new URL(origin);
      return (url.protocol === "http:" || url.protocol === "https:")
        && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
    } catch {
      return false;
    }
  }
}
