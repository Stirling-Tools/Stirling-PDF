import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

// Regression: a caller-set "Content-Type: multipart/form-data" (no boundary) on a
// FormData POST must NOT reach the server, or Jetty rejects it with
// "No multipart boundary parameter in Content-Type". The client must drop it so the
// native fetch generates the boundary (axios does this for FormData).

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: fetchMock }));

import { create } from "@app/services/tauriHttpClient";
import { allowConsole } from "@app/tests/failOnConsole";

function okJson() {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => "{}",
  };
}

function lastFetchHeaders(): Record<string, string> {
  const opts = fetchMock.mock.calls[0]?.[1] ?? {};
  return (opts.headers ?? {}) as Record<string, string>;
}

describe("tauriHttpClient — native request origin", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(okJson());
  });

  afterEach(() => vi.unstubAllEnvs());

  test.each([true, false])(
    "preserves auth and overrides Origin only in dev (DEV=%s)",
    async (dev) => {
      vi.stubEnv("DEV", dev);

      const client = create({
        baseURL: "https://api.test",
        headers: { "X-Browser-Id": "desktop-test" },
      });

      await client.get("/api/v1/policies", {
        headers: { Authorization: "Bearer test-token" },
        withCredentials: true,
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.test/api/v1/policies",
        expect.objectContaining({
          method: "GET",
          credentials: "include",
          headers: {
            ...(dev ? { Origin: "tauri://localhost" } : {}),
            "X-Browser-Id": "desktop-test",
            Authorization: "Bearer test-token",
          },
        }),
      );
    },
  );
});

describe("tauriHttpClient — Content-Type handling", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(okJson());
  });

  test("sends URLSearchParams as an encoded form with repeated and empty values", async () => {
    const client = create({ baseURL: "https://api.test" });
    const params = new URLSearchParams([
      ["username", "Jörg + admin&"],
      ["role", "ROLE_USER"],
      ["role", "ROLE_ADMIN"],
      ["empty", ""],
    ]);

    await client.post("/api/v1/user/admin/saveUser", params);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/api/v1/user/admin/saveUser",
      expect.objectContaining({
        body: "username=J%C3%B6rg+%2B+admin%26&role=ROLE_USER&role=ROLE_ADMIN&empty=",
        headers: expect.objectContaining({
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        }),
      }),
    );
  });

  test.each(["Content-Type", "content-type", "CONTENT-TYPE"])(
    "preserves an explicit %s header for URLSearchParams",
    async (header) => {
      const client = create({ baseURL: "https://api.test" });
      const contentType = "application/x-www-form-urlencoded";

      await client.post(
        "/api/v1/team/rename",
        new URLSearchParams({ name: "A B" }),
        {
          headers: { [header]: contentType },
        },
      );

      expect(fetchMock.mock.calls[0][1].body).toBe("name=A+B");
      expect(
        Object.entries(lastFetchHeaders()).filter(
          ([key]) => key.toLowerCase() === "content-type",
        ),
      ).toEqual([[header, contentType]]);
    },
  );

  test("strips a caller-set Content-Type on FormData so the boundary is generated", async () => {
    const client = create({ baseURL: "https://api.test" });
    const form = new FormData();
    form.append("fileInput", new Blob(["x"]), "f.pdf");

    await client.post("/api/v1/policies/abc/run", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const keys = Object.keys(lastFetchHeaders()).map((k) => k.toLowerCase());
    expect(keys).not.toContain("content-type");
    expect(fetchMock.mock.calls[0][1].body).toBeInstanceOf(FormData);
  });

  test("keeps application/json for plain object bodies", async () => {
    const client = create({ baseURL: "https://api.test" });
    await client.post("/api/v1/x", { a: 1 });

    const ct = Object.entries(lastFetchHeaders()).find(
      ([k]) => k.toLowerCase() === "content-type",
    )?.[1];
    expect(ct).toBe("application/json");
  });
});

describe("tauriHttpClient — rejection chain", () => {
  function status(code: number) {
    return {
      ok: code < 400,
      status: code,
      statusText: "",
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => (code < 400 ? '{"ok":true}' : "{}"),
    };
  }

  beforeEach(() => {
    fetchMock.mockReset();
    allowConsole.error(/\[TauriHttpClient\]/);
  });

  test("a handler that recovers the request resolves with its response", async () => {
    fetchMock
      .mockResolvedValueOnce(status(401))
      .mockResolvedValueOnce(status(200));
    const client = create({ baseURL: "https://server.test" });
    const later = vi.fn((error: unknown) => Promise.reject(error));
    client.interceptors.response.use(
      (response) => response,
      () => client.get("/api/v1/thing"),
    );
    client.interceptors.response.use((response) => response, later);

    const response = await client.get<{ ok: boolean }>("/api/v1/thing");

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ ok: true });
    expect(later).not.toHaveBeenCalled();
  });

  test("a chain that keeps rejecting runs each handler once and rejects", async () => {
    fetchMock.mockResolvedValue(status(401));
    const client = create({ baseURL: "https://server.test" });
    const first = vi.fn((error: unknown) => Promise.reject(error));
    const second = vi.fn((error: unknown) => Promise.reject(error));
    client.interceptors.response.use((response) => response, first);
    client.interceptors.response.use((response) => response, second);

    await expect(client.get("/api/v1/thing")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
