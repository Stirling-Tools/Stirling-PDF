import { describe, expect, test, vi, beforeEach } from "vitest";

// Regression: a caller-set "Content-Type: multipart/form-data" (no boundary) on a
// FormData POST must NOT reach the server, or Jetty rejects it with
// "No multipart boundary parameter in Content-Type". The client must drop it so the
// native fetch generates the boundary (axios does this for FormData).

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: fetchMock }));

import { create } from "@app/services/tauriHttpClient";

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

describe("tauriHttpClient — Content-Type handling", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(okJson());
  });

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
