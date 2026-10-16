// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

// Verifies operationRouter.getBaseUrl host selection in SaaS mode: cloud-only
// feature endpoints (payg/team/policies) must hit the SaaS backend, NOT the local
// bundled backend (which doesn't serve them — regression that returned 500 for
// /api/v1/payg/wallet). A plain non-cloud, non-tool endpoint still defaults local.

const SAAS_URL = "https://api.saas.test";

vi.mock("@app/services/authService", () => ({
  authService: {
    isAuthenticated: vi.fn().mockResolvedValue(true),
    awaitRefreshIfInProgress: vi.fn().mockResolvedValue(undefined),
  },
}));

// NB: vi.mock factories are hoisted above top-level consts, so they must use
// literals (not SAAS_URL/LOCAL_URL) to avoid a TDZ ReferenceError.
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentConfig: vi
      .fn()
      .mockResolvedValue({ local_processing_only: false }),
    getCurrentMode: vi.fn().mockResolvedValue("saas"),
    getServerConfig: vi
      .fn()
      .mockResolvedValue({ url: "https://api.saas.test" }),
  },
}));
vi.mock("@app/constants/connection", () => ({
  STIRLING_SAAS_BACKEND_API_URL: "https://api.saas.test",
}));
vi.mock("@app/services/tauriBackendService", () => ({
  tauriBackendService: {
    isOnline: true,
    getBackendUrl: () => "http://localhost:62994",
  },
}));
vi.mock("@app/services/endpointAvailabilityService", () => ({
  endpointAvailabilityService: {
    isEndpointSupportedLocally: vi.fn().mockResolvedValue(true),
    isEndpointSupportedOnSaaS: vi.fn().mockResolvedValue(true),
  },
}));
vi.mock("@app/services/selfHostedServerMonitor", () => ({
  selfHostedServerMonitor: { getSnapshot: vi.fn(() => ({ status: "online" })) },
}));
vi.mock("@app/i18n", () => ({
  default: { t: (_k: string, fallback: string) => fallback || _k },
}));

import { operationRouter } from "@app/services/operationRouter";
import { connectionModeService } from "@app/services/connectionModeService";
import { authService } from "@app/services/authService";
import { selfHostedServerMonitor } from "@app/services/selfHostedServerMonitor";
import { endpointAvailabilityService } from "@app/services/endpointAvailabilityService";

beforeEach(() => {
  vi.mocked(connectionModeService.getCurrentConfig).mockResolvedValue({
    mode: "saas",
    server_config: null,
    lock_connection_mode: false,
    local_processing_only: false,
  });
  vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue("saas");
  vi.mocked(authService.isAuthenticated).mockResolvedValue(true);
});

describe("server-owned automation", () => {
  const endpoints = [
    "/api/v1/policies",
    "/api/v1/policies?limit=20",
    "/api/v1/policies/run",
    "/api/v1/processing-folders",
    "/api/v1/automation/meter",
    "/api/v1/pipeline/handleData",
  ];
  test.each(endpoints)("refuses %s in local mode", async (endpoint) => {
    vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue("local");
    await expect(operationRouter.getBaseUrl(endpoint)).rejects.toThrow(
      "Sign in",
    );
  });
  test.each(endpoints)(
    "keeps %s on an offline self-hosted server",
    async (endpoint) => {
      vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue(
        "selfhosted",
      );
      vi.mocked(connectionModeService.getServerConfig).mockResolvedValue({
        url: "https://selfhosted.test/",
      });
      vi.mocked(selfHostedServerMonitor.getSnapshot).mockReturnValue({
        status: "offline",
        isOnline: false,
        serverUrl: "https://selfhosted.test",
      });
      await expect(operationRouter.getBaseUrl(endpoint)).resolves.toBe(
        "https://selfhosted.test",
      );
      await expect(
        operationRouter.shouldSkipBackendReadyCheck(endpoint),
      ).resolves.toBe(true);
    },
  );
  test("rejects a configured server without a session", async () => {
    vi.mocked(authService.isAuthenticated).mockResolvedValue(false);
    await expect(
      operationRouter.getBaseUrl("/api/v1/policies/run"),
    ).rejects.toThrow("Sign in");
  });
});

describe("managed local document processing", () => {
  beforeEach(() => {
    vi.mocked(connectionModeService.getCurrentConfig).mockResolvedValue({
      mode: "saas",
      server_config: null,
      lock_connection_mode: false,
      local_processing_only: true,
    });
    vi.mocked(
      endpointAvailabilityService.isEndpointSupportedLocally,
    ).mockResolvedValue(true);
    vi.mocked(
      endpointAvailabilityService.isEndpointSupportedOnSaaS,
    ).mockClear();
  });
  test.each(["saas", "selfhosted", "local"] as const)(
    "processes supported tools locally in %s mode",
    async (mode) => {
      vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue(mode);
      await expect(
        operationRouter.getBaseUrl("/api/v1/misc/compress-pdf"),
      ).resolves.toBe("http://localhost:62994");
      expect(
        endpointAvailabilityService.isEndpointSupportedOnSaaS,
      ).not.toHaveBeenCalled();
    },
  );
  test("does not fall back to SaaS when a tool is missing locally", async () => {
    vi.mocked(
      endpointAvailabilityService.isEndpointSupportedLocally,
    ).mockResolvedValue(false);
    await expect(
      operationRouter.getBaseUrl("/api/v1/misc/ocr-pdf"),
    ).rejects.toThrow("stay on this device");
    expect(
      endpointAvailabilityService.isEndpointSupportedOnSaaS,
    ).not.toHaveBeenCalled();
    await expect(
      operationRouter.willRouteToSaaS("/api/v1/misc/ocr-pdf"),
    ).resolves.toBe(false);
    await expect(
      operationRouter.shouldSkipBackendReadyCheck("/api/v1/misc/ocr-pdf"),
    ).resolves.toBe(false);
  });
  test("blocks raw AI/automation destinations while allowing billing", async () => {
    await expect(operationRouter.getConnectedServerBaseUrl()).rejects.toThrow(
      "stay on this device",
    );
    await expect(
      operationRouter.getBaseUrl("/api/v1/storage/files"),
    ).rejects.toThrow("stay on this device");
    await expect(
      operationRouter.getBaseUrl("/api/v1/payg/wallet"),
    ).resolves.toBe(SAAS_URL);
  });
});

describe("operationRouter.getBaseUrl — SaaS mode cloud-only routing", () => {
  test.each([
    "/api/v1/payg/wallet",
    "/api/v1/payg/cap",
    "/api/v1/payg/dev/mark-subscribed",
    "/api/v1/team/my",
    "/api/v1/policies",
    "/api/v1/policies/run",
    "/api/v1/automation/meter",
    // Both live in app/proprietary, which the bundled desktop backend is built without,
    // so routing them local-first left them 404ing on desktop even when signed in.
    "/api/v1/processing-folders",
    "/api/v1/processing-folders/downloads-suggestion",
    "/api/v1/storage/files/result/download",
    "/api/v1/notifications",
    "/api/v1/notifications?limit=20",
    "/api/v1/proprietary/ui-data/admin-settings",
    "/api/v1/proprietary/ui-data/teams",
    "/api/v1/user/admin/saveUser",
    "/api/v1/admin/access/grants",
  ])("%s routes to the SaaS backend (not local)", async (endpoint) => {
    await expect(operationRouter.getBaseUrl(endpoint)).resolves.toBe(SAAS_URL);
  });

  test("willRouteToSaaS is true for cloud-only endpoints", async () => {
    await expect(
      operationRouter.willRouteToSaaS("/api/v1/payg/wallet"),
    ).resolves.toBe(true);
  });
});
