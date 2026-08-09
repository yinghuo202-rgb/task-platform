import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TaskSummary } from "@task-platform/shared-types";
import { PersonalTodoList } from "./personal-todo-list";

const { baseTask } = vi.hoisted(() => ({ baseTask: {
  id: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  project: { id: "22222222-2222-4222-8222-222222222222", name: "la vie", color: "#91c5b6" },
  title: "整理照片",
  summary: "选出想打印的照片",
  category: "其他",
  status: "IN_PROGRESS",
  visibility: "PRIVATE",
  claimMode: "AUTO",
  rewardType: "OTHER",
  rewardAmount: null,
  rewardDescription: "一杯奶茶",
  locationType: "UNSPECIFIED",
  locationDescription: null,
  timeMode: "BEFORE",
  durationValue: null,
  durationUnit: null,
  deadline: null,
  personalDueAt: null,
  personalAssignedAt: "2026-07-29T08:00:00.000Z",
  personalCompletedAt: null,
  personalAssignmentStatus: "IN_PROGRESS",
  publishedAt: "2026-07-29T08:00:00.000Z",
  completedAt: null,
  publisher: { id: "33333333-3333-4333-8333-333333333333", username: "owner", displayName: "对方", avatarPath: null },
  applicationCount: 0,
  assignmentCount: 1,
  maxAssignees: 1,
} as TaskSummary }));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn((path: string) => {
    if (path === "/shared-wishes") return Promise.resolve({ data: [
      { id: "wish-open", title: "一起看相片", completedAt: null, completedBy: null },
      { id: "wish-done", title: "一起看电影", completedAt: "2026-08-01T08:00:00.000Z", completedBy: { displayName: "对方" } },
    ] });
    if (path.includes("scope=assigned")) return Promise.resolve({ data: [baseTask] });
    if (path.includes("scope=published")) return Promise.resolve({ data: [{ ...baseTask, id: "published-done", title: "已经完成的任务", status: "COMPLETED", completedAt: "2026-08-02T08:00:00.000Z" }] });
    if (path.includes("scope=available")) return Promise.resolve({ data: [{ ...baseTask, id: "available", title: "等待我接取", status: "PUBLISHED" }] });
    return Promise.resolve({ data: [] });
  }),
  ApiError: class ApiError extends Error {},
}));

describe("PersonalTodoList", () => {
  it("shows together, assigned and published columns with a completed-history toggle", async () => {
    const user = userEvent.setup();
    render(<PersonalTodoList />);

    await waitFor(() => expect(screen.getByText("一起看相片")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: /一起做的事/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /我接取的/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /我发布的/ })).toBeInTheDocument();
    expect(screen.getByText("等待我接取")).toBeInTheDocument();
    expect(screen.getByText("整理照片")).toBeInTheDocument();
    expect(screen.queryByText("已经完成的任务")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /显示已完成/ }));
    expect(screen.getByText("一起看电影")).toBeInTheDocument();
    expect(screen.getByText("已经完成的任务")).toBeInTheDocument();
  });
});
