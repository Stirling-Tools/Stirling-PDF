import { describe, expect, it, vi } from "vitest";
import { policyCreditContext } from "@app/services/policyCreditContext";

vi.mock("@app/services/policyStorage", () => ({
  loadPolicies: () => ({
    rotate: {
      backendId: "rotate-id",
      name: "Quarterly rotation",
      configured: true,
      enabled: true,
      runsOnEditor: true,
      runOn: "upload",
    },
    watermark: {
      backendId: "watermark-id",
      name: "Confidential watermark",
      configured: true,
      enabled: true,
      runsOnEditor: true,
      runOn: "export",
    },
  }),
}));
vi.mock("@app/services/policyCatalog", () => ({
  loadPolicyCatalog: () => ({ categories: [] }),
}));

describe("credit failure pipeline context", () => {
  it("identifies upload and export pipelines by saved name", () => {
    expect(policyCreditContext("rotate-id")).toEqual({
      pipelineId: "rotate-id",
      pipelineName: "Quarterly rotation",

      trigger: "upload",
    });
    expect(policyCreditContext("watermark-id").trigger).toBe("export");
  });
  it("identifies an explicit retry independently of the configured automatic trigger", () => {
    expect(policyCreditContext("rotate-id", "foreground").trigger).toBe(
      "manual",
    );
  });
  it("keeps an uncached pipeline navigable without displaying its internal id as a name", () => {
    expect(policyCreditContext("unknown")).toEqual({
      pipelineId: "unknown",
      pipelineName: undefined,

      trigger: "automatic",
    });
  });
  it("handles failures without a policy identifier", () => {
    expect(policyCreditContext(null).pipelineId).toBeUndefined();
    expect(policyCreditContext(null).trigger).toBe("automatic");
  });
});
