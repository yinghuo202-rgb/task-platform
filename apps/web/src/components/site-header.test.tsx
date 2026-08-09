import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./site-header";

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "1", displayName: "测试用户", role: "USER" }, loading: false, logout: vi.fn() }) }));

describe("SiteHeader", () => {
  it("provides a five-item keyboard-accessible mobile navigation", () => {
    render(<SiteHeader />);
    const nav = screen.getByRole("navigation", { name: "移动端导航" });
    expect(nav.querySelectorAll("a")).toHaveLength(5);
    expect(screen.queryByRole("link", { name: /项目/ })).not.toBeInTheDocument();
  });
});
