import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { ProjectsService } from "../projects/projects.service";
import { TasksService } from "./tasks.service";

describe("task project visibility", () => {
  it("filters the task list to a regular member's projects", async () => {
    const findMany = vi.fn().mockReturnValue(Promise.resolve([]));
    const count = vi.fn().mockReturnValue(Promise.resolve(0));
    const prisma = {
      task: { findMany, count },
      $transaction: vi.fn().mockResolvedValue([[], 0]),
    } as unknown as PrismaService;
    const service = new TasksService(prisma, {} as AuditService, {} as ProjectsService);

    await service.list({
      page: 1,
      pageSize: 20,
      sort: "createdAt",
      order: "desc",
    }, {
      id: "11111111-1111-4111-8111-111111111111",
      sessionId: "session",
      role: "USER",
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        project: expect.objectContaining({
          archivedAt: null,
          kind: "COMPANION",
          members: { some: { userId: "11111111-1111-4111-8111-111111111111" } },
        }),
      }),
    }));
  });

  it("lists only the other person's open tasks as available to claim", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      task: { findMany, count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn().mockImplementation(async (operations) => Promise.all(operations)),
    } as unknown as PrismaService;
    const service = new TasksService(prisma, {} as AuditService, {} as ProjectsService);

    await service.list({
      page: 1,
      pageSize: 20,
      sort: "createdAt",
      order: "desc",
      scope: "available",
    }, {
      id: "11111111-1111-4111-8111-111111111111",
      sessionId: "session",
      role: "USER",
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        publisherId: { not: "11111111-1111-4111-8111-111111111111" },
        status: "PUBLISHED",
        assignments: { none: { assigneeId: "11111111-1111-4111-8111-111111111111" } },
      }),
    }));
  });

  it("notifies the other active project members when a task is published", async () => {
    const notificationCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    const taskUpdate = vi.fn().mockResolvedValue({ id: "task-id", status: "PUBLISHED" });
    const prisma = {
      task: { findUnique: vi.fn().mockResolvedValue({ id: "task-id", projectId: "project-id", publisherId: "publisher-id", title: "一起整理照片", status: "DRAFT", rewardType: "OTHER" }) },
      projectMember: { findMany: vi.fn().mockResolvedValue([{ userId: "partner-id" }]) },
      $transaction: vi.fn().mockImplementation((callback) => callback({ task: { update: taskUpdate }, notification: { createMany: notificationCreateMany } })),
    } as unknown as PrismaService;
    const audit = { record: vi.fn() } as unknown as AuditService;
    const projects = { assertCompanionContributor: vi.fn().mockResolvedValue("MEMBER") } as unknown as ProjectsService;
    const service = new TasksService(prisma, audit, projects);

    await service.publish("task-id", { id: "publisher-id", sessionId: "session", role: "USER" });

    expect(notificationCreateMany).toHaveBeenCalledWith({ data: [{ userId: "partner-id", taskId: "task-id", type: "TASK_PUBLISHED", title: "有新任务发布", content: "一起整理照片" }] });
  });
});
