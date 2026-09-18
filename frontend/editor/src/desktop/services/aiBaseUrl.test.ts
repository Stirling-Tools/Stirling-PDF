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

import { getAiBaseUrl } from "@app/services/aiBaseUrl";

describe("getAiBaseUrl", () => {
  beforeEach(() => {
    mocks.mode = null;
    mocks.serverConfig = null;
  });

  test("SaaS mode resolves the cloud base, trailing slash stripped", () => {
    mocks.mode = "saas";
    expect(getAiBaseUrl()).toBe("https://api.saas.test");
  });

  test("self-hosted resolves the connected server, not the cloud", () => {
    mocks.mode = "selfhosted";
    mocks.serverConfig = { url: "https://pdf.example.internal/" };
    expect(getAiBaseUrl()).toBe("https://pdf.example.internal");
  });

  test("self-hosted stays absolute so the raw orchestrate fetch cannot resolve against the webview origin", () => {
    mocks.mode = "selfhosted";
    mocks.serverConfig = { url: "https://pdf.example.internal" };
    expect(getAiBaseUrl().startsWith("https://")).toBe(true);
  });

  test("self-hosted with no server recorded yields no base", () => {
    mocks.mode = "selfhosted";
    expect(getAiBaseUrl()).toBe("");
  });

  test("local mode has no engine to reach", () => {
    mocks.mode = "local";
    expect(getAiBaseUrl()).toBe("");
  });

  test("unresolved mode fails closed rather than guessing the cloud", () => {
    expect(getAiBaseUrl()).toBe("");
  });
});
