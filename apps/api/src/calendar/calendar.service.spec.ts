import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { CalendarService } from "./calendar.service";

const userId = "11111111-1111-4111-8111-111111111111";

describe("CalendarService", () => {
  it("only queries events owned by the current user within the visible range", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new CalendarService({ calendarEvent: { findMany } } as unknown as PrismaService);
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-09-01T00:00:00.000Z");

    await service.list(userId, from, to);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId, startsAt: { lt: to }, endsAt: { gt: from } },
    }));
  });

  it("rejects an event whose end is not later than its start", async () => {
    const service = new CalendarService({} as PrismaService);
    expect(() => service.create(userId, {
      title: "冲突日程",
      startsAt: "2026-08-01T10:00:00.000Z",
      endsAt: "2026-08-01T09:00:00.000Z",
    })).toThrow("结束时间必须晚于开始时间");
  });

  it("does not delete another user's event", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const remove = vi.fn();
    const service = new CalendarService({ calendarEvent: { findFirst, delete: remove } } as unknown as PrismaService);

    await expect(service.remove(userId, "22222222-2222-4222-8222-222222222222")).rejects.toThrow("日程不存在");
    expect(remove).not.toHaveBeenCalled();
  });

  it("includes only approved shared-project subscriptions in the calendar feed", async () => {
    const subscriptionFindMany = vi.fn().mockResolvedValue([{ ownerId: "22222222-2222-4222-8222-222222222222" }]);
    const eventFindMany = vi.fn().mockResolvedValue([]);
    const service = new CalendarService({
      calendarSubscription: { findMany: subscriptionFindMany },
      calendarEvent: { findMany: eventFindMany },
    } as unknown as PrismaService);
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-09-01T00:00:00.000Z");

    await service.feed(userId, from, to);

    expect(subscriptionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ subscriberId: userId, status: "APPROVED" }),
    }));
    expect(eventFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: { in: [userId, "22222222-2222-4222-8222-222222222222"] } }),
    }));
  });

  it("rejects subscribing to your own calendar", async () => {
    const service = new CalendarService({} as PrismaService);
    await expect(service.requestSubscription(userId, userId)).rejects.toThrow("不能订阅自己的日历");
  });

  it("does not let another user respond to an incoming request", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      ownerId: "22222222-2222-4222-8222-222222222222",
      subscriberId: userId,
      status: "PENDING",
      owner: { displayName: "测试成员" },
    });
    const update = vi.fn();
    const service = new CalendarService({ calendarSubscription: { findUnique, update } } as unknown as PrismaService);

    await expect(service.respondToSubscription(userId, "33333333-3333-4333-8333-333333333333", { action: "APPROVE" })).rejects.toThrow("订阅申请不存在");
    expect(update).not.toHaveBeenCalled();
  });
});
