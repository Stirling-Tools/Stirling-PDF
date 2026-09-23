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

beforeEach(() => {
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

// Hardware-backed signing reads the certificate store of the machine the user is
// on, so those calls have to reach the bundled backend whatever the app is
// connected to. Answered by a self-hosted server they describe its hardware, or
// are rejected outright — which is what hid "This device" as a signing source
// while connected to a server (#7316).
describe("operationRouter.getBaseUrl — device-local endpoints", () => {
  const LOCAL_URL = "http://localhost:62994";

  // The server-owned automation suite leaves an offline self-hosted server
  // behind, which would send the unmarked signing call to the local fallback.
  beforeEach(() => {
    vi.mocked(connectionModeService.getServerConfig).mockResolvedValue({
      url: SAAS_URL,
    });
    vi.mocked(selfHostedServerMonitor.getSnapshot).mockReturnValue({
      status: "online",
      isOnline: true,
      serverUrl: SAAS_URL,
    });
  });

  test.each(["local", "saas", "selfhosted"] as const)(
    "hardware capabilities stay local in %s mode",
    async (mode) => {
      vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue(mode);

      await expect(
        operationRouter.getBaseUrl(
          "/api/v1/security/cert-sign/hardware/capabilities",
        ),
      ).resolves.toBe(LOCAL_URL);
    },
  );

  test("certificate enumeration stays local in self-hosted mode", async () => {
    vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue(
      "selfhosted",
    );

    await expect(
      operationRouter.getBaseUrl(
        "/api/v1/security/cert-sign/hardware/windows-certificates",
      ),
    ).resolves.toBe(LOCAL_URL);
  });

  test("a request marked device-local stays local even on a shared path", async () => {
    vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue(
      "selfhosted",
    );

    // Signing posts to the same path whichever certificate was chosen, so only
    // the caller's mark can say the key lives on this machine.
    await expect(
      operationRouter.getBaseUrl("/api/v1/security/cert-sign", true),
    ).resolves.toBe(LOCAL_URL);
  });

  test("the same signing path still goes to the server unmarked", async () => {
    vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue(
      "selfhosted",
    );

    // The regression that matters: an uploaded keystore must keep running on the
    // server, or this fix would quietly move everyone's signing onto the desktop.
    await expect(
      operationRouter.getBaseUrl("/api/v1/security/cert-sign"),
    ).resolves.toBe(SAAS_URL);
  });

  test("the app-config still comes from the server in self-hosted mode", async () => {
    vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue(
      "selfhosted",
    );

    // Deliberately left alone, and the reason the desktop re-answers
    // hardwareSigningAvailable for itself rather than routing this call locally:
    // the rest of the config describes the deployment - which tools are on, how
    // login works - and there the server is the authority.
    await expect(
      operationRouter.getBaseUrl("/api/v1/config/app-config"),
    ).resolves.toBe(SAAS_URL);
  });
});
