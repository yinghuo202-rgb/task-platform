import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch", () => {
  it("returns a clear throttling error when the proxy responds with a non-JSON page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Too Many Requests", { status: 429, headers: { "content-type": "text/html" } })));

    await expect(apiFetch("/entries")).rejects.toMatchObject({
      status: 429,
      code: "TOO_MANY_REQUESTS",
      message: "操作太快了，请稍等片刻再试",
    });
  });

  it("normalizes connection failures without swallowing aborts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(apiFetch("/entries")).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });

    const abort = new DOMException("Aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
    await expect(apiFetch("/entries")).rejects.toBe(abort);
  });

  it("normalizes a connection failure while refreshing an expired session", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response('{"message":"expired"}', { status: 401 }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch")));

    await expect(apiFetch("/entries")).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });
});
