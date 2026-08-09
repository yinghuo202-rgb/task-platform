import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TaskSummary } from "@task-platform/shared-types";
import { PersonalTodoList } from "./personal-todo-list";

const { baseTask } = vi.hoisted(() => ({ baseTask: {
  id: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  project: { id: "22222222-2222-4222-8222-222222222222", name: "测试项目", color: "#3157f6" },
  title: "整理需求清单",
  summary: "整理当前项目中的需求并形成清晰列表",
  category: "产品需求",
  status: "IN_PROGRESS",
  visibility: "PRIVATE",
  claimMode: "AUTO",
  rewardType: "OTHER",
  rewardAmount: null,
  rewardDescription: null,
  locationType: "UNSPECIFIED",
  locationDescription: null,
  timeMode: "BEFORE",
  durationValue: null,
  durationUnit: null,
  deadline: null,
  personalDueAt: null,
  personalAssignedAt: "2026-07-29T08:00:00.000Z",
  personalAssignmentStatus: "IN_PROGRESS",
  publishedAt: null,
  publisher: { id: "33333333-3333-4333-8333-333333333333", username: "owner", displayName: "负责人", avatarPath: null },
  applicationCount: 0,
  assignmentCount: 1,
  maxAssignees: 1,
} as TaskSummary }));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn((path: string) => Promise.resolve({
    data: path.includes("assigned")
      ? [baseTask]
      : [{ ...baseTask, id: "44444444-4444-4444-8444-444444444444", title: "已完成事项", status: "COMPLETED" }],
  })),
  ApiError: class ApiError extends Error {},
}));

describe("PersonalTodoList", () => {
  it("presents personal tasks as an open and completed todo list", async () => {
    const user = userEvent.setup();
    render(<PersonalTodoList />);

    await waitFor(() => expect(screen.getByText("整理需求清单")).toBeInTheDocument());
    expect(screen.getByText("继续处理")).toBeInTheDocument();
    expect(screen.queryByText("已完成事项")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /已完成/ }));
    expect(screen.getByText("已完成事项")).toBeInTheDocument();
    expect(screen.getByText("查看记录")).toBeInTheDocument();
  });
});
