import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "./projects.service";

const user = { id: "11111111-1111-4111-8111-111111111111", sessionId: "session", role: "USER" as const };

function serviceFor(role: "OWNER" | "MANAGER" | "MEMBER" | "VIEWER" | null) {
  const prisma = {
    project: { findFirst: vi.fn().mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" }) },
    projectMember: {
      findUnique: vi.fn().mockResolvedValue(role ? { role, project: { archivedAt: null } } : null),
    },
  } as unknown as PrismaService;
  return new ProjectsService(prisma, {} as AuditService);
}

describe("project permissions", () => {
  it.each(["OWNER", "MANAGER", "MEMBER"] as const)("allows %s to contribute", async (role) => {
    await expect(serviceFor(role).assertContributor("22222222-2222-4222-8222-222222222222", user)).resolves.toBe(role);
  });

  it("keeps viewers read-only", async () => {
    await expect(serviceFor("VIEWER").assertContributor("22222222-2222-4222-8222-222222222222", user)).rejects.toThrow("没有执行此操作的权限");
  });

  it("keeps la vie viewers read-only", async () => {
    await expect(serviceFor("VIEWER").assertCompanionContributor("22222222-2222-4222-8222-222222222222", user)).rejects.toThrow("只有查看权限");
  });

  it("rejects users outside the project", async () => {
    await expect(serviceFor(null).assertMember("22222222-2222-4222-8222-222222222222", user)).rejects.toThrow("不是该项目成员");
  });

  it("persists the selected private-space kind instead of inferring it from the name", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      name: "可以随时改名",
      kind: "COMPANION",
      members: [{ userId: user.id, role: "OWNER" }],
    });
    const record = vi.fn();
    const service = new ProjectsService(
      { project: { findFirst: vi.fn().mockResolvedValue(null), create } } as unknown as PrismaService,
      { record } as unknown as AuditService,
    );

    await service.create(user, { name: "可以随时改名", kind: "COMPANION" });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ kind: "COMPANION" }),
    }));
    expect(record).toHaveBeenCalled();
  });
});
