import { describe, it, expect } from "vitest";
import { toWirePolicy, fromWirePolicy } from "@app/policies/codec";
import type { PolicyDecodedState, WirePolicy } from "@app/policies/types";
// oxlint-disable-next-line no-restricted-imports -- shared cross-language fixture; no alias covers app/
import wireFixture from "../../../../../app/proprietary/src/test/resources/policy/portal-wire-policy.json";

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
  trigger: null,
  outputIds: [],
};

describe("toWirePolicy", () => {
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

  it("binds real sources as inputs, excluding the virtual editor", () => {
    const wire = toWirePolicy(FULL_STATE);
    expect(wire.inputs).toEqual([{ sourceId: "gdrive", trigger: null }]);
  });

  it("pairs the trigger with the bound source", () => {
    const wire = toWirePolicy({
      ...FULL_STATE,
      trigger: { type: "folder-watch", options: {} },
      outputIds: ["src-out"],
    });
    expect(wire.inputs).toEqual([
      { sourceId: "gdrive", trigger: { type: "folder-watch", options: {} } },
    ]);
    expect(wire.outputIds).toEqual(["src-out"]);
  });

  it("emits no inputs for an editor-only policy", () => {
    const wire = toWirePolicy({ ...FULL_STATE, sources: ["editor"] });
    expect(wire.inputs).toEqual([]);
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

  it("defaults a missing runOn to the category default (security → export)", () => {
    const wire = toWirePolicy(FULL_STATE);
    delete (wire.output.options as Record<string, unknown>).runOn;
    expect(fromWirePolicy(wire).runOn).toBe("export");
  });

  it("defaults a missing runOn to upload for other categories", () => {
    const wire = toWirePolicy({ ...FULL_STATE, categoryId: "classification" });
    delete (wire.output.options as Record<string, unknown>).runOn;
    expect(fromWirePolicy(wire).runOn).toBe("upload");
  });

  it("keeps an explicitly saved upload on a security policy", () => {
    const wire = toWirePolicy(FULL_STATE);
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
      inputs: [],
      steps: [],
      output: { type: "inline", options: {} },
    });
    expect(decoded.categoryId).toBe("");
    expect(decoded.sources).toEqual([]);
    expect(decoded.runOn).toBe("upload");
    expect(decoded.outputMode).toBe("new_version");
    expect(decoded.trigger).toBeNull();
  });

  it("defaults fieldValues to empty object when missing", () => {
    const wire = toWirePolicy(FULL_STATE);
    delete (wire.output.options as Record<string, unknown>).fieldValues;
    expect(fromWirePolicy(wire).fieldValues).toEqual({});
  });

  it("merges bound inputs into sources for policies saved before inputs", () => {
    const wire = toWirePolicy(FULL_STATE);
    // Simulate a record whose metadata predates the source: only inputs has it.
    (wire.output.options as Record<string, unknown>).sources = ["editor"];
    wire.inputs = [{ sourceId: "gdrive", trigger: null }];
    expect(fromWirePolicy(wire).sources).toEqual(["editor", "gdrive"]);
  });

  it("round-trips trigger and outputIds", () => {
    const wire = toWirePolicy({
      ...FULL_STATE,
      trigger: { type: "webhook", options: {} },
      outputIds: ["dest-1"],
    });
    const decoded = fromWirePolicy(wire);
    expect(decoded.trigger).toEqual({ type: "webhook", options: {} });
    expect(decoded.outputIds).toEqual(["dest-1"]);
  });
});

// The backend `Policy` record ignores unknown JSON properties, so a wire shape it
// cannot bind saves a policy with no source and no trigger instead of failing.
// PortalWirePolicyContractTest.java pins the same file from the Java side; keep
// the two in step by regenerating the fixture whenever this codec changes.
const WIRE_FIXTURE = wireFixture as unknown as WirePolicy;

const ROUTED_STATE: PolicyDecodedState = {
  id: "pol_routing",
  name: "Routing Policy",
  enabled: true,
  categoryId: "routing",
  sources: ["editor", "src-dropbox"],
  scopeTypes: [],
  reviewerEmail: "",
  fieldValues: {},
  runOn: "upload",
  outputMode: "new_version",
  outputName: "",
  outputNamePosition: "suffix",
  maxRetries: 3,
  retryDelayMinutes: 5,
  steps: [
    {
      operation: "/api/v1/misc/compress-pdf",
      parameters: { optimizeLevel: 5 },
    },
  ],
  trigger: {
    type: "schedule",
    options: { schedule: { type: "every", count: 1, unit: "HOURS" } },
  },
  outputIds: ["src-archive"],
};

describe("backend wire contract", () => {
  it("emits exactly the body the backend Policy record binds", () => {
    expect(toWirePolicy(ROUTED_STATE)).toEqual(WIRE_FIXTURE);
  });

  it("decodes that same body back to the policy state", () => {
    expect(fromWirePolicy(WIRE_FIXTURE)).toEqual(ROUTED_STATE);
  });

  it("survives the JSON transport the POST body goes through", () => {
    const posted = JSON.parse(
      JSON.stringify(toWirePolicy(ROUTED_STATE)),
    ) as WirePolicy;
    expect(fromWirePolicy(posted)).toEqual(ROUTED_STATE);
  });
});
