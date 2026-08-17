import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JournalWorkspace, upsertEntryIndex } from "./journal-workspace";

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
  apiFetch.mockImplementation(async (path: string, options?: { method?: string; body?: string }) => {
    if (path.startsWith("/entries?")) return { data: { records, total: records.length, canImport: false }, requestId: "index" };
    if (path.startsWith("/entries/batch?")) {
      const ids = decodeURIComponent(path.split("ids=")[1] ?? "").split(",");
      return { data: records.filter((record) => ids.includes(record.id)).map((record) => ({ ...record, contentMarkdown: `${record.title}正文`, category: null, tags: [], visibility: "PUBLIC", version: 1 })), requestId: "batch" };
    }
    if (path.endsWith("/comments") && options?.method === "POST") {
      const payload = JSON.parse(options.body ?? "{}") as { content: string; anchorBlock: number; anchorQuote: string };
      return { data: { id: "comment-1", ...payload, createdAt: "2026-08-11T01:00:00.000Z", canDelete: true, author: records[1].createdBy }, requestId: "comment" };
    }
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
  it("updates and reorders the local index without refetching every journal", () => {
    const updated = {
      ...records[1],
      type: "JOURNAL" as const,
      title: "刚刚更新",
      entryDate: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T01:00:00.000Z",
      contentMarkdown: "新正文",
      category: null,
      tags: [],
      visibility: "PUBLIC" as const,
      version: 2,
    };

    const next = upsertEntryIndex([...records], updated);

    expect(next.map((record) => record.id)).toEqual(["entry-2", "entry-1"]);
    expect(next[0]).toMatchObject({ title: "刚刚更新" });
  });

  it("keeps only the stream and reader views", async () => {
    render(<JournalWorkspace />);
    expect(await screen.findByRole("heading", { name: "第一篇" }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "时光流" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "翻页看" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "回忆" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "全部" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "手帐" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "点评" })).not.toBeInTheDocument();
  });

  it("shows multiple journal excerpts in the stream without loading comments", async () => {
    render(<JournalWorkspace />);

    expect(await screen.findByRole("heading", { name: "第一篇" }, { timeout: 5_000 })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "第二篇" }, { timeout: 5_000 })).toBeInTheDocument();
    expect(apiFetch.mock.calls.some(([path]) => String(path).endsWith("/comments"))).toBe(false);
    expect(screen.queryByText(/条回应/)).not.toBeInTheDocument();
  });

  it("scrolls the time stream from the journal cards themselves", async () => {
    render(<JournalWorkspace />);
    await screen.findByRole("heading", { name: "第一篇" }, { timeout: 5_000 });
    const deck = screen.getByLabelText("手帐时光流，可上下滑动");
    const rail = screen.getByLabelText("全部手帐历史").querySelector<HTMLElement>(".journal-history-viewport")!;

    rail.scrollTop = 0;
    fireEvent.wheel(deck, { deltaY: 100, deltaMode: 0 });
    expect(rail.scrollTop).toBe(35);

    rail.scrollTop = 100;
    fireEvent.pointerDown(deck, { button: 0, clientY: 240, pointerId: 3 });
    fireEvent.pointerMove(deck, { clientY: 50, pointerId: 3 });
    expect(rail.scrollTop).toBeCloseTo(132.57, 1);
    fireEvent.pointerUp(deck, { clientY: 50, pointerId: 3 });
  });

  it("keeps the journal editor focused on the essential fields", async () => {
    render(<JournalWorkspace />);
    await screen.findByRole("heading", { name: "第一篇" }, { timeout: 5_000 });

    await userEvent.click(screen.getByRole("button", { name: "写手帐" }));

    expect(screen.getByRole("dialog", { name: "写手帐" })).toBeInTheDocument();
    expect(screen.getByText("标题")).toBeInTheDocument();
    expect(screen.getByText("日期")).toBeInTheDocument();
    expect(screen.getByText("正文")).toBeInTheDocument();
    expect(screen.queryByText("评分")).not.toBeInTheDocument();
    expect(screen.queryByText("分类")).not.toBeInTheDocument();
    expect(screen.queryByText("标签")).not.toBeInTheDocument();
    expect(screen.queryByText("仅自己可见")).not.toBeInTheDocument();
  });

  it("opens the selected journal in the reader when its stream card is clicked", async () => {
    render(<JournalWorkspace />);
    await screen.findByRole("heading", { name: "第一篇" }, { timeout: 5_000 });

    await userEvent.click(screen.getByRole("button", { name: "打开《第一篇》的翻页视图" }));

    expect(screen.getByRole("tab", { name: "翻页看" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("article", { name: /左右滑动/ })).toBeInTheDocument();
  });

  it("opens a non-current stream card directly with one click", async () => {
    render(<JournalWorkspace />);
    await screen.findByRole("heading", { name: "第二篇" }, { timeout: 5_000 });

    await userEvent.click(screen.getByRole("button", { name: "打开《第二篇》的翻页视图" }));

    expect(screen.getByRole("tab", { name: "翻页看" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("heading", { name: "第二篇" }, { timeout: 5_000 })).toBeInTheDocument();
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

  it("adds a comment directly below the long-pressed paragraph", async () => {
    render(<JournalWorkspace />);
    await screen.findByRole("heading", { name: "第一篇" }, { timeout: 5_000 });
    await userEvent.click(screen.getByRole("tab", { name: "翻页看" }));

    const paragraph = screen.getByLabelText("正文第 1 段，长按添加评论");
    vi.useFakeTimers();
    fireEvent.pointerDown(paragraph, { button: 0, clientX: 120, clientY: 160, pointerId: 2 });
    await act(async () => { await vi.advanceTimersByTimeAsync(530); });
    vi.useRealTimers();
    await userEvent.type(screen.getByPlaceholderText("写下想说的话…"), "我也记得");
    await userEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("我也记得")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/entries/entry-1/comments", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ content: "我也记得", anchorBlock: 0, anchorQuote: "第一篇正文" }),
    }));
    expect(screen.queryByText("留一句话")).not.toBeInTheDocument();
  });
});
