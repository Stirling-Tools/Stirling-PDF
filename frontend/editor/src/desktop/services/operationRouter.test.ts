import { describe, expect, test, vi } from "vitest";

// Verifies operationRouter.getBaseUrl host selection in SaaS mode: cloud-only
// feature endpoints (payg/team/policies) must hit the SaaS backend, NOT the local
// bundled backend (which doesn't serve them — regression that returned 500 for
// /api/v1/payg/wallet). A plain non-cloud, non-tool endpoint still defaults local.

const SAAS_URL = "https://api.saas.test";

// NB: vi.mock factories are hoisted above top-level consts, so they must use
// literals (not SAAS_URL/LOCAL_URL) to avoid a TDZ ReferenceError.
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
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
  selfHostedServerMonitor: { getSnapshot: () => ({ status: "online" }) },
}));
vi.mock("@app/i18n", () => ({
  default: { t: (_k: string, fallback: string) => fallback || _k },
}));

import { operationRouter } from "@app/services/operationRouter";

describe("operationRouter.getBaseUrl — SaaS mode cloud-only routing", () => {
  test.each([
    "/api/v1/payg/wallet",
    "/api/v1/payg/cap",
    "/api/v1/payg/dev/mark-subscribed",
    "/api/v1/team/my",
    "/api/v1/policies",
    "/api/v1/policies/run",
  ])("%s routes to the SaaS backend (not local)", async (endpoint) => {
    await expect(operationRouter.getBaseUrl(endpoint)).resolves.toBe(SAAS_URL);
  });

  test("willRouteToSaaS is true for cloud-only endpoints", async () => {
    await expect(
      operationRouter.willRouteToSaaS("/api/v1/payg/wallet"),
    ).resolves.toBe(true);
  });
});
