import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthForm } from "./auth-form";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  auth: { user: null as { id: string } | null, loading: false },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ ...mocks.auth, refresh: mocks.refresh }) }));

describe("AuthForm", () => {
  it("automatically leaves the login page when the device session is restored", async () => {
    mocks.auth.user = { id: "viewer" };
    render(<AuthForm mode="login" />);
    expect(screen.getByText("正在恢复登录…")).toBeInTheDocument();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"));
    mocks.auth.user = null;
  });

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
