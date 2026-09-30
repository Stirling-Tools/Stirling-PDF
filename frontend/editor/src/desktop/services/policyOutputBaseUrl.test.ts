import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mode: null as "saas" | "selfhosted" | "local" | null,
  serverConfig: null as { url: string } | null,
  authenticated: true,
}));

vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentMode: async () => mocks.mode,
    getServerConfig: async () => mocks.serverConfig,
  },
}));
vi.mock("@app/services/authService", () => ({
  authService: {
    isAuthenticated: async () => mocks.authenticated,
    awaitRefreshIfInProgress: async () => {},
  },
}));
vi.mock("@app/services/tauriBackendService", () => ({
  tauriBackendService: {},
}));
vi.mock("@app/services/endpointAvailabilityService", () => ({
  endpointAvailabilityService: {},
}));
vi.mock("@app/services/selfHostedServerMonitor", () => ({
  selfHostedServerMonitor: {},
}));
vi.mock("@app/i18n", () => ({
  default: { t: (_key: string, fallback: string) => fallback },
}));
vi.mock("@app/constants/connection", () => ({
  STIRLING_SAAS_BACKEND_API_URL: "https://api.saas.test/",
}));

import { getPolicyOutputBaseUrl } from "@app/services/policyOutputBaseUrl";

describe("getPolicyOutputBaseUrl", () => {
  beforeEach(() => {
    mocks.mode = null;
    mocks.serverConfig = null;
    mocks.authenticated = true;
  });

  test("SaaS run in SaaS mode resolves the cloud base", async () => {
    mocks.mode = "saas";
    await expect(getPolicyOutputBaseUrl("saas")).resolves.toBe(
      "https://api.saas.test",
    );
  });

  test("self-hosted names its own server", async () => {
    mocks.mode = "selfhosted";
    mocks.serverConfig = { url: "https://pdf.example.internal/" };
    await expect(getPolicyOutputBaseUrl("saas")).resolves.toBe(
      "https://pdf.example.internal",
    );
  });

  test("self-hosted stays absolute so an offline blip cannot divert the download to the bundled backend", async () => {
    // Outputs come from a tool endpoint, which the router diverts to the bundled backend
    // while the server is unreachable.
    mocks.mode = "selfhosted";
    mocks.serverConfig = { url: "https://pdf.example.internal" };
    await expect(getPolicyOutputBaseUrl("saas")).resolves.toMatch(
      /^https:\/\//,
    );
  });

  test("self-hosted with no server recorded rejects the request", async () => {
    mocks.mode = "selfhosted";
    await expect(getPolicyOutputBaseUrl("saas")).rejects.toThrow();
  });

  test("local mode never resolves the cloud base", async () => {
    mocks.mode = "local";
    await expect(getPolicyOutputBaseUrl("saas")).rejects.toThrow();
  });

  test("unresolved mode fails closed", async () => {
    await expect(getPolicyOutputBaseUrl("saas")).rejects.toThrow();
  });

  test("desktop pipeline outputs stay on the server regardless of the target label", async () => {
    mocks.mode = "saas";
    await expect(getPolicyOutputBaseUrl("local")).resolves.toBe(
      "https://api.saas.test",
    );
  });

  test("rejects a configured server without authentication", async () => {
    mocks.mode = "saas";
    mocks.authenticated = false;
    await expect(getPolicyOutputBaseUrl("saas")).rejects.toThrow("Sign in");
  });
});
