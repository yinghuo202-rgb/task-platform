import { afterEach, describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { ForbiddenException } from "@nestjs/common";
import { SecurityMiddleware } from "./security.middleware";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

function request(origin: string, protocol = "https"): Request {
  return {
    method: "POST",
    path: "/api/v1/entries/import",
    protocol,
    cookies: {},
    header(name: string) {
      return name.toLowerCase() === "origin" ? origin : undefined;
    },
    get(name: string) {
      return name.toLowerCase() === "host" ? "notes.example.com" : undefined;
    },
  } as unknown as Request;
}

describe("SecurityMiddleware", () => {
  it("accepts the same public host when the app is opened through a remote domain", () => {
    process.env.PUBLIC_APP_URL = "http://192.168.0.164:8081";
    const next = () => undefined;

    expect(() => new SecurityMiddleware().use(request("https://notes.example.com"), {} as Response, next)).not.toThrow();
  });

  it("accepts explicitly configured additional origins", () => {
    process.env.PUBLIC_APP_URL = "http://192.168.0.164:8081";
    process.env.ALLOWED_ORIGINS = "https://notes.example.com, https://vpn.example.com";
    const next = () => undefined;

    expect(() => new SecurityMiddleware().use(request("https://vpn.example.com"), {} as Response, next)).not.toThrow();
  });

  it("accepts HTTPS origin when the proxy-to-API hop is HTTP", () => {
    process.env.PUBLIC_APP_URL = "http://192.168.0.164:8081";
    const next = () => undefined;

    expect(() => new SecurityMiddleware().use(request("https://notes.example.com", "http"), {} as Response, next)).not.toThrow();
  });

  it("rejects a different origin and keeps the existing CSRF protection", () => {
    process.env.PUBLIC_APP_URL = "http://192.168.0.164:8081";
    const next = () => undefined;

    expect(() => new SecurityMiddleware().use(request("https://attacker.example.com"), {} as Response, next)).toThrow(ForbiddenException);
  });
});
