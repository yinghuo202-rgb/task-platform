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
      .mockResolvedValueOnce(new Response('{"message":"expired"}', { status: 401 }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch")));

    await expect(apiFetch("/entries")).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("shares one session refresh across concurrent requests", async () => {
    let protectedRequests = 0;
    let refreshRequests = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) return new Response('{"message":"expired"}', { status: 401 });
      if (url.endsWith("/auth/refresh")) {
        refreshRequests += 1;
        return new Response('{"data":{"id":"viewer"},"requestId":"refresh"}', { status: 200 });
      }
      protectedRequests += 1;
      if (protectedRequests <= 2) return new Response('{"message":"expired"}', { status: 401 });
      return new Response('{"data":[],"requestId":"request"}', { status: 200 });
    }));

    await expect(Promise.all([apiFetch("/entries"), apiFetch("/tasks")])).resolves.toHaveLength(2);
    expect(refreshRequests).toBe(1);
  });

  it("does not turn an invalid login into a session refresh", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"message":"用户名、邮箱或密码错误"}', { status: 401 }));
    vi.stubGlobal("fetch", fetch);

    await expect(apiFetch("/auth/login", { method: "POST", body: "{}" })).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
