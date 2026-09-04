import type { AxiosInstance } from "axios";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { allowConsole, expectConsole } from "@app/tests/failOnConsole";

vi.mock("@app/auth/spring/springAuthClient", () => ({
  setPostLoginRedirectPath: vi.fn(),
}));
vi.mock("@app/utils/browserIdentifier", () => ({
  getBrowserId: () => "browser-1",
}));

import { setupApiInterceptors } from "@app/services/apiClientSetup";

type Rejected = (error: unknown) => Promise<unknown>;

/** An axios-like client just rich enough to drive the response interceptor. */
function makeClient() {
  let onRejected: Rejected = async (e) => Promise.reject(e);
  const post = vi.fn();
  const retry = vi.fn().mockResolvedValue({ data: "retried" });

  const client = Object.assign(retry, {
    interceptors: {
      request: { use: vi.fn() },
      response: {
        use: (_ok: unknown, rejected: Rejected) => {
          onRejected = rejected;
        },
      },
    },
    post,
  }) as unknown as AxiosInstance;

  setupApiInterceptors(client);
  return { client, post, retry, fail: (e: unknown) => onRejected(e) };
}

function axiosError(status: number | undefined, url = "/api/v1/admin/thing") {
  return {
    config: { url, headers: {} as Record<string, string> },
    response: status === undefined ? undefined : { status },
    isAxiosError: true,
    message: status === undefined ? "Network Error" : `status ${status}`,
  };
}

describe("self-hosted API client 401 handling", () => {
  let href: string;

  beforeEach(() => {
    localStorage.setItem("stirling_jwt", "old-token");
    href = "";
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        pathname: "/settings/adminGeneral",
        search: "",
        get href() {
          return href;
        },
        set href(next: string) {
          href = next;
        },
      },
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  test("a refresh that never completes leaves the session alone", async () => {
    const { post, fail } = makeClient();
    // No `response` on the error: the refresh call never reached the server.
    post.mockRejectedValueOnce(axiosError(undefined, "/api/v1/auth/refresh"));
    expectConsole.error(/Token refresh failed/);
    allowConsole.warn(/./);

    await expect(fail(axiosError(401))).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(localStorage.getItem("stirling_jwt")).toBe("old-token");
    expect(href).toBe("");
  });

  test("a rejected refresh clears the token and goes to login", async () => {
    const { post, fail } = makeClient();
    post.mockRejectedValueOnce(axiosError(401, "/api/v1/auth/refresh"));
    expectConsole.error(/Token refresh failed/);
    allowConsole.warn(/./);

    await expect(fail(axiosError(401))).rejects.toBeTruthy();

    expect(localStorage.getItem("stirling_jwt")).toBeNull();
    expect(href).toContain("/login");
  });

  test("the caller sees its own error, not the refresh's", async () => {
    const { post, fail } = makeClient();
    post.mockRejectedValueOnce(axiosError(500, "/api/v1/auth/refresh"));
    expectConsole.error(/Token refresh failed/);
    allowConsole.warn(/./);

    const caught = (await fail(axiosError(401, "/api/v1/admin/mine")).catch(
      (e) => e,
    )) as { config: { url: string } };

    expect(caught.config.url).toBe("/api/v1/admin/mine");
  });

  test("a successful refresh retries the original request", async () => {
    const { post, retry, fail } = makeClient();
    post.mockResolvedValueOnce({
      data: { session: { access_token: "new-token" } },
    });
    allowConsole.warn(/./);

    await expect(fail(axiosError(401))).resolves.toEqual({ data: "retried" });

    expect(localStorage.getItem("stirling_jwt")).toBe("new-token");
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
