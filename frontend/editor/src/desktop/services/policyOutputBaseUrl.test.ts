import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mode: null as "saas" | "selfhosted" | "local" | null,
}));

// NB: vi.mock factories are hoisted above top-level consts, so they must use
// literals to avoid a TDZ ReferenceError.
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: { getCachedMode: () => mocks.mode },
}));
vi.mock("@app/constants/connection", () => ({
  STIRLING_SAAS_BACKEND_API_URL: "https://api.saas.test/",
}));

import { getPolicyOutputBaseUrl } from "@app/services/policyOutputBaseUrl";

describe("getPolicyOutputBaseUrl", () => {
  beforeEach(() => {
    mocks.mode = null;
  });

  test("SaaS run in SaaS mode resolves the cloud base", () => {
    mocks.mode = "saas";
    expect(getPolicyOutputBaseUrl("saas")).toBe("https://api.saas.test");
  });

  test("self-hosted yields a relative base so the router reaches the connected server", () => {
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
