import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthUser } from "../common/auth-context";
import type { Prisma } from "../generated/prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";
import { CreateTaskDto, ListTasksDto, UpdateTaskDto } from "./dto";
import { assertTransition } from "./task-state-machine";

const listInclude = {
  publisher: { select: { id: true, username: true, displayName: true, avatarPath: true } },
  project: { select: { id: true, name: true, color: true } },
  assignments: { select: { assigneeId: true, assignedAt: true, dueAt: true, completedAt: true, status: true } },
  _count: { select: { applications: true, assignments: true } },
} satisfies Prisma.TaskInclude;

const detailInclude = {
  ...listInclude,
  requirements: { orderBy: { sortOrder: "asc" as const } },
  attachments: true,
  assignments: { include: { assignee: { select: { id: true, username: true, displayName: true, avatarPath: true } } } },
} satisfies Prisma.TaskInclude;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly projects: ProjectsService,
  ) {}

  async list(query: ListTasksDto, user: AuthUser) {
    if (query.projectId) await this.projects.assertCompanionMember(query.projectId, user);
    const where: Prisma.TaskWhereInput = {
      project: {
        archivedAt: null,
        kind: "COMPANION",
        ...(user.role === "ADMIN" ? {} : { members: { some: { userId: user.id } } }),
      },
      status: query.status ?? { in: ["PUBLISHED", "CLAIMED", "IN_PROGRESS", "SUBMITTED", "REVISION_REQUESTED", "COMPLETED"] },
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.search ? {
        OR: [
          { title: { contains: query.search, mode: "insensitive" } },
          { summary: { contains: query.search, mode: "insensitive" } },
        ],
      } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.rewardType ? { rewardType: query.rewardType } : {}),
      ...(query.locationType ? { locationType: query.locationType } : {}),
    };
    if (query.scope) {
      if (query.scope === "published") Object.assign(where, { publisherId: user.id });
      if (query.scope === "assigned") Object.assign(where, { assignments: { some: { assigneeId: user.id, status: { not: "CANCELLED" } } } });
      if (query.scope === "completed") Object.assign(where, { status: "COMPLETED", OR: [{ publisherId: user.id }, { assignments: { some: { assigneeId: user.id } } }] });
      if (query.scope === "applications") Object.assign(where, { applications: { some: { applicantId: user.id } } });
      if (query.scope === "available") Object.assign(where, {
        publisherId: { not: user.id },
        status: "PUBLISHED",
        assignments: { none: { assigneeId: user.id } },
        applications: { none: { applicantId: user.id, status: "PENDING" } },
        AND: [{ OR: [{ deadline: null }, { deadline: { gt: new Date() } }] }],
      });
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: listInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { [query.sort]: query.order },
      }),
      this.prisma.task.count({ where }),
    ]);
    return {
      data: items.map((task) => toSummary(task, user.id)),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
    };
  }

  async get(id: string, user: AuthUser) {
    const task = await this.prisma.task.findUnique({ where: { id }, include: detailInclude });
    if (!task) throw new NotFoundException("任务不存在");
    await this.projects.assertCompanionMember(task.projectId, user);
    if (task.status === "DRAFT" && task.publisherId !== user.id && user.role !== "ADMIN") throw new NotFoundException("任务不存在");
    return { ...toSummary(task, user.id), ...task, rewardAmount: task.rewardAmount?.toString() ?? null };
  }

  async create(user: AuthUser, dto: CreateTaskDto) {
    await this.projects.assertCompanionContributor(dto.projectId, user);
    const task = await this.prisma.task.create({
      data: {
        projectId: dto.projectId,
        publisherId: user.id,
        ...taskCore(dto),
        requirements: { create: dto.requirements },
      },
      include: detailInclude,
    });
    await this.audit.record({ actorId: user.id, action: "TASK_CREATED", entityType: "Task", entityId: task.id });
    return task;
  }

  async update(id: string, user: AuthUser, dto: UpdateTaskDto) {
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("任务不存在");
    const projectRole = await this.projects.assertCompanionContributor(existing.projectId, user);
    if (existing.publisherId !== user.id && !["OWNER", "MANAGER"].includes(projectRole)) throw new ForbiddenException("只有创建者或项目管理员可以编辑任务");
    if (!["DRAFT", "PUBLISHED"].includes(existing.status)) throw new ConflictException("任务已开始，不能编辑核心内容");
    if (existing.version !== dto.version) throw new ConflictException({ code: "STALE_TASK_VERSION", message: "任务已被更新，请刷新后重试" });

    const task = await this.prisma.$transaction(async (tx) => {
      await tx.taskRequirement.deleteMany({ where: { taskId: id } });
      return tx.task.update({
        where: { id, version: dto.version },
        data: { ...taskCore(dto), version: { increment: 1 }, requirements: { create: dto.requirements } },
        include: detailInclude,
      });
    });
    await this.audit.record({ actorId: user.id, action: "TASK_EDITED", entityType: "Task", entityId: id });
    return task;
  }

  async publish(id: string, user: AuthUser) {
    const task = await this.editable(id, user);
    assertTransition(task.status, "PUBLISHED");
    const recipients = await this.prisma.projectMember.findMany({
      where: { projectId: task.projectId, userId: { not: user.id }, user: { status: "ACTIVE" } },
      select: { userId: true },
    });
    const updated = await this.prisma.$transaction(async (tx) => {
      const published = await tx.task.update({
        where: { id },
        data: { status: "PUBLISHED", publishedAt: new Date(), rewardFulfillmentStatus: task.rewardType === "POINTS" ? "PENDING" : "NOT_APPLICABLE", version: { increment: 1 } },
      });
      if (recipients.length) {
        await tx.notification.createMany({
          data: recipients.map(({ userId }) => ({ userId, taskId: id, type: "TASK_PUBLISHED" as const, title: "有新任务发布", content: task.title })),
        });
      }
      return published;
    });
    await this.audit.record({ actorId: user.id, action: "TASK_PUBLISHED", entityType: "Task", entityId: id });
    return updated;
  }

  async cancel(id: string, user: AuthUser) {
    const task = await this.editable(id, user);
    assertTransition(task.status, "CANCELLED");
    if (await this.prisma.taskAssignment.count({ where: { taskId: id, status: { not: "CANCELLED" } } })) {
      throw new ConflictException("已有接取者的任务不能直接取消，请发起争议");
    }
    const updated = await this.prisma.task.update({ where: { id }, data: { status: "CANCELLED", version: { increment: 1 } } });
    await this.prisma.notification.createMany({
      data: (await this.prisma.taskApplication.findMany({ where: { taskId: id }, select: { applicantId: true } })).map(({ applicantId }) => ({
        userId: applicantId, taskId: id, type: "TASK_CANCELLED", title: "任务已取消", content: task.title,
      })),
      skipDuplicates: true,
    });
    await this.audit.record({ actorId: user.id, action: "TASK_CANCELLED", entityType: "Task", entityId: id });
    return updated;
  }

  async removeDraft(id: string, user: AuthUser): Promise<{ success: true }> {
    const task = await this.editable(id, user);
    if (task.status !== "DRAFT") throw new ConflictException("只有草稿可以删除");
    await this.prisma.$transaction([
      this.prisma.taskRequirement.deleteMany({ where: { taskId: id } }),
      this.prisma.task.delete({ where: { id } }),
    ]);
    return { success: true };
  }

  async start(id: string, user: AuthUser) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("任务不存在");
    await this.projects.assertCompanionContributor(task.projectId, user);
    const assignment = await this.prisma.taskAssignment.findUnique({ where: { taskId_assigneeId: { taskId: id, assigneeId: user.id } } });
    if (!assignment || assignment.status !== "ASSIGNED") throw new ForbiddenException("只有已接取者可以开始任务");
    assertTransition(task.status, "IN_PROGRESS");
    return this.prisma.$transaction(async (tx) => {
      await tx.taskAssignment.update({ where: { id: assignment.id }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
      return tx.task.update({ where: { id }, data: { status: "IN_PROGRESS", version: { increment: 1 } } });
    });
  }

  async dispute(id: string, user: AuthUser, message: string) {
    const task = await this.prisma.task.findUnique({ where: { id }, include: { assignments: true } });
    if (!task) throw new NotFoundException("任务不存在");
    await this.projects.assertCompanionContributor(task.projectId, user);
    if (task.publisherId !== user.id && !task.assignments.some((a) => a.assigneeId === user.id)) throw new ForbiddenException("只有任务参与者可以发起争议");
    assertTransition(task.status, "DISPUTED");
    const updated = await this.prisma.task.update({ where: { id }, data: { status: "DISPUTED", rewardFulfillmentStatus: "DISPUTED", version: { increment: 1 } } });
    await this.audit.record({ actorId: user.id, action: "TASK_DISPUTED", entityType: "Task", entityId: id, metadata: { message: message.slice(0, 1000) } });
    return updated;
  }

  async assertParticipant(taskId: string, user: AuthUser): Promise<void> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
    if (!task) throw new NotFoundException("任务不存在");
    await this.projects.assertCompanionMember(task.projectId, user);
  }

  async assertContributor(taskId: string, user: AuthUser): Promise<void> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
    if (!task) throw new NotFoundException("任务不存在");
    await this.projects.assertCompanionContributor(task.projectId, user);
  }

  private async editable(id: string, user: AuthUser) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("任务不存在");
    const role = await this.projects.assertCompanionContributor(task.projectId, user);
    if (task.publisherId !== user.id && !["OWNER", "MANAGER"].includes(role)) throw new ForbiddenException("只有创建者或项目管理员可以操作任务");
    return task;
  }
}

function taskCore(dto: CreateTaskDto) {
  if (dto.timeMode === "WITHIN") {
    if (!dto.durationValue || !dto.durationUnit) throw new BadRequestException("请填写开始后的完成时长");
    if (durationMinutes(dto.durationValue, dto.durationUnit) > 525_600) throw new BadRequestException("任务时长不能超过一年");
  } else if (!dto.deadline) {
    throw new BadRequestException(dto.timeMode === "AT" ? "请选择具体执行时间" : "请选择截止时间");
  }
  const rewardOptions = [...new Set((dto.rewardOptions ?? []).map((option) => option.trim()).filter(Boolean))];
  const rewardDescription = dto.rewardDescription?.trim() || null;
  if (rewardDescription && rewardOptions.length > 0 && !rewardOptions.includes(rewardDescription)) {
    throw new BadRequestException("请选择一项完成奖励");
  }
  return {
    title: dto.title.trim(),
    summary: dto.summary.trim(),
    description: dto.description.trim(),
    // 保留旧字段以兼容已有数据库记录；分类不再作为用户可见功能。
    category: dto.category?.trim() || "未分类",
    visibility: dto.visibility,
    claimMode: dto.claimMode,
    maxAssignees: dto.maxAssignees,
    rewardType: dto.rewardType,
    rewardAmount: dto.rewardAmount || null,
    rewardDescription,
    rewardOptions,
    locationType: dto.locationType,
    locationDescription: dto.locationDescription?.trim() || null,
    timeMode: dto.timeMode,
    durationValue: dto.timeMode === "WITHIN" ? dto.durationValue : null,
    durationUnit: dto.timeMode === "WITHIN" ? dto.durationUnit : null,
    deadline: dto.timeMode === "WITHIN" ? null : new Date(dto.deadline!),
  };
}

function toSummary(task: Prisma.TaskGetPayload<{ include: typeof listInclude }>, userId: string) {
  const { assignments, _count, ...summary } = task;
  const personalAssignment = assignments.find((assignment) => assignment.assigneeId === userId);
  return {
    ...summary,
    rewardAmount: task.rewardAmount?.toString() ?? null,
    personalDueAt: personalAssignment?.dueAt?.toISOString() ?? null,
    personalAssignedAt: personalAssignment?.assignedAt.toISOString() ?? null,
    personalCompletedAt: personalAssignment?.completedAt?.toISOString() ?? null,
    personalAssignmentStatus: personalAssignment?.status ?? null,
    applicationCount: _count.applications,
    assignmentCount: _count.assignments,
  };
}

function durationMinutes(value: number, unit: "MINUTES" | "HOURS" | "DAYS") {
  if (unit === "HOURS") return value * 60;
  if (unit === "DAYS") return value * 24 * 60;
  return value;
}
