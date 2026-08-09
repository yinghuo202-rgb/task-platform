import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthForm } from "./auth-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ refresh: vi.fn() }) }));

describe("AuthForm", () => {
  it("shows field-level login validation errors", async () => {
    render(<AuthForm mode="login" />);
    await userEvent.click(screen.getByRole("button", { name: "登录" }));
    expect(await screen.findByText("请输入用户名或邮箱")).toBeInTheDocument();
  });

  it("renders accessible registration fields", () => {
    render(<AuthForm mode="register" />);
    expect(screen.getByLabelText(/^用户名/)).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText(/邮箱/)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(/空间邀请码/)).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "加入 la vie" })).toBeEnabled();
  });
});
