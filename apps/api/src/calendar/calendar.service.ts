import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateCalendarEventDto, RespondCalendarSubscriptionDto, UpdateCalendarEventDto } from "./dto";

const publicUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarPath: true,
  bio: true,
} as const;

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, from: Date, to: Date) {
    if (from >= to) throw new BadRequestException("日历结束时间必须晚于开始时间");
    return this.prisma.calendarEvent.findMany({
      where: { userId, startsAt: { lt: to }, endsAt: { gt: from } },
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    });
  }

  async feed(userId: string, from: Date, to: Date) {
    if (from >= to) throw new BadRequestException("日历结束时间必须晚于开始时间");
    const subscriptions = await this.prisma.calendarSubscription.findMany({
      where: {
        subscriberId: userId,
        status: "APPROVED",
        owner: {
          status: "ACTIVE",
          projectMemberships: {
            some: {
              project: {
                archivedAt: null,
                kind: "COMPANION",
                members: { some: { userId } },
              },
            },
          },
        },
      },
      select: { ownerId: true },
    });
    const visibleUserIds = [userId, ...subscriptions.map((item) => item.ownerId)];
    const events = await this.prisma.calendarEvent.findMany({
      where: { userId: { in: visibleUserIds }, startsAt: { lt: to }, endsAt: { gt: from } },
      include: { user: { select: publicUserSelect } },
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    });
    return events.map(({ user, ...event }) => ({ ...event, owner: user, editable: event.userId === userId }));
  }

  async subscriptionOverview(userId: string) {
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId, project: { archivedAt: null, kind: "COMPANION" } },
      select: { projectId: true },
    });
    const projectIds = memberships.map((item) => item.projectId);
    const [outgoing, incoming, candidates] = await Promise.all([
      this.prisma.calendarSubscription.findMany({
        where: { subscriberId: userId },
        include: { owner: { select: publicUserSelect } },
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.calendarSubscription.findMany({
        where: { ownerId: userId },
        include: { subscriber: { select: publicUserSelect } },
        orderBy: { updatedAt: "desc" },
      }),
      projectIds.length === 0 ? Promise.resolve([]) : this.prisma.user.findMany({
        where: {
          id: { not: userId },
          status: "ACTIVE",
          projectMemberships: { some: { projectId: { in: projectIds }, project: { archivedAt: null, kind: "COMPANION" } } },
        },
        select: {
          ...publicUserSelect,
          projectMemberships: {
            where: { projectId: { in: projectIds }, project: { archivedAt: null, kind: "COMPANION" } },
            select: { project: { select: { id: true, name: true, color: true } } },
          },
        },
        orderBy: [{ displayName: "asc" }, { username: "asc" }],
      }),
    ]);
    const outgoingByOwner = new Map(outgoing.map((item) => [item.ownerId, item]));
    return {
      outgoing,
      incoming,
      candidates: candidates.map(({ projectMemberships, ...candidate }) => ({
        ...candidate,
        sharedProjects: projectMemberships.map((membership) => membership.project),
        subscription: outgoingByOwner.get(candidate.id) ?? null,
      })),
    };
  }

  async requestSubscription(subscriberId: string, ownerId: string) {
    if (subscriberId === ownerId) throw new BadRequestException("不能订阅自己的日历");
    const [subscriber, owner, sharedProjects, existing] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: subscriberId }, select: { displayName: true } }),
      this.prisma.user.findFirst({ where: { id: ownerId, status: "ACTIVE" }, select: { id: true } }),
      this.sharedProjectCount(subscriberId, ownerId),
      this.prisma.calendarSubscription.findUnique({ where: { subscriberId_ownerId: { subscriberId, ownerId } } }),
    ]);
    if (!owner) throw new NotFoundException("用户不存在");
    if (!sharedProjects) throw new ForbiddenException("只能订阅同项目成员的日历");
    if (existing?.status === "PENDING") throw new ConflictException("订阅申请已经发送");
    if (existing?.status === "APPROVED") throw new ConflictException("你已经订阅了该成员的日历");

    const subscription = await this.prisma.calendarSubscription.upsert({
      where: { subscriberId_ownerId: { subscriberId, ownerId } },
      create: { subscriberId, ownerId },
      update: { status: "PENDING", respondedAt: null },
      include: { owner: { select: publicUserSelect } },
    });
    await this.prisma.notification.create({
      data: {
        userId: ownerId,
        type: "SYSTEM",
        title: "新的日历订阅申请",
        content: `${subscriber?.displayName ?? "一位项目成员"} 希望订阅你的日历，请前往“我的日历”处理。`,
      },
    });
    return subscription;
  }

  async respondToSubscription(ownerId: string, id: string, dto: RespondCalendarSubscriptionDto) {
    const subscription = await this.prisma.calendarSubscription.findUnique({
      where: { id },
      include: { owner: { select: { displayName: true } } },
    });
    if (!subscription || subscription.ownerId !== ownerId) throw new NotFoundException("订阅申请不存在");
    if (subscription.status !== "PENDING") throw new ConflictException("该订阅申请已经处理");
    if (dto.action === "APPROVE" && !(await this.sharedProjectCount(subscription.subscriberId, ownerId))) {
      throw new ForbiddenException("你们已不在同一个项目中");
    }
    const status = dto.action === "APPROVE" ? "APPROVED" : "REJECTED";
    const updated = await this.prisma.calendarSubscription.update({
      where: { id },
      data: { status, respondedAt: new Date() },
      include: { subscriber: { select: publicUserSelect } },
    });
    await this.prisma.notification.create({
      data: {
        userId: subscription.subscriberId,
        type: "SYSTEM",
        title: dto.action === "APPROVE" ? "日历订阅已通过" : "日历订阅未通过",
        content: dto.action === "APPROVE"
          ? `${subscription.owner.displayName} 已同意你的订阅申请，相关日程现在会显示在你的日历中。`
          : `${subscription.owner.displayName} 暂未同意你的日历订阅申请。`,
      },
    });
    return updated;
  }

  async cancelSubscription(userId: string, id: string): Promise<{ success: true }> {
    const subscription = await this.prisma.calendarSubscription.findFirst({
      where: { id, OR: [{ subscriberId: userId }, { ownerId: userId }] },
    });
    if (!subscription) throw new NotFoundException("订阅关系不存在");
    await this.prisma.calendarSubscription.delete({ where: { id } });
    return { success: true };
  }

  create(userId: string, dto: CreateCalendarEventDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.assertRange(startsAt, endsAt);
    return this.prisma.calendarEvent.create({
      data: {
        userId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        startsAt,
        endsAt,
        allDay: dto.allDay ?? false,
        color: dto.color ?? "#7f66ff",
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateCalendarEventDto) {
    const event = await this.findOwned(userId, id);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : event.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : event.endsAt;
    this.assertRange(startsAt, endsAt);
    return this.prisma.calendarEvent.update({
      where: { id },
      data: {
        ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
        ...(dto.description === undefined ? {} : { description: dto.description.trim() || null }),
        ...(dto.startsAt === undefined ? {} : { startsAt }),
        ...(dto.endsAt === undefined ? {} : { endsAt }),
        ...(dto.allDay === undefined ? {} : { allDay: dto.allDay }),
        ...(dto.color === undefined ? {} : { color: dto.color }),
      },
    });
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    await this.findOwned(userId, id);
    await this.prisma.calendarEvent.delete({ where: { id } });
    return { success: true };
  }

  private async findOwned(userId: string, id: string) {
    const event = await this.prisma.calendarEvent.findFirst({ where: { id, userId } });
    if (!event) throw new NotFoundException("日程不存在");
    return event;
  }

  private assertRange(startsAt: Date, endsAt: Date): void {
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt >= endsAt) {
      throw new BadRequestException("日程结束时间必须晚于开始时间");
    }
  }

  private sharedProjectCount(firstUserId: string, secondUserId: string) {
    return this.prisma.projectMember.count({
      where: {
        userId: firstUserId,
        project: {
          archivedAt: null,
          kind: "COMPANION",
          members: { some: { userId: secondUserId } },
        },
      },
    });
  }
}
