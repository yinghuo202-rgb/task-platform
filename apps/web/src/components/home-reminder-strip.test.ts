import { describe, expect, it } from "vitest";
import { buildReminderItems } from "./home-reminder-strip";

describe("home reminder strip", () => {
  it("keeps the next schedule and one latest item from each reminder category", () => {
    const items = buildReminderItems({ title: "一起吃晚饭", startsAt: new Date("2026-08-11T19:00:00+08:00") }, [
      { id: "task", taskId: "task-1", type: "TASK_PUBLISHED", title: "有新任务发布", content: "整理照片", readAt: null, createdAt: "2026-08-11T10:00:00Z" },
      { id: "journal", type: "SYSTEM", title: "手帐已更新", content: "2026-08-11", readAt: null, createdAt: "2026-08-11T09:00:00Z" },
      { id: "task-older", type: "TASK_PUBLISHED", title: "有新任务发布", content: "一起散步", readAt: null, createdAt: "2026-08-10T09:00:00Z" },
    ]);

    expect(items.map((item) => item.kind)).toEqual(["schedule", "task", "journal"]);
    expect(items.map((item) => item.text)).toEqual(["一起吃晚饭", "整理照片", "2026-08-11"]);
    expect(items.map((item) => item.href)).toEqual(["/dashboard", "/tasks/task-1", "/journal"]);
  });

  it("falls back to recent read notifications when there is nothing unread", () => {
    const items = buildReminderItems(null, [
      { id: "notice", type: "APPLICATION_ACCEPTED", title: "申请已通过", content: "一起看电影", readAt: "2026-08-11T12:00:00Z", createdAt: "2026-08-11T11:00:00Z" },
    ]);

    expect(items).toMatchObject([{ kind: "notice", text: "一起看电影", detail: "申请已通过" }]);
  });
});
