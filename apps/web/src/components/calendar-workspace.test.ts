import { describe, expect, it } from "vitest";
import { calendarRange, rangeLabel, resizeCalendarRange } from "./calendar-workspace";

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

});
