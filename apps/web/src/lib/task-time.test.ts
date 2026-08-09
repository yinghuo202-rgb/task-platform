import { afterEach, describe, expect, it, vi } from "vitest";
import { personalTaskTimeLabel, taskTimeIsOverdue } from "./task-time";

describe("personal task time", () => {
  afterEach(() => vi.useRealTimers());

  it("shows the calculated due time after a relative-time task is claimed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T08:00:00.000Z"));

    const task = {
      timeMode: "WITHIN" as const,
      durationValue: 6,
      durationUnit: "HOURS" as const,
      deadline: null,
      personalDueAt: "2026-07-29T14:00:00.000Z",
    };

    expect(personalTaskTimeLabel(task)).toMatch(/^今天 .+ 前$/);
    expect(taskTimeIsOverdue(task)).toBe(false);
  });

  it("marks a passed personal due time as overdue", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T15:00:00.000Z"));

    const task = {
      timeMode: "WITHIN" as const,
      durationValue: 6,
      durationUnit: "HOURS" as const,
      deadline: null,
      personalDueAt: "2026-07-29T14:00:00.000Z",
    };

    expect(personalTaskTimeLabel(task)).toBe("已逾期");
    expect(taskTimeIsOverdue(task)).toBe(true);
  });
});
