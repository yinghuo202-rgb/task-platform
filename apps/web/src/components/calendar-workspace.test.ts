import { describe, expect, it } from "vitest";
import { calendarRange, rangeLabel } from "./calendar-workspace";

describe("calendar views", () => {
  it("uses a rolling three-day range from the selected day", () => {
    const anchor = new Date(2026, 7, 11, 16, 30);
    const range = calendarRange(anchor, "three-day");

    expect(range.from).toEqual(new Date(2026, 7, 11));
    expect(range.to).toEqual(new Date(2026, 7, 14));
    expect(rangeLabel(anchor, "three-day")).toBe("8月11日 – 8月13日");
  });
});
