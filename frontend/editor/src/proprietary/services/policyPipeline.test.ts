import { describe, it, expect } from "vitest";
import {
  buildPipelineDefinition,
  buildBackendPolicy,
  fromBackendPolicy,
} from "@app/services/policyPipeline";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";

// Minimal registry: a static-endpoint tool and a function-endpoint tool.
const registry = {
  compress: { operationConfig: { endpoint: "/api/v1/misc/compress-pdf" } },
  rotate: {
    operationConfig: {
      endpoint: (p: Record<string, unknown>) =>
        `/api/v1/general/rotate-pdf?angle=${p.angle}`,
    },
  },
} as unknown as Partial<ToolRegistry>;

describe("buildPipelineDefinition", () => {
  it("maps frontend operations to backend endpoint steps", () => {
    const { definition, unresolved } = buildPipelineDefinition(
      {
        name: "Secure Ingestion",
        operations: [
          { operation: "compress", parameters: {} },
          { operation: "rotate", parameters: { angle: 90 } },
        ],
      },
      registry,
    );

    expect(unresolved).toEqual([]);
    expect(definition.name).toBe("Secure Ingestion");
    expect(definition.output).toEqual({ type: "inline", options: {} });
    expect(definition.steps).toEqual([
      { operation: "/api/v1/misc/compress-pdf", parameters: {} },
      {
        operation: "/api/v1/general/rotate-pdf?angle=90",
        parameters: { angle: 90 },
      },
    ]);
  });

  it("drops + reports operations with no resolvable endpoint", () => {
    const { definition, unresolved } = buildPipelineDefinition(
      {
        name: "X",
        operations: [
          { operation: "compress", parameters: {} },
          { operation: "notARealTool", parameters: {} },
        ],
      },
      registry,
    );
    expect(unresolved).toEqual(["notARealTool"]);
    expect(definition.steps).toHaveLength(1);
  });
});

const samplePolicy = {
  categoryId: "security",
  name: "Security",
  enabled: true,
  automation: {
    id: "auto-1",
    name: "Security",
    operations: [{ operation: "compress", parameters: {} }],
    createdAt: "",
    updatedAt: "",
  },
  pipelineSteps: [
    { operation: "/api/v1/misc/compress-pdf", parameters: {} },
  ],
  sources: ["editor"],
  scopeTypes: ["Contracts"],
  reviewerEmail: "me@x.com",
  fieldValues: { minConfidence: "80%" },
  folder: {
    outputMode: "new_version" as const,
    outputName: "secured",
    outputNamePosition: "suffix" as const,
    maxRetries: 2,
    retryDelayMinutes: 10,
  },
};

describe("buildBackendPolicy", () => {
  it("maps a frontend policy to the backend Policy shape", () => {
    const policy = buildBackendPolicy(samplePolicy);
    expect(policy.id).toBe(""); // blank → backend assigns
    expect(policy.name).toBe("Security");
    expect(policy.enabled).toBe(true);
    expect(policy.steps).toEqual([
      { operation: "/api/v1/misc/compress-pdf", parameters: {} },
    ]);
    // Extras ride in options.
    expect(policy.trigger.options.categoryId).toBe("security");
    expect(policy.trigger.options.reviewerEmail).toBe("me@x.com");
    expect(policy.output.options.maxRetries).toBe(2);
  });

  it("round-trips losslessly through fromBackendPolicy", () => {
    const policy = buildBackendPolicy(samplePolicy);
    const decoded = fromBackendPolicy({ ...policy, id: "p1" });
    expect(decoded.id).toBe("p1");
    expect(decoded.categoryId).toBe("security");
    expect(decoded.enabled).toBe(true);
    expect(decoded.sources).toEqual(["editor"]);
    expect(decoded.scopeTypes).toEqual(["Contracts"]);
    expect(decoded.reviewerEmail).toBe("me@x.com");
    expect(decoded.fieldValues).toEqual({ minConfidence: "80%" });
    expect(decoded.folder).toEqual(samplePolicy.folder);
    expect(decoded.automation?.operations).toEqual(
      samplePolicy.automation.operations,
    );
  });
});
