import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import { AdminService } from "./admin.service";

const actor = { id: "11111111-1111-4111-8111-111111111111", sessionId: "session", role: "ADMIN" as const };
const userId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";

function setup(existingRole: "OWNER" | "MEMBER" | null = null, status: "ACTIVE" | "DISABLED" = "ACTIVE") {
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: userId, status }) },
    project: { findUnique: vi.fn().mockResolvedValue({ id: projectId, archivedAt: null }) },
    projectMember: {
      findUnique: vi.fn().mockResolvedValue(existingRole ? { id: "membership", projectId, userId, role: existingRole } : null),
      upsert: vi.fn().mockResolvedValue({ id: "membership", projectId, userId, role: "MEMBER", project: { id: projectId, name: "项目 A", color: "#3157f6" } }),
    },
  } as unknown as PrismaService;
  const audit = { record: vi.fn() } as unknown as AuditService;
  return { service: new AdminService(prisma, audit), prisma, audit };
}

describe("admin project access", () => {
  it("assigns an active member to a project", async () => {
    const { service, prisma, audit } = setup();
    await service.assignProject(actor, userId, projectId, "MEMBER");
    expect(prisma.projectMember.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { projectId, userId, role: "MEMBER" },
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "ADMIN_PROJECT_ACCESS_GRANTED" }));
  });

  it("protects the project owner role", async () => {
    await expect(setup("OWNER").service.assignProject(actor, userId, projectId, "VIEWER")).rejects.toThrow("不能修改项目负责人的权限");
  });

  it("requires an active account before assigning access", async () => {
    await expect(setup(null, "DISABLED").service.assignProject(actor, userId, projectId, "MEMBER")).rejects.toThrow("请先恢复该成员账号");
  });
});

describe("admin order overview", () => {
  it("summarizes active and completed orders for every member", async () => {
    const prisma = {
      user: { findMany: vi.fn().mockResolvedValue([{ id: userId, username: "player", displayName: "陪玩成员", status: "ACTIVE" }]) },
      taskAssignment: { findMany: vi.fn().mockResolvedValue([
        { id: "a1", assigneeId: userId, status: "IN_PROGRESS" },
        { id: "a2", assigneeId: userId, status: "COMPLETED" },
      ]) },
    } as unknown as PrismaService;
    const service = new AdminService(prisma, { record: vi.fn() } as unknown as AuditService);

    await expect(service.orderOverview()).resolves.toEqual([
      expect.objectContaining({
        id: userId,
        stats: { active: 1, completed: 1, total: 2 },
        activeOrders: [expect.objectContaining({ id: "a1" })],
      }),
    ]);
  });
});
