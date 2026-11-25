import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetch } from "@tauri-apps/plugin-http";
import { EndpointAvailabilityService } from "@editor/services/endpointAvailabilityService";
import { expectConsole } from "@editor/tests/failOnConsole";

const backend = vi.hoisted(() => ({ isOnline: true }));

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("@editor/services/tauriBackendService", () => ({
  tauriBackendService: backend,
}));

const capabilities = {
  "file-to-pdf": { enabled: true, reason: null },
  "pdf-to-word": { enabled: false, reason: "MISSING_DEPENDENCY" },
};

function respondWith(body: unknown, ok = true) {
  vi.mocked(fetch).mockResolvedValue({
    ok,
    status: ok ? 200 : 503,
    json: async () => body,
  } as Response);
}

describe("EndpointAvailabilityService", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    backend.isOnline = true;
  });

  it("answers every concurrent check from one request", async () => {
    respondWith(capabilities);
    const service = new EndpointAvailabilityService();

    const answers = await Promise.all([
      service.isEndpointSupportedLocally("file-to-pdf", "http://127.0.0.1:1"),
      service.isEndpointSupportedLocally("file-to-pdf", "http://127.0.0.1:1"),
      service.isEndpointSupportedLocally("pdf-to-word", "http://127.0.0.1:1"),
      service.isEndpointSupportedLocally("unknown", "http://127.0.0.1:1"),
    ]);

    expect(answers).toEqual([true, true, false, false]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      "http://127.0.0.1:1/api/v1/config/endpoints-availability",
    );
  });

  it("reuses the map for later checks against the same backend", async () => {
    respondWith(capabilities);
    const service = new EndpointAvailabilityService();

    await service.isEndpointSupportedLocally(
      "file-to-pdf",
      "http://127.0.0.1:1",
    );
    await service.isEndpointSupportedLocally(
      "pdf-to-word",
      "http://127.0.0.1:1",
    );

    expect(fetch).toHaveBeenCalledOnce();
  });

  it("fetches again for a restarted backend on a new port", async () => {
    respondWith(capabilities);
    const service = new EndpointAvailabilityService();

    await service.isEndpointSupportedLocally(
      "file-to-pdf",
      "http://127.0.0.1:1",
    );
    await service.isEndpointSupportedLocally(
      "file-to-pdf",
      "http://127.0.0.1:2",
    );

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed check", async () => {
    expectConsole.error(/Local capability check failed: 503/);
    respondWith({}, false);
    const service = new EndpointAvailabilityService();

    await expect(
      service.isEndpointSupportedLocally("file-to-pdf", "http://127.0.0.1:1"),
    ).resolves.toBe(false);

    respondWith(capabilities);
    await expect(
      service.isEndpointSupportedLocally("file-to-pdf", "http://127.0.0.1:1"),
    ).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reports nothing local before the backend has a URL", async () => {
    const service = new EndpointAvailabilityService();

    await expect(
      service.isEndpointSupportedLocally("file-to-pdf", null),
    ).resolves.toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not keep a map read before the backend's dependencies are ready", async () => {
    backend.isOnline = false;
    respondWith(capabilities);
    const service = new EndpointAvailabilityService();

    await service.isEndpointSupportedLocally(
      "file-to-pdf",
      "http://127.0.0.1:1",
    );
    backend.isOnline = true;
    await service.isEndpointSupportedLocally(
      "file-to-pdf",
      "http://127.0.0.1:1",
    );
    await service.isEndpointSupportedLocally(
      "file-to-pdf",
      "http://127.0.0.1:1",
    );

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
