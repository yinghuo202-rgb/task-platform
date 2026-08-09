import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { ProjectsService } from "../projects/projects.service";
import { SharedWishesService } from "./shared-wishes.service";

const user = { id: "11111111-1111-4111-8111-111111111111", sessionId: "session", role: "USER" as const };

describe("SharedWishesService", () => {
  it("records who completed a shared wish and can reopen it", async () => {
    const update = vi.fn().mockImplementation(({ data }) => ({ id: "wish-id", ...data }));
    const prisma = {
      sharedWish: { findUnique: vi.fn().mockResolvedValue({ id: "wish-id", projectId: "project-id", completedAt: null }), update },
    } as unknown as PrismaService;
    const projects = { assertCompanionContributor: vi.fn() } as unknown as ProjectsService;
    const audit = { record: vi.fn() } as unknown as AuditService;
    const service = new SharedWishesService(prisma, projects, audit);

    await service.complete("wish-id", user, true);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ completedById: user.id, completedAt: expect.any(Date) }) }));

    vi.mocked((prisma as unknown as { sharedWish: { findUnique: ReturnType<typeof vi.fn> } }).sharedWish.findUnique).mockResolvedValueOnce({ id: "wish-id", projectId: "project-id", completedAt: new Date() });
    await service.complete("wish-id", user, false);
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { completedAt: null, completedById: null } }));
  });
});
