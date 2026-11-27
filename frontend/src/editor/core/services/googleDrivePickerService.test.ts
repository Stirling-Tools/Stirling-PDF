import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@editor/utils/scriptLoader", () => ({
  loadScript: vi.fn().mockResolvedValue(undefined),
}));

const config = { clientId: "client", apiKey: "key", appId: "app" };

type GapiLoad = (name: string, loadConfig: gapi.LoadConfig) => void;

function installGoogleGlobals(load: GapiLoad) {
  vi.stubGlobal("gapi", { load: vi.fn(load) });
  vi.stubGlobal("google", {
    accounts: { oauth2: { initTokenClient: vi.fn(() => ({})) } },
  });
}

async function freshService() {
  vi.resetModules();
  const { getGoogleDrivePickerService } =
    await import("@editor/services/googleDrivePickerService");
  return getGoogleDrivePickerService();
}

describe("GoogleDrivePickerService.initialize", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", { getItem: () => null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects when the loader calls back without gapi.client", async () => {
    installGoogleGlobals((_name, loadConfig) => loadConfig.callback());
    const service = await freshService();

    await expect(service.initialize(config)).rejects.toThrow(
      "Google API client module did not load",
    );
  });

  it("rejects when the gapi modules fail to load", async () => {
    installGoogleGlobals((_name, loadConfig) => loadConfig.onerror?.());
    const service = await freshService();

    await expect(service.initialize(config)).rejects.toThrow(
      "Failed to load Google API modules",
    );
  });

  it("rejects when the gapi modules time out", async () => {
    installGoogleGlobals((_name, loadConfig) => loadConfig.ontimeout?.());
    const service = await freshService();

    await expect(service.initialize(config)).rejects.toThrow(
      "Timed out loading Google API modules",
    );
  });

  it("rejects when the Drive discovery doc fails to load", async () => {
    installGoogleGlobals((_name, loadConfig) => {
      window.gapi.client = {
        load: vi.fn().mockRejectedValue(new Error("discovery failed")),
      } as unknown as typeof gapi.client;
      loadConfig.callback();
    });
    const service = await freshService();

    await expect(service.initialize(config)).rejects.toThrow(
      "discovery failed",
    );
  });

  it("resolves once the client and the Drive discovery doc load", async () => {
    const clientLoad = vi.fn().mockResolvedValue(undefined);
    installGoogleGlobals((_name, loadConfig) => {
      window.gapi.client = {
        load: clientLoad,
      } as unknown as typeof gapi.client;
      loadConfig.callback();
    });
    const service = await freshService();

    await expect(service.initialize(config)).resolves.toBeUndefined();
    expect(clientLoad).toHaveBeenCalledWith(
      "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
    );
  });
});
