import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "../common/auth-context";
import type { ProjectRole, TaskStatus, UserStatus } from "../generated/prisma/enums";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  users(page = 1, pageSize = 20, search?: string) {
    return this.prisma.user.findMany({
      where: search ? { OR: [{ username: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : undefined,
      select: { id: true, username: true, email: true, displayName: true, role: true, status: true, createdAt: true, lastLoginAt: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  async accessOverview() {
    const [users, projects] = await Promise.all([
      this.prisma.user.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          displayName: true,
          role: true,
          status: true,
          projectMemberships: {
            select: {
              id: true,
              role: true,
              project: { select: { id: true, name: true, color: true, archivedAt: true, kind: true } },
            },
            orderBy: { joinedAt: "asc" },
          },
        },
        orderBy: [{ status: "asc" }, { displayName: "asc" }],
      }),
      this.prisma.project.findMany({
        where: { archivedAt: null, kind: "COMPANION" },
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      users: users.map((user) => ({
        ...user,
        projectMemberships: user.projectMemberships.filter((membership) => !membership.project.archivedAt && membership.project.kind === "COMPANION"),
      })),
      projects,
    };
  }

  async orderOverview() {
    const [users, assignments] = await Promise.all([
      this.prisma.user.findMany({
        select: { id: true, username: true, displayName: true, status: true },
        orderBy: [{ status: "asc" }, { displayName: "asc" }],
      }),
      this.prisma.taskAssignment.findMany({
        where: { status: { not: "CANCELLED" }, task: { project: { archivedAt: null, kind: "COMPANION" } } },
        select: {
          id: true,
          status: true,
          assignedAt: true,
          dueAt: true,
          startedAt: true,
          completedAt: true,
          assigneeId: true,
          task: {
            select: {
              id: true,
              title: true,
              status: true,
              category: true,
              project: { select: { id: true, name: true, color: true } },
            },
          },
        },
        orderBy: { assignedAt: "desc" },
      }),
    ]);

    return users.map((user) => {
      const orders = assignments.filter((assignment) => assignment.assigneeId === user.id);
      const activeOrders = orders.filter((assignment) => !["COMPLETED", "CANCELLED"].includes(assignment.status));
      const completedOrders = orders.filter((assignment) => assignment.status === "COMPLETED");
      return {
        ...user,
        stats: { active: activeOrders.length, completed: completedOrders.length, total: orders.length },
        activeOrders,
        recentOrders: orders.slice(0, 8),
      };
    });
  }

  async assignProject(actor: AuthUser, userId: string, projectId: string, role: ProjectRole) {
    if (role === "OWNER") throw new ForbiddenException("项目负责人只能通过负责人转交功能变更");
    const [target, project, existing] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true } }),
      this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, archivedAt: true } }),
      this.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } }),
    ]);
    if (!target) throw new NotFoundException("成员不存在");
    if (target.status !== "ACTIVE") throw new ConflictException("请先恢复该成员账号，再分配项目");
    if (!project || project.archivedAt) throw new NotFoundException("项目不存在");
    if (existing?.role === "OWNER") throw new ForbiddenException("不能修改项目负责人的权限");
    const membership = await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: { projectId, userId, role },
      update: { role },
      include: { project: { select: { id: true, name: true, color: true } } },
    });
    await this.audit.record({
      actorId: actor.id,
      action: existing ? "ADMIN_PROJECT_ACCESS_UPDATED" : "ADMIN_PROJECT_ACCESS_GRANTED",
      entityType: "ProjectMember",
      entityId: membership.id,
      metadata: { userId, projectId, role },
    });
    return membership;
  }

  async removeProject(actor: AuthUser, userId: string, projectId: string): Promise<{ success: true }> {
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!membership) throw new NotFoundException("该成员不属于此项目");
    if (membership.role === "OWNER") throw new ForbiddenException("不能移除项目负责人");
    await this.prisma.projectMember.delete({ where: { id: membership.id } });
    await this.audit.record({
      actorId: actor.id,
      action: "ADMIN_PROJECT_ACCESS_REVOKED",
      entityType: "ProjectMember",
      entityId: membership.id,
      metadata: { userId, projectId },
    });
    return { success: true };
  }

  async userStatus(actor: AuthUser, id: string, status: UserStatus) {
    if (actor.id === id && status === "DISABLED") throw new ConflictException("不能禁用当前管理员账号");
    const user = await this.prisma.user.update({ where: { id }, data: { status } });
    if (status === "DISABLED") await this.prisma.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.record({ actorId: actor.id, action: status === "DISABLED" ? "ADMIN_USER_DISABLED" : "ADMIN_USER_ENABLED", entityType: "User", entityId: id });
    return user;
  }

  tasks(page = 1, pageSize = 20) {
    return this.prisma.task.findMany({
      where: { project: { archivedAt: null, kind: "COMPANION" } },
      include: { publisher: { select: { id: true, username: true, displayName: true, email: true } }, _count: { select: { applications: true, assignments: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  async removeTask(actor: AuthUser, id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("任务不存在");
    if (!["PUBLISHED", "CLAIMED"].includes(task.status)) throw new ConflictException("当前状态不能下架");
    const updated = await this.prisma.task.update({ where: { id }, data: { status: "REMOVED", version: { increment: 1 } } });
    await this.audit.record({ actorId: actor.id, action: "ADMIN_TASK_REMOVED", entityType: "Task", entityId: id });
    return updated;
  }

  async restoreTask(actor: AuthUser, id: string) {
    const updated = await this.prisma.task.update({ where: { id, status: "REMOVED" }, data: { status: "PUBLISHED", version: { increment: 1 } } });
    await this.audit.record({ actorId: actor.id, action: "ADMIN_TASK_RESTORED", entityType: "Task", entityId: id });
    return updated;
  }

  disputes() {
    return this.prisma.task.findMany({ where: { status: "DISPUTED", project: { archivedAt: null, kind: "COMPANION" } }, include: { publisher: true, assignments: { include: { assignee: true } } }, orderBy: { updatedAt: "desc" } });
  }

  async resolve(actor: AuthUser, taskId: string, status: Extract<TaskStatus, "IN_PROGRESS" | "COMPLETED" | "CANCELLED">, message: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.status !== "DISPUTED") throw new ConflictException("任务不处于争议状态");
    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status,
        ...(status === "COMPLETED" ? { completedAt: new Date(), rewardFulfillmentStatus: "PENDING" as const } : {}),
        version: { increment: 1 },
      },
    });
    await this.audit.record({ actorId: actor.id, action: "ADMIN_DISPUTE_RESOLVED", entityType: "Task", entityId: taskId, metadata: { status, message: message.slice(0, 1000) } });
    return updated;
  }

  auditLogs(page = 1, pageSize = 50) {
    return this.prisma.auditLog.findMany({ include: { actor: { select: { id: true, username: true, displayName: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize });
  }
}
