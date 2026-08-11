import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JournalWorkspace } from "./journal-workspace";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", () => ({
  apiFetch,
  ApiError: class ApiError extends Error {},
}));

const records = [
  { id: "entry-1", type: "JOURNAL", title: "第一篇", entryDate: "2026-08-11T00:00:00.000Z", rating: null, updatedAt: "2026-08-11T00:00:00.000Z", createdBy: { id: "user-1", displayName: "Cristina", username: "Cristina_zl" }, _count: { versions: 1, comments: 0 } },
  { id: "entry-2", type: "REVIEW", title: "第二篇", entryDate: "2026-08-10T00:00:00.000Z", rating: 5, updatedAt: "2026-08-10T00:00:00.000Z", createdBy: { id: "user-2", displayName: "yinghuo202", username: "yinghuo202" }, _count: { versions: 1, comments: 0 } },
] as const;

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (path: string) => {
    if (path.startsWith("/entries?")) return { data: { records, total: records.length, canImport: false }, requestId: "index" };
    if (path.endsWith("/comments")) return { data: [], requestId: "comments" };
    const id = path.split("/").at(-1);
    const record = records.find((item) => item.id === id) ?? records[0];
    return { data: { ...record, contentMarkdown: `${record.title}正文`, category: null, tags: [], visibility: "PUBLIC", version: 1 }, requestId: id };
  });
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
});

describe("JournalWorkspace", () => {
  it("keeps only the stream and reader views", async () => {
    render(<JournalWorkspace />);
    expect(await screen.findByRole("heading", { name: "第一篇" }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "时光流" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "翻页看" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "回忆" })).not.toBeInTheDocument();
  });

  it("switches reader entries with a horizontal swipe", async () => {
    render(<JournalWorkspace />);
    await screen.findByRole("heading", { name: "第一篇" }, { timeout: 5_000 });
    await userEvent.click(screen.getByRole("tab", { name: "翻页看" }));
    const reader = screen.getByRole("article", { name: /左右滑动/ });

    fireEvent.pointerDown(reader, { button: 0, clientX: 220, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(reader, { clientX: 120, clientY: 104, pointerId: 1 });
    fireEvent.pointerUp(reader, { clientX: 120, clientY: 104, pointerId: 1 });

    expect(await screen.findByRole("heading", { name: "第二篇" }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });
});
