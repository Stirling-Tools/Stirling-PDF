import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  restricted: true,
  loadError: false,
  localUrl: "http://127.0.0.1:62994" as string | null,
  fetch: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: state.fetch }));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentConfig: async () => {
      if (state.loadError) throw new Error("Policy unavailable");
      return {
        local_processing_only: state.restricted,
        server_config: { url: "https://selfhosted.test" },
      };
    },
  },
}));
vi.mock("@app/services/tauriBackendService", () => ({
  tauriBackendService: { getBackendUrl: () => state.localUrl },
}));
vi.mock("@app/constants/connection", () => ({
  STIRLING_SAAS_BACKEND_API_URL: "https://cloud.test",
}));
vi.mock("@app/i18n", () => ({
  default: { t: (_key: string, fallback: string) => fallback },
}));
vi.mock("@app/services/tauriLocalProxy", () => ({
  shouldUseFastLocalTransport: () => false,
}));

import { create } from "@app/services/tauriHttpClient";

beforeEach(() => {
  state.restricted = true;
  state.loadError = false;
  state.localUrl = "http://127.0.0.1:62994";
  state.fetch
    .mockReset()
    .mockImplementation(
      async () =>
        new Response("{}", { headers: { "Content-Type": "application/json" } }),
    );
});

describe("managed document request boundary", () => {
  test.each([
    "https://cloud.test/api/v1/misc/compress-pdf",
    "https://selfhosted.test/api/v1/convert/pdf/word",
    "https://uploads.test/signed-object?signature=abc",
    "https://cloud.test/api/v1/storage/files",
    "https://cloud.test/api/v1/security/cert-sign/sessions",
    "https://cloud.test/api/v1/ai/orchestrate/stream",
    "http://127.0.0.1:62994/api/v1/policies/run",
    "http://127.0.0.1:62994/api/v1/security/timestamp-pdf",
    "http://127.0.0.1:62994/api/v1/security/cert-sign/sessions",
    "http://127.0.0.1:62994/api/v1/storage/files",
    "http://127.0.0.1:62994/api/v1/mobile-scanner/create-session",
    "http://127.0.0.1:7777/api/v1/misc/compress-pdf",
    "https://cloud.test.attacker.test/api/v1/payg/wallet",
  ])("sends nothing to %s", async (url) => {
    const body = new FormData();
    body.append("fileInput", new File(["private"], "private.pdf"));
    await expect(create().post(url, body)).rejects.toThrow(
      "stay on this device",
    );
    expect(state.fetch).not.toHaveBeenCalled();
  });

  test("blocks document JSON and remote reads as well as multipart uploads", async () => {
    const client = create({ baseURL: "https://cloud.test" });
    await expect(
      client.post("/api/v1/ai/orchestrate/stream", {
        text: "private document text",
      }),
    ).rejects.toThrow("stay on this device");
    await expect(client.get("/api/v1/storage/files")).rejects.toThrow(
      "stay on this device",
    );
    expect(state.fetch).not.toHaveBeenCalled();
  });

  test("permits bundled processing and disables redirect forwarding", async () => {
    const body = new FormData();
    body.append("fileInput", new File(["private"], "private.pdf"));
    await create().post(
      "http://127.0.0.1:62994/api/v1/misc/compress-pdf",
      body,
    );
    expect(state.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body, maxRedirections: 0 }),
    );
  });

  test("permits account and billing requests, but no file payloads to account APIs", async () => {
    const client = create({ baseURL: "https://cloud.test" });
    await client.get("/api/v1/auth/me");
    await client.get("/api/v1/payg/wallet");
    await client.post("/api/v1/team/invite", {
      email: "colleague@example.org",
    });
    expect(state.fetch).toHaveBeenCalledTimes(3);
    await expect(
      client.post("/api/v1/team/invite", new Blob(["private"])),
    ).rejects.toThrow("stay on this device");
    expect(state.fetch).toHaveBeenCalledTimes(3);
  });

  test("an unreadable policy or an undiscovered local backend does not permit uploads", async () => {
    state.localUrl = null;
    await expect(
      create().post(
        "http://127.0.0.1:62994/api/v1/misc/compress-pdf",
        "private",
      ),
    ).rejects.toThrow();
    state.loadError = true;
    await expect(
      create().post("https://cloud.test/api/v1/misc/compress-pdf", "private"),
    ).rejects.toThrow("Policy unavailable");
    expect(state.fetch).not.toHaveBeenCalled();
  });

  test("unmanaged installs retain cloud processing", async () => {
    state.restricted = false;
    await create().post(
      "https://cloud.test/api/v1/misc/compress-pdf",
      "document",
    );
    expect(state.fetch).toHaveBeenCalledOnce();
  });
});
