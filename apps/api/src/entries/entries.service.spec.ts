import { ConfigService } from "@nestjs/config";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { StorageService } from "../storage/storage.service";
import { EntriesService } from "./entries.service";

const user = { id: "11111111-1111-4111-8111-111111111111", sessionId: "session", role: "USER" as const };
const storage = {} as StorageService;

describe("EntriesService private-space permissions", () => {
  it("stores the paragraph anchor with an inline journal comment", async () => {
    const create = vi.fn().mockImplementation(({ data }) => ({
      id: "comment-id",
      ...data,
      createdAt: new Date(),
      author: { id: "admin-id", username: "yinghuo202", displayName: "萤火" },
    }));
    const prisma = {
      entry: { findUnique: vi.fn().mockResolvedValue({ projectId: "project-id", visibility: "PUBLIC", createdById: "author-id", status: "PUBLISHED" }) },
      entryComment: { create },
    } as unknown as PrismaService;
    const service = new EntriesService(prisma, new ConfigService(), storage);

    await service.createComment({ id: "admin-id", sessionId: "session", role: "ADMIN" }, "entry-id", {
      content: "  我也记得  ",
      anchorBlock: 3,
      anchorQuote: "  那天一起散步  ",
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: { entryId: "entry-id", authorId: "admin-id", content: "我也记得", anchorBlock: 3, anchorQuote: "那天一起散步" },
    }));
  });

  it("does not let a viewer create a hand journal entry", async () => {
    const transaction = vi.fn();
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" }) },
      projectMember: { findUnique: vi.fn().mockResolvedValue({ role: "VIEWER", project: { archivedAt: null, kind: "COMPANION" } }) },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new EntriesService(prisma, new ConfigService(), storage);

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
    const service = new EntriesService(prisma, new ConfigService(), storage);

    await service.list(user, { view: "index", limit: 5000, from: "2026-08-01", to: "2026-09-01" });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "PUBLISHED", entryDate: { gte: expect.any(Date), lt: expect.any(Date) } }),
    }));
  });

  it("loads a small visible batch without exposing another member's private entries", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" }) },
      entry: { findMany },
    } as unknown as PrismaService;
    const service = new EntriesService(prisma, new ConfigService(), storage);

    await service.getMany(user, ["33333333-3333-4333-8333-333333333333"]);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ["33333333-3333-4333-8333-333333333333"] },
        projectId: "22222222-2222-4222-8222-222222222222",
        OR: [{ visibility: "PUBLIC" }, { visibility: "PRIVATE", createdById: user.id }],
      }),
    }));
  });

  it("keeps a calendar date unchanged when an ISO value contains a positive timezone", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" }) },
      entry: { findMany },
    } as unknown as PrismaService;
    const service = new EntriesService(prisma, new ConfigService(), storage);

    await service.list(user, { view: "list", limit: 20, date: "2026-08-11T00:00:00+08:00" });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ entryDate: new Date("2026-08-11T00:00:00.000Z") }),
    }));
  });

  it("imports entry and comment authors from the structured manifest", async () => {
    const importRoot = await mkdtemp(join(tmpdir(), "journal-import-"));
    const entryCreate = vi.fn().mockImplementation(({ data }) => ({ id: "entry-id", ...data }));
    const commentCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = vi.fn().mockImplementation(async (callback) => callback({
      entry: { create: entryCreate },
      entryVersion: { create: vi.fn() },
      entryComment: { createMany: commentCreateMany },
    }));
    const prisma = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" }) },
      user: { findMany: vi.fn().mockResolvedValue([
        { id: "admin-id", username: "yinghuo202", displayName: "萤火", role: "ADMIN", status: "ACTIVE" },
        { id: "cristina-id", username: "Cristina_zl", displayName: "Cristina", role: "USER", status: "ACTIVE" },
      ]) },
      projectMember: { findMany: vi.fn().mockResolvedValue([{ userId: "cristina-id" }]) },
      entry: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: transaction,
    } as unknown as PrismaService;
    const importedStorage = { importJournalAsset: vi.fn() } as unknown as StorageService;
    const service = new EntriesService(prisma, new ConfigService({ JOURNAL_IMPORT_DIR: importRoot }), importedStorage);
    await writeFile(join(importRoot, "entry.md"), "一起散步\n", "utf8");
    await writeFile(join(importRoot, "journal-import-manifest.json"), JSON.stringify({
      version: 1,
      entries: [{
        sourceId: "fragments:2026-03-29",
        file: "entry.md",
        title: "2026-03-29",
        date: "2026-03-29",
        authorUsername: "Cristina",
        category: "手帐",
        tags: ["旧手帐"],
        comments: [{ authorUsername: "yinghuo202", content: "我也记得" }],
      }],
      assets: [],
    }), "utf8");

    try {
      await expect(service.importMarkdown({ id: "admin-id", sessionId: "session", role: "ADMIN" })).resolves.toMatchObject({ imported: 1, comments: 1 });
      expect(entryCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ createdById: "cristina-id", title: "2026-03-29" }) }));
      expect(commentCreateMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ authorId: "admin-id", content: "我也记得" })] });
    } finally {
      await rm(importRoot, { recursive: true, force: true });
    }
  });
});
