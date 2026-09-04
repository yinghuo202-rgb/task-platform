import { describe, expect, it } from "vitest";
import type { CalendarTodo } from "@task-platform/shared-types";
import { calendarRange, calendarTodoDropTime, groupCalendarTodos, rangeLabel, resizeCalendarRange } from "./calendar-workspace";

describe("calendar views", () => {
  it("uses a rolling three-day range from the selected day", () => {
    const anchor = new Date(2026, 7, 11, 16, 30);
    const range = calendarRange(anchor, "three-day");

    expect(range.from).toEqual(new Date(2026, 7, 11));
    expect(range.to).toEqual(new Date(2026, 7, 14));
    expect(rangeLabel(anchor, "three-day")).toBe("8月11日 – 8月13日");
  });

  it("resizes either edge while keeping at least fifteen minutes", () => {
    const startsAt = new Date(2026, 7, 11, 9, 0);
    const endsAt = new Date(2026, 7, 11, 10, 0);

    expect(resizeCalendarRange(startsAt, endsAt, "end", 45)).toEqual({ startsAt, endsAt: new Date(2026, 7, 11, 10, 45) });
    expect(resizeCalendarRange(startsAt, endsAt, "start", 120)).toEqual({ startsAt: new Date(2026, 7, 11, 9, 45), endsAt });
    expect(resizeCalendarRange(startsAt, endsAt, "end", -120)).toEqual({ startsAt, endsAt: new Date(2026, 7, 11, 9, 15) });
  });

  it("snaps a dropped todo to a fifteen-minute calendar slot", () => {
    expect(calendarTodoDropTime(new Date(2026, 8, 4), 548)).toEqual(new Date(2026, 8, 4, 9, 15));
    expect(calendarTodoDropTime(new Date(2026, 8, 4), 2_000)).toEqual(new Date(2026, 8, 4, 23, 45));
  });

  it("groups personal todos without mixing completed and unscheduled items", () => {
    const todo = (id: string, dueAt: string | null, completedAt: string | null = null): CalendarTodo => ({
      id,
      userId: "user-id",
      title: id,
      note: null,
      dueAt,
      allDay: false,
      completedAt,
      position: 0,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    const groups = groupCalendarTodos([
      todo("today", "2026-09-04T10:00:00.000Z"),
      todo("later", "2026-09-06T10:00:00.000Z"),
      todo("loose", null),
      todo("done", null, "2026-09-03T10:00:00.000Z"),
    ], new Date("2026-09-04T08:00:00.000Z"));

    expect(groups.today.map((item) => item.id)).toEqual(["today"]);
    expect(groups.upcoming.map((item) => item.id)).toEqual(["later"]);
    expect(groups.unscheduled.map((item) => item.id)).toEqual(["loose"]);
    expect(groups.completed.map((item) => item.id)).toEqual(["done"]);
  });
});
