import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { EntriesService } from "./entries.service";

const user = { id: "11111111-1111-4111-8111-111111111111", sessionId: "session", role: "USER" as const };

describe("EntriesService private-space permissions", () => {
  it("does not let a viewer create a hand journal entry", async () => {
    const transaction = vi.fn();
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" }) },
      projectMember: { findUnique: vi.fn().mockResolvedValue({ role: "VIEWER", project: { archivedAt: null, kind: "COMPANION" } }) },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new EntriesService(prisma, new ConfigService());

    await expect(service.create(user, {
      type: "JOURNAL",
      title: "今天",
      contentMarkdown: "一起散步",
      entryDate: "2026-08-09",
      visibility: "PUBLIC",
      tags: [],
    })).rejects.toThrow("只有查看权限");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("only lists published entries within the requested date range", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" }) },
      entry: { findMany, count: vi.fn().mockResolvedValue(0) },
    } as unknown as PrismaService;
    const service = new EntriesService(prisma, new ConfigService());

    await service.list(user, { view: "index", limit: 5000, from: "2026-08-01", to: "2026-09-01" });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "PUBLISHED", entryDate: { gte: expect.any(Date), lt: expect.any(Date) } }),
    }));
  });
});
