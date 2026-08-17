import { describe, expect, it } from "vitest";
import { notificationTarget } from "./notification-target";

describe("notificationTarget", () => {
  it("uses an explicit safe in-app target first", () => {
    expect(notificationTarget({ title: "手帐已更新", targetPath: "/journal?entry=entry-1" })).toBe("/journal?entry=entry-1");
  });

  it("keeps old task, journal and calendar notifications useful", () => {
    expect(notificationTarget({ title: "任务已完成", taskId: "task-1" })).toBe("/tasks/task-1");
    expect(notificationTarget({ title: "手帐已更新" })).toBe("/journal");
    expect(notificationTarget({ title: "新的日历订阅申请" })).toBe("/dashboard?subscriptions=1");
  });

  it("does not accept an external protocol-relative path", () => {
    expect(notificationTarget({ title: "系统提醒", targetPath: "//example.com" })).toBe("/dashboard");
  });
});
