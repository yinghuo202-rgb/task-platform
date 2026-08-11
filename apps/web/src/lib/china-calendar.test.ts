import { describe, expect, it } from "vitest";
import { chinaCalendarEvents } from "./china-calendar";

describe("china calendar", () => {
  it("includes official holidays, adjusted workdays and solar terms", () => {
    const events = chinaCalendarEvents(new Date(2026, 1, 1), new Date(2026, 2, 1));

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: "2026-02-04", title: "立春 · 节气", kind: "solar-term" }),
      expect.objectContaining({ date: "2026-02-14", title: "调休上班 · 春节", kind: "workday" }),
      expect.objectContaining({ date: "2026-02-16", title: "除夕", kind: "festival" }),
      expect.objectContaining({ date: "2026-02-17", title: "春节假期", kind: "holiday" }),
      expect.objectContaining({ date: "2026-02-28", title: "调休上班 · 春节", kind: "workday" }),
    ]));
  });

  it("uses an exclusive end date and avoids duplicate festival labels", () => {
    const events = chinaCalendarEvents(new Date(2026, 1, 17), new Date(2026, 1, 18));

    expect(events.some((event) => event.date === "2026-02-18")).toBe(false);
    expect(events.filter((event) => event.date === "2026-02-17" && event.title.includes("春节"))).toHaveLength(1);
  });
});
