import { describe, it, expect } from "vitest";
import { buildPipelineDefinition } from "@app/services/policyPipeline";
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
