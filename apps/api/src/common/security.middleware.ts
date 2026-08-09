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

    const configuredOrigin = process.env.PUBLIC_APP_URL;
    const origin = req.header("origin");
    if (configuredOrigin && origin && new URL(configuredOrigin).origin !== origin) {
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
}
