// @vitest-environment node
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

// Regression: a caller-set "Content-Type: multipart/form-data" (no boundary) on a
// FormData POST must NOT reach the server, or Jetty rejects it with
// "No multipart boundary parameter in Content-Type". The client must drop it so the
// native fetch generates the boundary (axios does this for FormData).

const { fetchMock, detachMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  detachMock: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: fetchMock }));
vi.mock("@app/utils/storedBlob", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/utils/storedBlob")>();
  detachMock.mockImplementation(actual.detachedFormData);
  return { ...actual, detachedFormData: detachMock };
});
vi.mock("@app/services/documentPrivacyService", () => ({
  enforceDocumentPrivacy: vi.fn().mockResolvedValue(false),
}));

import { create } from "@app/services/tauriHttpClient";
import { expectConsole } from "@app/tests/failOnConsole";

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

  test("sends copies of the FormData's files, never the caller's own", async () => {
    // Both transports build a Request from the body, and a Request builds a Blob
    // over each file in it, which Chromium kills the renderer for when that file
    // came out of IndexedDB.
    const client = create({ baseURL: "https://api.test" });
    const stored = new File(["%PDF-1.7"], "stored.pdf", {
      type: "application/pdf",
    });
    const form = new FormData();
    form.append("fileInput", stored);
    form.append("pageNumbers", "1-3");

    await client.post("/api/v1/general/rotate-pdf", form);

    const sent = fetchMock.mock.calls[0][1].body as FormData;
    expect(sent).toBeInstanceOf(FormData);
    expect(sent).not.toBe(form);
    const file = sent.get("fileInput") as File;
    expect(file).not.toBe(stored);
    expect(file.name).toBe("stored.pdf");
    expect(sent.get("pageNumbers")).toBe("1-3");
  });

  test("hands a failed copy of the files to the error interceptors", async () => {
    expectConsole.error(/\[TauriHttpClient\] Network error/);
    expectConsole.error(/\[TauriHttpClient\] Error details/);
    const lost = new DOMException(
      "The object can not be found here.",
      "NotFoundError",
    );
    detachMock.mockRejectedValueOnce(lost);
    const client = create({ baseURL: "https://api.test" });
    const onRejected = vi.fn((error: unknown) => Promise.reject(error));
    client.interceptors.response.use((response) => response, onRejected);
    const form = new FormData();
    form.append("fileInput", new Blob(["x"]), "f.pdf");

    await expect(
      client.post("/api/v1/general/rotate-pdf", form),
    ).rejects.toBeDefined();

    expect(onRejected).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
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
