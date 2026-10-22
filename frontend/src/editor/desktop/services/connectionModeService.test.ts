import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConnectionModeService,
  LOCAL_MODE_STORAGE_KEY,
} from "@app/services/connectionModeService";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => true }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("@app/services/endpointAvailabilityService", () => ({
  endpointAvailabilityService: { clearCache: vi.fn() },
}));
vi.mock("@app/services/selfHostedServerMonitor", () => ({
  selfHostedServerMonitor: { start: vi.fn() },
}));

beforeEach(() => {
  localStorage.clear();
  invoke.mockReset();
});

describe("managed connections", () => {
  it("ignores an old guest preference when sign-in is required", async () => {
    localStorage.setItem(LOCAL_MODE_STORAGE_KEY, "true");
    invoke.mockResolvedValue({
      mode: "saas",
      server_config: null,
      lock_connection_mode: false,
      require_sign_in: true,
      cloud_only: true,
    });
    const service = new ConnectionModeService();
    expect(await service.getCurrentMode()).toBe("saas");
    await expect(service.switchToLocal()).rejects.toThrow("requires sign-in");
    expect(localStorage.getItem(LOCAL_MODE_STORAGE_KEY)).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith(
      "set_connection_mode",
      expect.anything(),
    );
  });

  it("rejects self-hosted connections before changing native or browser state", async () => {
    invoke.mockResolvedValue({
      mode: "saas",
      server_config: null,
      lock_connection_mode: false,
      cloud_only: true,
    });
    const service = new ConnectionModeService();
    await expect(
      service.switchToSelfHosted({ url: "https://example.org" }),
    ).rejects.toThrow("Stirling Cloud");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("preserves all policies after SaaS sign-in", async () => {
    invoke.mockResolvedValue({
      mode: "saas",
      server_config: null,
      lock_connection_mode: false,
      require_sign_in: true,
      cloud_only: true,
      local_processing_only: true,
    });
    const service = new ConnectionModeService();
    await service.switchToSaaS("https://cloud.example.org");
    expect(await service.getCurrentConfig()).toMatchObject({
      require_sign_in: true,
      cloud_only: true,
      local_processing_only: true,
      mode: "saas",
    });
    await expect(service.switchToLocal()).rejects.toThrow("requires sign-in");
  });

  it("allows guest use when only Cloud-only is set", async () => {
    invoke.mockResolvedValue({
      mode: "saas",
      server_config: null,
      lock_connection_mode: false,
      cloud_only: true,
    });
    const service = new ConnectionModeService();
    await service.switchToLocal();
    expect(await service.getCurrentMode()).toBe("local");
  });

  it("retains the locked self-hosted server restriction", async () => {
    invoke.mockResolvedValue({
      mode: "selfhosted",
      server_config: { url: "https://managed.example.org" },
      lock_connection_mode: true,
    });
    const service = new ConnectionModeService();
    await expect(
      service.assertSelfHostedAllowed("https://managed.example.org/"),
    ).resolves.toBeUndefined();
    await expect(
      service.assertSelfHostedAllowed("https://other.example.org"),
    ).rejects.toThrow("locked");
    await expect(
      service.switchToSaaS("https://cloud.example.org"),
    ).rejects.toThrow("locked");
    await service.switchToLocal();
    await expect(
      service.assertSelfHostedAllowed("https://managed.example.org"),
    ).resolves.toBeUndefined();
  });

  it("fails closed if the native policy cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    invoke.mockRejectedValue(new Error("Store unavailable"));
    await expect(
      new ConnectionModeService().getCurrentConfig(),
    ).rejects.toThrow("Store unavailable");
  });
});
