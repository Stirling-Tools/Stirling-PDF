// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Verifies operationRouter.getBaseUrl host selection in SaaS mode: cloud-only
// feature endpoints (payg/team/policies) must hit the SaaS backend, NOT the local
// bundled backend (which doesn't serve them — regression that returned 500 for
// /api/v1/payg/wallet). A plain non-cloud, non-tool endpoint still defaults local.

const SAAS_URL = "https://api.saas.test";

vi.mock("@editor/services/authService", () => ({
  authService: {
    isAuthenticated: vi.fn().mockResolvedValue(true),
    awaitRefreshIfInProgress: vi.fn().mockResolvedValue(undefined),
  },
}));

// NB: vi.mock factories are hoisted above top-level consts, so they must use
// literals (not SAAS_URL/LOCAL_URL) to avoid a TDZ ReferenceError.
vi.mock("@editor/services/connectionModeService", () => ({
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
vi.mock("@editor/constants/connection", () => ({
  STIRLING_SAAS_BACKEND_API_URL: "https://api.saas.test",
}));
vi.mock("@editor/services/tauriBackendService", () => ({
  tauriBackendService: {
    isOnline: true,
    getBackendUrl: () => "http://localhost:62994",
  },
}));
vi.mock("@editor/services/endpointAvailabilityService", () => ({
  endpointAvailabilityService: {
    isEndpointSupportedLocally: vi.fn().mockResolvedValue(true),
  },
}));
vi.mock("@editor/services/selfHostedServerMonitor", () => ({
  selfHostedServerMonitor: { getSnapshot: vi.fn(() => ({ status: "online" })) },
}));
vi.mock("@editor/i18n", () => ({
  default: { t: (_k: string, fallback: string) => fallback || _k },
}));

import { operationRouter } from "@editor/services/operationRouter";
import { connectionModeService } from "@editor/services/connectionModeService";
import { authService } from "@editor/services/authService";
import { selfHostedServerMonitor } from "@editor/services/selfHostedServerMonitor";
import { endpointAvailabilityService } from "@editor/services/endpointAvailabilityService";

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
  });
  test.each(["saas", "selfhosted", "local"] as const)(
    "processes supported tools locally in %s mode",
    async (mode) => {
      vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue(mode);
      await expect(
        operationRouter.getBaseUrl("/api/v1/misc/compress-pdf"),
      ).resolves.toBe("http://localhost:62994");
    },
  );
  test("does not fall back to SaaS when a tool is missing locally", async () => {
    vi.mocked(
      endpointAvailabilityService.isEndpointSupportedLocally,
    ).mockResolvedValue(false);
    await expect(
      operationRouter.getBaseUrl("/api/v1/misc/ocr-pdf"),
    ).rejects.toThrow("stay on this device");
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

describe("operationRouter — URL shared by two endpoint keys", () => {
  const url = "/api/v1/convert/pdf/text";

  test("routes by the caller's endpoint key, not the first key for the URL", async () => {
    const supportedLocally = vi.mocked(
      endpointAvailabilityService.isEndpointSupportedLocally,
    );
    supportedLocally.mockImplementation(async (name) => name !== "pdf-to-rtf");
    try {
      await expect(operationRouter.getBaseUrl(url)).resolves.toBe(
        "http://localhost:62994",
      );
      await expect(operationRouter.getBaseUrl(url, "pdf-to-rtf")).resolves.toBe(
        SAAS_URL,
      );
      await expect(
        operationRouter.shouldSkipBackendReadyCheck(url, "pdf-to-rtf"),
      ).resolves.toBe(true);
      await expect(
        operationRouter.shouldSkipBackendReadyCheck(url),
      ).resolves.toBe(false);
    } finally {
      supportedLocally.mockResolvedValue(true);
    }
  });
});

describe("operationRouter — Office Convert needs an account", () => {
  const dispatchEvent = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("window", { dispatchEvent });
    dispatchEvent.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test.each([
    ["/api/v1/convert/file/pdf", undefined],
    ["/api/v1/convert/pdf/word", undefined],
    ["/api/v1/convert/pdf/text", "pdf-to-rtf"],
    ["/api/v1/misc/extract-image-scans", undefined],
  ])("refuses %s (%s) in local mode and opens sign-in", async (url, key) => {
    vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue("local");
    await expect(operationRouter.getBaseUrl(url, key)).rejects.toThrow(
      /requires an account/,
    );
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });

  test("still runs free conversions locally in local mode", async () => {
    vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue("local");
    await expect(
      operationRouter.getBaseUrl("/api/v1/convert/pdf/img"),
    ).resolves.toBe("http://localhost:62994");
    for (const path of [
      "/api/v1/convert/pdf/csv",
      "/api/v1/convert/pdf/text",
      "/api/v1/convert/pdf/xlsx",
      "/api/v1/convert/pdf/markdown",
    ]) {
      await expect(operationRouter.getBaseUrl(path)).resolves.toBe(
        "http://localhost:62994",
      );
    }
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  test("badges Office Convert tools as needing sign-in only in local mode", async () => {
    vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue("local");
    await expect(
      operationRouter.willRouteToSaaS("/api/v1/misc/extract-image-scans"),
    ).resolves.toBe(true);
    await expect(
      operationRouter.willRouteToSaaS("/api/v1/misc/compress-pdf"),
    ).resolves.toBe(false);
    vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue("saas");
    await expect(
      operationRouter.willRouteToSaaS("/api/v1/misc/extract-image-scans"),
    ).resolves.toBe(false);
  });

  test("runs Office Convert on the bundled backend once signed in", async () => {
    await expect(
      operationRouter.getBaseUrl("/api/v1/convert/file/pdf"),
    ).resolves.toBe("http://localhost:62994");
  });
});

describe("operationRouter — server signing never falls back", () => {
  const certSign = "/api/v1/security/cert-sign";

  beforeEach(() => {
    vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue(
      "selfhosted",
    );
    vi.mocked(connectionModeService.getServerConfig).mockResolvedValue({
      url: "https://selfhosted.test/",
    });
  });

  afterEach(() => {
    vi.mocked(selfHostedServerMonitor.getSnapshot).mockReturnValue({
      status: "online",
      isOnline: true,
      serverUrl: "https://selfhosted.test",
    });
  });

  test("fails instead of using the bundled backend when the server is offline", async () => {
    vi.mocked(selfHostedServerMonitor.getSnapshot).mockReturnValue({
      status: "offline",
      isOnline: false,
      serverUrl: "https://selfhosted.test",
    });
    await expect(operationRouter.getBaseUrl(certSign)).resolves.toBe(
      "http://localhost:62994",
    );
    await expect(
      operationRouter.getServerOnlyBaseUrl(certSign),
    ).rejects.toThrow("Your Stirling-PDF server is offline");
  });

  test("uses the server while it is online", async () => {
    vi.mocked(selfHostedServerMonitor.getSnapshot).mockReturnValue({
      status: "online",
      isOnline: true,
      serverUrl: "https://selfhosted.test",
    });
    await expect(operationRouter.getServerOnlyBaseUrl(certSign)).resolves.toBe(
      "https://selfhosted.test",
    );
  });

  test("uses the bundled backend's own certificate in local mode", async () => {
    vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue("local");
    await expect(operationRouter.getServerOnlyBaseUrl(certSign)).resolves.toBe(
      "http://localhost:62994",
    );
  });
});
