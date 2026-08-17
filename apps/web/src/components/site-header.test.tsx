import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./site-header";

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "1", displayName: "测试用户", role: "USER" }, loading: false, logout: vi.fn() }) }));

describe("SiteHeader", () => {
  it("provides a compact four-item mobile navigation without the profile page", () => {
    render(<SiteHeader />);
    const nav = screen.getByRole("navigation", { name: "移动端导航" });
    expect(nav.querySelectorAll("a")).toHaveLength(4);
    expect(screen.queryByRole("link", { name: /项目/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "我们" })).not.toBeInTheDocument();
    expect(screen.queryByText("la vie")).not.toBeInTheDocument();
    expect(screen.queryByText("两个人的生活空间")).not.toBeInTheDocument();
  });
});
