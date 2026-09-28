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

import { getAiBaseUrl } from "@app/services/aiBaseUrl";

describe("getAiBaseUrl", () => {
  beforeEach(() => {
    mocks.mode = null;
    mocks.serverConfig = null;
    mocks.authenticated = true;
  });

  test("SaaS mode resolves the cloud base, trailing slash stripped", async () => {
    mocks.mode = "saas";
    await expect(getAiBaseUrl()).resolves.toBe("https://api.saas.test");
  });

  test("self-hosted resolves the connected server, not the cloud", async () => {
    mocks.mode = "selfhosted";
    mocks.serverConfig = { url: "https://pdf.example.internal/" };
    await expect(getAiBaseUrl()).resolves.toBe("https://pdf.example.internal");
  });

  test("self-hosted stays absolute so the raw orchestrate fetch cannot resolve against the webview origin", async () => {
    mocks.mode = "selfhosted";
    mocks.serverConfig = { url: "https://pdf.example.internal" };
    await expect(getAiBaseUrl()).resolves.toMatch(/^https:\/\//);
  });

  test("self-hosted with no server recorded rejects the request", async () => {
    mocks.mode = "selfhosted";
    await expect(getAiBaseUrl()).rejects.toThrow();
  });

  test("local mode has no engine to reach", async () => {
    mocks.mode = "local";
    await expect(getAiBaseUrl()).rejects.toThrow();
  });

  test("unresolved mode fails closed rather than guessing the cloud", async () => {
    await expect(getAiBaseUrl()).rejects.toThrow();
  });

  test("rejects a configured server without authentication", async () => {
    mocks.mode = "saas";
    mocks.authenticated = false;
    await expect(getAiBaseUrl()).rejects.toThrow("Sign in");
  });
});
