import { describe, it, expect } from "vitest";
import {
  fromBackendPolicy,
  type BackendPolicy,
} from "@app/services/policyPipeline";

const backendPolicy: BackendPolicy = {
  id: "p1",
  name: "Security",
  owner: "",
  enabled: true,
  trigger: null,
  steps: [{ operation: "/api/v1/misc/compress-pdf", parameters: {} }],
  output: {
    type: "inline",
    options: {
      mode: "new_version",
      name: "secured",
      position: "suffix",
      maxRetries: 2,
      retryDelayMinutes: 10,
      automation: {
        id: "auto-1",
        name: "Security",
        operations: [{ operation: "compress", parameters: {} }],
        createdAt: "",
        updatedAt: "",
      },
      categoryId: "security",
      sources: [],
      scopeTypes: ["Contracts"],
      reviewerEmail: "me@x.com",
      fieldValues: { minConfidence: "80%" },
    },
  },
  editor: { allowed: true, runOn: "export" },
};

describe("fromBackendPolicy", () => {
  it("decodes a stored policy's output.options bag into frontend settings", () => {
    const decoded = fromBackendPolicy(backendPolicy);
    expect(decoded.id).toBe("p1");
    expect(decoded.policyKey).toBe("security");
    expect(decoded.enabled).toBe(true);
    expect(decoded.sources).toEqual([]);
    expect(decoded.runsOnEditor).toBe(true);
    expect(decoded.scopeTypes).toEqual(["Contracts"]);
    expect(decoded.reviewerEmail).toBe("me@x.com");
    expect(decoded.fieldValues).toEqual({ minConfidence: "80%" });
    expect(decoded.folder).toEqual({
      runOn: "export",
      outputMode: "new_version",
      outputName: "secured",
      outputNamePosition: "suffix",
      maxRetries: 2,
      retryDelayMinutes: 10,
    });
    expect(decoded.automation?.operations).toEqual([
      { operation: "compress", parameters: {} },
    ]);
  });
});
