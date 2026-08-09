import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskForm } from "./task-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  apiFetch: () => Promise.resolve({ data: [{ id: "11111111-1111-4111-8111-111111111111", name: "测试项目" }] }),
  ApiError: class ApiError extends Error {},
}));

describe("TaskForm simplified fields", () => {
  it("supports fixed and claim-relative task times", async () => {
    const user = userEvent.setup();
    render(<TaskForm />);

    const timeMode = screen.getByLabelText(/什么时候/);
    expect(screen.getByLabelText(/截止时间/)).toBeInTheDocument();

    await user.selectOptions(timeMode, "WITHIN");
    expect(screen.getByLabelText(/多长时间内/)).toBeInTheDocument();
    expect(screen.getByLabelText(/单位/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/截止时间/)).not.toBeInTheDocument();

    await user.selectOptions(timeMode, "AT");
    expect(screen.getByLabelText(/具体执行时间/)).toBeInTheDocument();
  });

  it("removes marketplace-only fields from the private checklist", () => {
    render(<TaskForm />);
    expect(screen.getByLabelText(/想做的事/)).toBeInTheDocument();
    expect(screen.getByLabelText(/备注/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/回报/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/参与地点/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/验收标准/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/谁能看到/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/如何加入/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/需要几个人/)).not.toBeInTheDocument();
  });
});
