import { describe, expect, it } from "vitest";
import { assignmentDueAt } from "./collaboration.service";

describe("assignment due time", () => {
  const assignedAt = new Date("2026-07-29T08:00:00.000Z");

  it("calculates a personal due time from the claim moment", () => {
    expect(assignmentDueAt({
      timeMode: "WITHIN",
      durationValue: 6,
      durationUnit: "HOURS",
      deadline: null,
    }, assignedAt)?.toISOString()).toBe("2026-07-29T14:00:00.000Z");
  });

  it.each(["BEFORE", "AT"] as const)("keeps the fixed time for %s tasks", (timeMode) => {
    const deadline = new Date("2026-08-01T09:30:00.000Z");
    expect(assignmentDueAt({
      timeMode,
      durationValue: null,
      durationUnit: null,
      deadline,
    }, assignedAt)).toEqual(deadline);
  });
});
