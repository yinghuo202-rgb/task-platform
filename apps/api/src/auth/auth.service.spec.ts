import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { PrismaService } from "../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import { AuthService } from "./auth.service";

const user = {
  id: "d10bee99-df82-4e40-9955-e9d3c9500a57",
  username: "worker",
  email: "worker@example.test",
  displayName: "Worker",
  avatarPath: null,
  bio: null,
  role: "USER" as const,
  status: "ACTIVE" as const,
  passwordHash: "",
};

function createHarness(overrides: Record<string, string> = {}) {
  const cookie = vi.fn();
  const prisma = {
    user: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    authSession: { create: vi.fn(), update: vi.fn() },
  };
  const audit = { record: vi.fn() };
  const config = new ConfigService({
    APP_ENV: "development",
    JWT_ACCESS_SECRET: "a".repeat(40), JWT_REFRESH_SECRET: "b".repeat(40),
    JWT_ACCESS_EXPIRES_IN: "15m", JWT_REFRESH_EXPIRES_IN: "30d", COOKIE_SECURE: "false",
    ...overrides,
  });
  const service = new AuthService(prisma as unknown as PrismaService, new JwtService(), config, audit as unknown as AuditService);
  const req = { ip: "127.0.0.1", header: () => "vitest" } as unknown as Request;
  const res = { cookie, clearCookie: vi.fn() } as unknown as Response;
  return { service, prisma, audit, req, res, cookie };
}

describe("AuthService", () => {
  it("registers with Argon2id and creates an authenticated session", async () => {
    const harness = createHarness();
    harness.prisma.user.findFirst.mockResolvedValue(null);
    harness.prisma.user.create.mockImplementation(async ({ data }: { data: { passwordHash: string } }) => ({ ...user, passwordHash: data.passwordHash }));
    harness.prisma.authSession.create.mockResolvedValue({ id: "a17bbfa6-bc5a-4364-ab86-b8e8f87a6862" });
    harness.prisma.authSession.update.mockResolvedValue({});
    const result = await harness.service.register({ username: user.username, email: user.email, displayName: user.displayName, password: "StrongPass123!" }, harness.req, harness.res);
    const created = harness.prisma.user.create.mock.calls[0]?.[0] as { data: { passwordHash: string } };
    expect(created.data.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(result.email).toBe(user.email);
    expect(harness.cookie).toHaveBeenCalledWith("access_token", expect.any(String), expect.objectContaining({ httpOnly: true }));
  });

  it("requires the private-space invite code in production", async () => {
    const harness = createHarness({ APP_ENV: "production", REGISTRATION_INVITE_CODE: "our-private-invite" });
    await expect(harness.service.register({ username: user.username, email: user.email, displayName: user.displayName, password: "StrongPass123!" }, harness.req, harness.res)).rejects.toThrow("空间邀请码不正确");
    expect(harness.prisma.user.create).not.toHaveBeenCalled();
  });

  it("logs in with a valid password", async () => {
    const harness = createHarness();
    const passwordHash = await argon2.hash("StrongPass123!", { type: argon2.argon2id });
    harness.prisma.user.findFirst.mockResolvedValue({ ...user, passwordHash });
    harness.prisma.user.update.mockResolvedValue({});
    harness.prisma.authSession.create.mockResolvedValue({ id: "a17bbfa6-bc5a-4364-ab86-b8e8f87a6862" });
    harness.prisma.authSession.update.mockResolvedValue({});
    const result = await harness.service.login({ identifier: user.email, password: "StrongPass123!" }, harness.req, harness.res);
    expect(result.username).toBe("worker");
    expect(harness.cookie).toHaveBeenCalledTimes(3);
  });

  it("matches usernames without changing their case", async () => {
    const harness = createHarness();
    const passwordHash = await argon2.hash("StrongPass123!", { type: argon2.argon2id });
    harness.prisma.user.findFirst.mockResolvedValue({ ...user, username: "Cristina_zl", passwordHash });
    harness.prisma.user.update.mockResolvedValue({});
    harness.prisma.authSession.create.mockResolvedValue({ id: "a17bbfa6-bc5a-4364-ab86-b8e8f87a6862" });
    harness.prisma.authSession.update.mockResolvedValue({});

    await harness.service.login({ identifier: "cristina_zl", password: "StrongPass123!" }, harness.req, harness.res);

    expect(harness.prisma.user.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ email: "cristina_zl" }, { username: { equals: "cristina_zl", mode: "insensitive" } }] },
    });
  });
});
