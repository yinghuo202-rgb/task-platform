import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthUser } from "../common/auth-context";
import { AuditService } from "../audit/audit.service";
import { Prisma, type PrismaClient } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TasksService } from "../tasks/tasks.service";
import { assertTransition } from "../tasks/task-state-machine";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

@Injectable()
export class CollaborationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly audit: AuditService,
  ) {}

  async applications(taskId: string, user: AuthUser) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("任务不存在");
    await this.tasks.assertParticipant(taskId, user);
    if (task.publisherId !== user.id && user.role !== "ADMIN") throw new ForbiddenException("只有发布者可以查看申请");
    return this.prisma.taskApplication.findMany({
      where: { taskId },
      include: { applicant: { select: { id: true, username: true, displayName: true, avatarPath: true, bio: true } }, attachments: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async apply(taskId: string, user: AuthUser, message: string) {
    const task = await this.availableTask(taskId, user);
    if (task.claimMode !== "APPROVAL") throw new ConflictException("该任务应直接接取");
    try {
      const application = await this.prisma.taskApplication.create({
        data: { taskId, applicantId: user.id, message: message.trim() },
      });
      await this.prisma.notification.create({
        data: { userId: task.publisherId, taskId, type: "APPLICATION_RECEIVED", title: "收到新的任务申请", content: task.title },
      });
      return application;
    } catch (error) {
      if (isUniqueConflict(error)) throw new ConflictException({ code: "DUPLICATE_APPLICATION", message: "你已经申请过此任务" });
      throw error;
    }
  }

  async claim(taskId: string, user: AuthUser) {
    await this.tasks.assertContributor(taskId, user);
    const assignment = await this.withSerializableRetry(async (tx) => {
      // 锁定任务行，使“检查名额 + 创建指派”成为一个原子操作。
      await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE`;
      const task = await tx.task.findUnique({ where: { id: taskId } });
      if (!task) throw new NotFoundException("任务不存在");
      this.assertClaimable(task, user.id);
      if (task.claimMode !== "AUTO") throw new ConflictException("该任务需要先提交申请");
      const active = await tx.taskAssignment.count({ where: { taskId, status: { not: "CANCELLED" } } });
      if (active >= task.maxAssignees) throw new ConflictException({ code: "TASK_CAPACITY_REACHED", message: "任务已被其他人接取" });
      const assignedAt = new Date();
      const assignment = await tx.taskAssignment.create({
        data: { taskId, assigneeId: user.id, assignedAt, dueAt: assignmentDueAt(task, assignedAt) },
      });
      await tx.task.update({ where: { id: taskId }, data: { status: "CLAIMED", version: { increment: 1 } } });
      await tx.notification.create({
        data: { userId: task.publisherId, taskId, type: "TASK_ASSIGNED", title: "任务已被接取", content: task.title },
      });
      return assignment;
    }, "TASK_CAPACITY_REACHED");
    await this.audit.record({ actorId: user.id, action: "TASK_CLAIMED", entityType: "Task", entityId: taskId });
    return assignment;
  }

  async accept(applicationId: string, user: AuthUser) {
    const application = await this.prisma.taskApplication.findUnique({ where: { id: applicationId }, select: { taskId: true } });
    if (!application) throw new NotFoundException("申请不存在");
    await this.tasks.assertContributor(application.taskId, user);
    const assignment = await this.withSerializableRetry(async (tx) => {
      const app = await tx.taskApplication.findUnique({ where: { id: applicationId }, include: { task: true } });
      if (!app) throw new NotFoundException("申请不存在");
      await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${app.taskId}::uuid FOR UPDATE`;
      const task = await tx.task.findUniqueOrThrow({ where: { id: app.taskId } });
      if (task.publisherId !== user.id) throw new ForbiddenException("只有任务发布者可以接受申请");
      if (app.status !== "PENDING") throw new ConflictException("申请已经处理");
      const active = await tx.taskAssignment.count({ where: { taskId: task.id, status: { not: "CANCELLED" } } });
      if (active >= task.maxAssignees) throw new ConflictException({ code: "TASK_CAPACITY_REACHED", message: "任务名额已满" });
      const assignedAt = new Date();
      const created = await tx.taskAssignment.create({
        data: {
          taskId: task.id,
          assigneeId: app.applicantId,
          applicationId: app.id,
          assignedAt,
          dueAt: assignmentDueAt(task, assignedAt),
        },
      });
      await tx.taskApplication.update({ where: { id: app.id }, data: { status: "ACCEPTED", decidedAt: new Date() } });
      const filled = active + 1 >= task.maxAssignees;
      if (filled) {
        const rejected = await tx.taskApplication.findMany({ where: { taskId: task.id, status: "PENDING" }, select: { id: true, applicantId: true } });
        await tx.taskApplication.updateMany({ where: { id: { in: rejected.map((item) => item.id) } }, data: { status: "REJECTED", decidedAt: new Date() } });
        if (rejected.length) {
          await tx.notification.createMany({
            data: rejected.map((item) => ({ userId: item.applicantId, taskId: task.id, type: "APPLICATION_REJECTED" as const, title: "任务申请未通过", content: task.title })),
          });
        }
      }
      await tx.task.update({ where: { id: task.id }, data: { status: "CLAIMED", version: { increment: 1 } } });
      await tx.notification.create({
        data: { userId: app.applicantId, taskId: task.id, type: "APPLICATION_ACCEPTED", title: "任务申请已通过", content: task.title },
      });
      return created;
    }, "TASK_CAPACITY_REACHED");
    await this.audit.record({ actorId: user.id, action: "APPLICATION_ACCEPTED", entityType: "TaskApplication", entityId: applicationId });
    return assignment;
  }

  async reject(applicationId: string, user: AuthUser) {
    const app = await this.prisma.taskApplication.findUnique({ where: { id: applicationId }, include: { task: true } });
    if (!app) throw new NotFoundException("申请不存在");
    await this.tasks.assertContributor(app.taskId, user);
    if (app.task.publisherId !== user.id) throw new ForbiddenException("只有任务发布者可以拒绝申请");
    if (app.status !== "PENDING") throw new ConflictException("申请已经处理");
    const updated = await this.prisma.taskApplication.update({ where: { id: applicationId }, data: { status: "REJECTED", decidedAt: new Date() } });
    await this.prisma.notification.create({ data: { userId: app.applicantId, taskId: app.taskId, type: "APPLICATION_REJECTED", title: "任务申请未通过", content: app.task.title } });
    await this.audit.record({ actorId: user.id, action: "APPLICATION_REJECTED", entityType: "TaskApplication", entityId: applicationId });
    return updated;
  }

  async withdraw(applicationId: string, user: AuthUser) {
    const app = await this.prisma.taskApplication.findUnique({ where: { id: applicationId } });
    if (!app) throw new NotFoundException("申请不存在");
    await this.tasks.assertParticipant(app.taskId, user);
    if (app.applicantId !== user.id) throw new ForbiddenException("只能撤回自己的申请");
    if (app.status !== "PENDING") throw new ConflictException("只能撤回待处理申请");
    return this.prisma.taskApplication.update({ where: { id: applicationId }, data: { status: "WITHDRAWN" } });
  }

  async submissions(taskId: string, user: AuthUser) {
    await this.tasks.assertParticipant(taskId, user);
    return this.prisma.taskSubmission.findMany({
      where: { taskId },
      include: { submitter: { select: { id: true, username: true, displayName: true } }, attachments: true },
      orderBy: { submittedAt: "desc" },
    });
  }

  async submit(taskId: string, user: AuthUser, content: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("任务不存在");
    await this.tasks.assertContributor(taskId, user);
    const assignment = await this.prisma.taskAssignment.findUnique({ where: { taskId_assigneeId: { taskId, assigneeId: user.id } } });
    if (!assignment || !["IN_PROGRESS", "SUBMITTED"].includes(assignment.status)) throw new ForbiddenException("只有进行中的接取者可以提交成果");
    if (!["IN_PROGRESS", "REVISION_REQUESTED"].includes(task.status)) throw new ConflictException("任务当前不能提交成果");
    assertTransition(task.status, "SUBMITTED");
    const submission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.taskSubmission.create({ data: { taskId, submitterId: user.id, content: content.trim() } });
      await tx.taskAssignment.update({ where: { id: assignment.id }, data: { status: "SUBMITTED" } });
      await tx.task.update({ where: { id: taskId }, data: { status: "SUBMITTED", version: { increment: 1 } } });
      await tx.notification.create({ data: { userId: task.publisherId, taskId, type: "SUBMISSION_RECEIVED", title: "收到任务成果", content: task.title } });
      return created;
    });
    await this.audit.record({ actorId: user.id, action: "SUBMISSION_CREATED", entityType: "TaskSubmission", entityId: submission.id });
    return submission;
  }

  async requestRevision(submissionId: string, user: AuthUser, message: string) {
    const submission = await this.reviewable(submissionId, user);
    assertTransition(submission.task.status, "REVISION_REQUESTED");
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.taskSubmission.update({ where: { id: submissionId }, data: { status: "REVISION_REQUESTED", reviewedAt: new Date(), reviewMessage: message.trim() } });
      await tx.taskAssignment.update({ where: { taskId_assigneeId: { taskId: submission.taskId, assigneeId: submission.submitterId } }, data: { status: "IN_PROGRESS" } });
      await tx.task.update({ where: { id: submission.taskId }, data: { status: "REVISION_REQUESTED", version: { increment: 1 } } });
      await tx.notification.create({ data: { userId: submission.submitterId, taskId: submission.taskId, type: "REVISION_REQUESTED", title: "任务成果需要修改", content: message.trim().slice(0, 1000) } });
      return result;
    });
    await this.audit.record({ actorId: user.id, action: "REVISION_REQUESTED", entityType: "TaskSubmission", entityId: submissionId });
    return updated;
  }

  async approve(submissionId: string, user: AuthUser) {
    const submission = await this.reviewable(submissionId, user);
    assertTransition(submission.task.status, "COMPLETED");
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.taskSubmission.update({ where: { id: submissionId }, data: { status: "APPROVED", reviewedAt: new Date() } });
      await tx.taskAssignment.update({ where: { taskId_assigneeId: { taskId: submission.taskId, assigneeId: submission.submitterId } }, data: { status: "COMPLETED", completedAt: new Date() } });
      await tx.task.update({
        where: { id: submission.taskId },
        data: { status: "COMPLETED", completedAt: new Date(), rewardFulfillmentStatus: "PENDING", version: { increment: 1 } },
      });
      await tx.notification.create({ data: { userId: submission.submitterId, taskId: submission.taskId, type: "TASK_COMPLETED", title: "任务已验收完成", content: submission.task.title } });
      return result;
    });
    await this.audit.record({ actorId: user.id, action: "TASK_COMPLETED", entityType: "Task", entityId: submission.taskId });
    return updated;
  }

  async comments(taskId: string, user: AuthUser) {
    await this.tasks.assertParticipant(taskId, user);
    return this.prisma.taskComment.findMany({
      where: { taskId, deletedAt: null },
      include: { author: { select: { id: true, username: true, displayName: true, avatarPath: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async comment(taskId: string, user: AuthUser, content: string) {
    await this.tasks.assertContributor(taskId, user);
    return this.prisma.taskComment.create({ data: { taskId, authorId: user.id, content: content.trim() } });
  }

  async editComment(id: string, user: AuthUser, content: string) {
    const comment = await this.prisma.taskComment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException("留言不存在");
    await this.tasks.assertParticipant(comment.taskId, user);
    if (comment.authorId !== user.id && user.role !== "ADMIN") throw new ForbiddenException("只能编辑自己的留言");
    return this.prisma.taskComment.update({ where: { id }, data: { content: content.trim() } });
  }

  async deleteComment(id: string, user: AuthUser): Promise<{ success: true }> {
    const comment = await this.prisma.taskComment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException("留言不存在");
    await this.tasks.assertParticipant(comment.taskId, user);
    if (comment.authorId !== user.id && user.role !== "ADMIN") throw new ForbiddenException("只能删除自己的留言");
    await this.prisma.taskComment.update({ where: { id }, data: { deletedAt: new Date(), content: "[已删除]" } });
    return { success: true };
  }

  private async availableTask(taskId: string, user: AuthUser) {
    await this.tasks.assertContributor(taskId, user);
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("任务不存在");
    this.assertClaimable(task, user.id);
    return task;
  }

  private assertClaimable(task: { publisherId: string; status: string; deadline: Date | null }, userId: string): void {
    if (task.publisherId === userId) throw new ForbiddenException({ code: "CANNOT_CLAIM_OWN_TASK", message: "不能接取自己发布的任务" });
    if (!["PUBLISHED", "CLAIMED"].includes(task.status)) throw new ConflictException({ code: "TASK_NOT_AVAILABLE", message: "该任务当前无法接取" });
    if (task.deadline && task.deadline <= new Date()) throw new ConflictException({ code: "TASK_EXPIRED", message: "任务已截止" });
  }

  private async reviewable(submissionId: string, user: AuthUser) {
    const submission = await this.prisma.taskSubmission.findUnique({ where: { id: submissionId }, include: { task: true } });
    if (!submission) throw new NotFoundException("成果不存在");
    await this.tasks.assertContributor(submission.taskId, user);
    if (submission.task.publisherId !== user.id) throw new ForbiddenException("只有发布者可以验收成果");
    if (submission.status !== "SUBMITTED") throw new ConflictException("成果已经处理");
    return submission;
  }

  private async withSerializableRetry<T>(operation: (tx: Tx) => Promise<T>, code: string): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (isRetryable(error) && attempt < 2) continue;
        if (isUniqueConflict(error) || isRetryable(error)) throw new ConflictException({ code, message: "任务名额刚刚发生变化，请刷新后重试" });
        throw error;
      }
    }
    throw new ConflictException({ code, message: "任务名额刚刚发生变化" });
  }
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isRetryable(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

export function assignmentDueAt(task: {
  timeMode: "BEFORE" | "WITHIN" | "AT";
  durationValue: number | null;
  durationUnit: "MINUTES" | "HOURS" | "DAYS" | null;
  deadline: Date | null;
}, assignedAt: Date): Date | null {
  if (task.timeMode !== "WITHIN") return task.deadline;
  if (!task.durationValue || !task.durationUnit) return null;
  const multiplier = task.durationUnit === "DAYS" ? 24 * 60 : task.durationUnit === "HOURS" ? 60 : 1;
  return new Date(assignedAt.getTime() + task.durationValue * multiplier * 60_000);
}
