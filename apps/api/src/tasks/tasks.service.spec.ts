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
});
