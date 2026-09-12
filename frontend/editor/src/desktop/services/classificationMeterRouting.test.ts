import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mode: null as "saas" | "selfhosted" | "local" | null,
  post: vi.fn(),
}));

// NB: vi.mock factories are hoisted above top-level consts, so they must use
// literals to avoid a TDZ ReferenceError.
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: { getCachedMode: () => mocks.mode },
}));
vi.mock("@app/constants/connection", () => ({
  STIRLING_SAAS_BACKEND_API_URL: "https://api.saas.test",
}));
vi.mock("@app/services/apiClient", () => ({
  default: { post: (...args: unknown[]) => mocks.post(...args) },
}));

import { meterClassificationRun } from "@app/services/classificationMeter";

/**
 * Lives under src/desktop so @app/* resolves through the desktop cascade — the only
 * place the shared meter is seen with the desktop base-URL resolvers behind it.
 */
describe("classification metering — which server gets billed", () => {
  beforeEach(() => {
    mocks.mode = null;
    mocks.post.mockReset().mockResolvedValue({ status: 202 });
  });

  const meterUrl = () => String(mocks.post.mock.calls[0][0]);

  it("bills Stirling Cloud in SaaS mode", () => {
    mocks.mode = "saas";
    meterClassificationRun({ documentCount: 1 });
    expect(meterUrl()).toBe(
      "https://api.saas.test/api/v1/policies/classify/meter",
    );
  });

  it("bills the self-hosted server, never the cloud", () => {
    mocks.mode = "selfhosted";
    meterClassificationRun({ documentCount: 1 });
    // Relative, so the router resolves it to the connected server. An absolute cloud
    // URL here would carry the user's self-hosted token to Stirling Cloud.
    expect(meterUrl()).toBe("/api/v1/policies/classify/meter");
    expect(meterUrl()).not.toContain("saas.test");
  });

  it("does not address the cloud before the mode resolves", () => {
    meterClassificationRun({ documentCount: 1 });
    expect(meterUrl()).not.toContain("saas.test");
  });

  it("carries the document count and labels the server bills on", () => {
    mocks.mode = "selfhosted";
    meterClassificationRun({ documentCount: 3, labels: ["invoice"] });
    expect(mocks.post.mock.calls[0][1]).toMatchObject({
      documentCount: 3,
      labels: ["invoice"],
    });
  });
});
