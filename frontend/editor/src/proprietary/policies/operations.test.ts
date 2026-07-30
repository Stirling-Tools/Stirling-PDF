import { describe, expect, test } from "vitest";
import {
  POLICY_OPERATIONS,
  policyEndpoint,
  policyStep,
  policyStepFromWire,
  policyStepToWire,
  policyToolIdForEndpoint,
  type PolicyToolId,
} from "@app/policies/operations";

const ALL_TOOL_IDS = Object.keys(POLICY_OPERATIONS) as PolicyToolId[];

describe("POLICY_OPERATIONS", () => {
  test("every category operation is a typed descriptor with a known endpoint", () => {
    // The catalogue uses these across all categories; each must be wired.
    expect(ALL_TOOL_IDS.sort()).toEqual([
      "classify",
      "compress",
      "externalApiCall",
      "flatten",
      "ocr",
      "purviewApplyLabel",
      "purviewReadLabel",
      "redact",
      "sanitize",
      "timestampPdf",
      "watermark",
    ]);
    for (const id of ALL_TOOL_IDS) {
      expect(POLICY_OPERATIONS[id].endpoint).toBe(policyEndpoint(id));
      expect(typeof POLICY_OPERATIONS[id].toApi).toBe("function");
      expect(typeof POLICY_OPERATIONS[id].fromApi).toBe("function");
    }
  });

  test("policyEndpoint returns the pinned endpoint literal", () => {
    expect(policyEndpoint("redact")).toBe("/api/v1/security/auto-redact");
    expect(policyEndpoint("sanitize")).toBe("/api/v1/security/sanitize-pdf");
    expect(policyEndpoint("watermark")).toBe("/api/v1/security/add-watermark");
    expect(policyEndpoint("ocr")).toBe("/api/v1/misc/ocr-pdf");
    expect(policyEndpoint("flatten")).toBe("/api/v1/misc/flatten");
    expect(policyEndpoint("compress")).toBe("/api/v1/misc/compress-pdf");
  });

  test("policyToolIdForEndpoint maps endpoints back, and rejects non-policy ones", () => {
    for (const id of ALL_TOOL_IDS) {
      expect(policyToolIdForEndpoint(policyEndpoint(id))).toBe(id);
    }
    expect(policyToolIdForEndpoint("/api/v1/misc/repair")).toBeNull();
    expect(policyToolIdForEndpoint("not-an-endpoint")).toBeNull();
  });
});

describe("policyStep", () => {
  test("merges partial params over the tool's defaults", () => {
    const step = policyStep("redact", {
      useRegex: true,
      wordsToRedact: ["ssn", "card"],
    });
    expect(step.toolId).toBe("redact");
    // Overrides applied...
    expect(step.params.useRegex).toBe(true);
    expect(step.params.wordsToRedact).toEqual(["ssn", "card"]);
    // ...and untouched fields fall back to the tool's defaults.
    expect(step.params.mode).toBe("automatic");
    expect(step.params.redactColor).toBe("#000000");
  });
});

describe("wire conversion", () => {
  test("redact maps frontend params to the backend request model (wordsToRedact -> listOfText)", () => {
    const wire = policyStepToWire(
      policyStep("redact", {
        useRegex: true,
        convertPDFToImage: true,
        wordsToRedact: ["ssn", "card"],
      }),
    );
    expect(wire.operation).toBe("/api/v1/security/auto-redact");
    // The backend field the endpoint actually reads, and no frontend-only `mode`/`wordsToRedact`.
    expect(wire.parameters).toMatchObject({
      listOfText: "ssn\ncard",
      useRegex: true,
      convertPDFToImage: true,
    });
    expect(wire.parameters).not.toHaveProperty("wordsToRedact");
    expect(wire.parameters).not.toHaveProperty("mode");
  });

  test("every policy operation round-trips through wire and back", () => {
    for (const id of ALL_TOOL_IDS) {
      const step = policyStep(id);
      const back = policyStepFromWire(policyStepToWire(step));
      expect(back?.toolId).toBe(id);
    }
  });

  test("redact round-trip preserves the configured patterns", () => {
    const step = policyStep("redact", {
      useRegex: true,
      wordsToRedact: ["ssn", "card"],
    });
    const back = policyStepFromWire(policyStepToWire(step));
    expect(back?.toolId).toBe("redact");
    if (back?.toolId === "redact") {
      expect(back.params.wordsToRedact).toEqual(["ssn", "card"]);
      expect(back.params.useRegex).toBe(true);
    }
  });

  test("a non-policy endpoint decodes to null", () => {
    expect(
      policyStepFromWire({ operation: "/api/v1/misc/repair", parameters: {} }),
    ).toBeNull();
  });
});
