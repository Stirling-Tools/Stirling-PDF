import { describe, it, expect } from "vitest";
import { toWirePolicy, fromWirePolicy } from "@shared/policies/codec";
import type { PolicyDecodedState } from "@shared/policies/types";

const FULL_STATE: PolicyDecodedState = {
  id: "pol_123",
  name: "Security Policy",
  enabled: true,
  categoryId: "security",
  sources: ["editor", "gdrive"],
  scopeTypes: ["Contracts", "Invoices"],
  reviewerEmail: "admin@example.com",
  fieldValues: { auditTrail: true, frameworks: ["HIPAA"] },
  runOn: "upload",
  outputMode: "new_version",
  outputName: "redacted",
  outputNamePosition: "prefix",
  maxRetries: 3,
  retryDelayMinutes: 5,
  steps: [
    {
      operation: "/api/v1/security/auto-redact",
      parameters: { mode: "automatic" },
    },
  ],
};

describe("toWirePolicy", () => {
  it("sets trigger to null", () => {
    expect(toWirePolicy(FULL_STATE).trigger).toBeNull();
  });

  it("sets output.type to inline", () => {
    expect(toWirePolicy(FULL_STATE).output.type).toBe("inline");
  });

  it("packs metadata into output.options", () => {
    const wire = toWirePolicy(FULL_STATE);
    const opts = wire.output.options;
    expect(opts.categoryId).toBe("security");
    expect(opts.sources).toEqual(["editor", "gdrive"]);
    expect(opts.runOn).toBe("upload");
    expect(opts.mode).toBe("new_version");
    expect(opts.position).toBe("prefix");
  });

  it("preserves steps at the top level", () => {
    const wire = toWirePolicy(FULL_STATE);
    expect(wire.steps).toEqual(FULL_STATE.steps);
  });
});

describe("fromWirePolicy → round-trip", () => {
  it("recovers all fields after encode→decode", () => {
    const wire = toWirePolicy(FULL_STATE);
    const decoded = fromWirePolicy(wire);
    expect(decoded.id).toBe(FULL_STATE.id);
    expect(decoded.categoryId).toBe(FULL_STATE.categoryId);
    expect(decoded.sources).toEqual(FULL_STATE.sources);
    expect(decoded.scopeTypes).toEqual(FULL_STATE.scopeTypes);
    expect(decoded.reviewerEmail).toBe(FULL_STATE.reviewerEmail);
    expect(decoded.fieldValues).toEqual(FULL_STATE.fieldValues);
    expect(decoded.runOn).toBe(FULL_STATE.runOn);
    expect(decoded.outputMode).toBe(FULL_STATE.outputMode);
    expect(decoded.outputName).toBe(FULL_STATE.outputName);
    expect(decoded.outputNamePosition).toBe(FULL_STATE.outputNamePosition);
    expect(decoded.maxRetries).toBe(FULL_STATE.maxRetries);
    expect(decoded.retryDelayMinutes).toBe(FULL_STATE.retryDelayMinutes);
    expect(decoded.steps).toEqual(FULL_STATE.steps);
  });

  it("defaults runOn to upload when missing", () => {
    const wire = toWirePolicy(FULL_STATE);
    delete (wire.output.options as Record<string, unknown>).runOn;
    expect(fromWirePolicy(wire).runOn).toBe("upload");
  });

  it("defaults outputMode to new_version when missing", () => {
    const wire = toWirePolicy(FULL_STATE);
    delete (wire.output.options as Record<string, unknown>).mode;
    expect(fromWirePolicy(wire).outputMode).toBe("new_version");
  });

  it("preserves export runOn", () => {
    const wire = toWirePolicy({ ...FULL_STATE, runOn: "export" });
    expect(fromWirePolicy(wire).runOn).toBe("export");
  });

  it("preserves new_file outputMode", () => {
    const wire = toWirePolicy({ ...FULL_STATE, outputMode: "new_file" });
    expect(fromWirePolicy(wire).outputMode).toBe("new_file");
  });

  it("preserves all three outputNamePosition values", () => {
    for (const pos of ["prefix", "suffix", "auto-number"] as const) {
      const wire = toWirePolicy({ ...FULL_STATE, outputNamePosition: pos });
      expect(fromWirePolicy(wire).outputNamePosition).toBe(pos);
    }
  });

  it("handles empty options gracefully", () => {
    const decoded = fromWirePolicy({
      id: "x",
      name: "X",
      enabled: false,
      trigger: null,
      steps: [],
      output: { type: "inline", options: {} },
    });
    expect(decoded.categoryId).toBe("");
    expect(decoded.sources).toEqual([]);
    expect(decoded.runOn).toBe("upload");
    expect(decoded.outputMode).toBe("new_version");
  });

  it("defaults fieldValues to empty object when missing", () => {
    const wire = toWirePolicy(FULL_STATE);
    delete (wire.output.options as Record<string, unknown>).fieldValues;
    expect(fromWirePolicy(wire).fieldValues).toEqual({});
  });
});
