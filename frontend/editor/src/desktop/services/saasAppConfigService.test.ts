import { describe, expect, test, vi, beforeEach } from "vitest";
import { expectConsole } from "@app/tests/failOnConsole";

const { fetchMock, getModeMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getModeMock: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: fetchMock }));
vi.mock("@app/constants/connection", () => ({
  STIRLING_SAAS_BACKEND_API_URL: "https://api.saas.test",
}));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: { getCurrentMode: getModeMock },
}));

import { saasAppConfigService } from "@app/services/saasAppConfigService";

function okConfig(body: Record<string, unknown>) {
  return { ok: true, status: 200, json: async () => body };
}

describe("saasAppConfigService", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    getModeMock.mockReset();
    saasAppConfigService.clearCache();
  });

  test("returns null outside SaaS mode without fetching", async () => {
    getModeMock.mockResolvedValue("local");
    expect(await saasAppConfigService.getConfig()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("fetches the SaaS app-config in SaaS mode and caches it", async () => {
    getModeMock.mockResolvedValue("saas");
    fetchMock.mockResolvedValue(
      okConfig({ aiEngineEnabled: true, premiumEnabled: false }),
    );

    const first = await saasAppConfigService.getConfig();
    expect(first?.aiEngineEnabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.saas.test/api/v1/config/app-config",
    );

    // Second read is served from cache (no extra fetch).
    const second = await saasAppConfigService.getConfig();
    expect(second?.aiEngineEnabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("returns null on a non-ok response", async () => {
    getModeMock.mockResolvedValue("saas");
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    expectConsole.warn(/SaaS app-config fetch failed: 500/);
    expect(await saasAppConfigService.getConfig()).toBeNull();
  });
});
