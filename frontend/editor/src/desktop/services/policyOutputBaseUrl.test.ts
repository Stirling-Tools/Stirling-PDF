import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mode: null as "saas" | "selfhosted" | "local" | null,
  serverConfig: null as { url: string } | null,
}));

// NB: vi.mock factories are hoisted above top-level consts, so they must use
// literals to avoid a TDZ ReferenceError.
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCachedMode: () => mocks.mode,
    getCachedServerConfig: () => mocks.serverConfig,
  },
}));
vi.mock("@app/constants/connection", () => ({
  STIRLING_SAAS_BACKEND_API_URL: "https://api.saas.test/",
}));

import { getPolicyOutputBaseUrl } from "@app/services/policyOutputBaseUrl";

describe("getPolicyOutputBaseUrl", () => {
  beforeEach(() => {
    mocks.mode = null;
    mocks.serverConfig = null;
  });

  test("SaaS run in SaaS mode resolves the cloud base", () => {
    mocks.mode = "saas";
    expect(getPolicyOutputBaseUrl("saas")).toBe("https://api.saas.test");
  });

  test("self-hosted names its own server", () => {
    mocks.mode = "selfhosted";
    mocks.serverConfig = { url: "https://pdf.example.internal/" };
    expect(getPolicyOutputBaseUrl("saas")).toBe("https://pdf.example.internal");
  });

  test("self-hosted stays absolute so an offline blip cannot divert the download to the bundled backend", () => {
    // Outputs come from a tool endpoint, which the router diverts to the bundled backend
    // while the server is unreachable.
    mocks.mode = "selfhosted";
    mocks.serverConfig = { url: "https://pdf.example.internal" };
    expect(getPolicyOutputBaseUrl("saas").startsWith("https://")).toBe(true);
  });

  test("self-hosted with no server recorded yields no base", () => {
    mocks.mode = "selfhosted";
    expect(getPolicyOutputBaseUrl("saas")).toBe("");
  });

  test("local mode never resolves the cloud base", () => {
    mocks.mode = "local";
    expect(getPolicyOutputBaseUrl("saas")).toBe("");
  });

  test("unresolved mode fails closed", () => {
    expect(getPolicyOutputBaseUrl("saas")).toBe("");
  });

  test("a browser-computed run is always relative", () => {
    mocks.mode = "saas";
    expect(getPolicyOutputBaseUrl("local")).toBe("");
  });
});
