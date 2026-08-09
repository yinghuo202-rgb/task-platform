import { Injectable, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "../common/auth-context";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

const person = { id: true, username: true, displayName: true, avatarPath: true } as const;

@Injectable()
export class SharedWishesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    const projectId = await this.resolveProjectId(user);
    return this.prisma.sharedWish.findMany({
      where: { projectId },
      include: { createdBy: { select: person }, completedBy: { select: person } },
      orderBy: [{ completedAt: { sort: "asc", nulls: "first" } }, { position: "asc" }, { createdAt: "asc" }],
    });
  }

  async create(user: AuthUser, title: string) {
    const projectId = await this.resolveProjectId(user);
    await this.projects.assertCompanionContributor(projectId, user);
    const last = await this.prisma.sharedWish.aggregate({ where: { projectId }, _max: { position: true } });
    const wish = await this.prisma.sharedWish.create({
      data: { projectId, title: title.trim(), position: (last._max.position ?? 0) + 1, createdById: user.id },
      include: { createdBy: { select: person }, completedBy: { select: person } },
    });
    await this.audit.record({ actorId: user.id, action: "SHARED_WISH_CREATED", entityType: "SharedWish", entityId: wish.id });
    return wish;
  }

  async complete(id: string, user: AuthUser, completed: boolean) {
    const wish = await this.prisma.sharedWish.findUnique({ where: { id }, select: { id: true, projectId: true, completedAt: true } });
    if (!wish) throw new NotFoundException("一起做的事不存在");
    await this.projects.assertCompanionContributor(wish.projectId, user);
    const updated = await this.prisma.sharedWish.update({
      where: { id },
      data: completed
        ? { completedAt: wish.completedAt ?? new Date(), completedById: wish.completedAt ? undefined : user.id }
        : { completedAt: null, completedById: null },
      include: { createdBy: { select: person }, completedBy: { select: person } },
    });
    await this.audit.record({
      actorId: user.id,
      action: completed ? "SHARED_WISH_COMPLETED" : "SHARED_WISH_REOPENED",
      entityType: "SharedWish",
      entityId: id,
    });
    return updated;
  }

  private async resolveProjectId(user: AuthUser): Promise<string> {
    const project = await this.prisma.project.findFirst({
      where: {
        archivedAt: null,
        kind: "COMPANION",
        ...(user.role === "ADMIN" ? {} : { members: { some: { userId: user.id } } }),
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!project) throw new NotFoundException("还没有可用的 la vie 空间");
    await this.projects.assertCompanionMember(project.id, user);
    return project.id;
  }
}
