import { describe, it, expect } from "vitest";
import {
  toWirePolicy,
  fromWirePolicy,
  policyInputs,
  EDITOR_SOURCE_ID,
} from "@app/policies/codec";
import type { PolicyDecodedState } from "@app/policies/types";

const FULL_STATE: PolicyDecodedState = {
  id: "pol_123",
  name: "Security Policy",
  enabled: true,
  categoryId: "security",
  sources: ["editor", "gdrive"],
  inputs: [{ sourceId: "gdrive", trigger: null }],
  runsOnEditor: true,
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
  routingRules: [],
};

describe("toWirePolicy", () => {
  it("emits the bound inputs at the top level", () => {
    expect(toWirePolicy(FULL_STATE).inputs).toEqual([
      { sourceId: "gdrive", trigger: null },
    ]);
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

  it("sends the editor block so a save never drops editor participation", () => {
    expect(toWirePolicy(FULL_STATE).editor).toEqual({
      allowed: true,
      runOn: "upload",
    });
    expect(toWirePolicy({ ...FULL_STATE, runsOnEditor: false }).editor).toEqual(
      { allowed: false, runOn: "upload" },
    );
  });

  it("keeps editor participation that empty sources would have re-derived away", () => {
    // The seeded Classification policy: editor-run, no sources.
    const wire = toWirePolicy({
      ...FULL_STATE,
      sources: [],
      runsOnEditor: true,
    });
    expect(wire.editor?.allowed).toBe(true);
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
    expect(decoded.inputs).toEqual(FULL_STATE.inputs);
    expect(decoded.outputIds).toEqual(FULL_STATE.outputIds);
    expect(decoded.routingRules).toEqual(FULL_STATE.routingRules);
  });

  it("round-trips routing rules", () => {
    const rules = [
      {
        field: "classification.labels",
        operator: "matches-any" as const,
        values: ["invoice", "receipt"],
        outputId: "src-finance",
      },
    ];
    const wire = toWirePolicy({ ...FULL_STATE, routingRules: rules });
    expect(wire.routingRules).toEqual(rules);
    expect(fromWirePolicy(wire).routingRules).toEqual(rules);
  });

  // The moment has two possible homes now (the `editor` block, and the legacy
  // options bag), so "nothing stored" means clearing both.
  const withNoStoredRunOn = (state: PolicyDecodedState) => {
    const wire = toWirePolicy(state);
    delete (wire.output.options as Record<string, unknown>).runOn;
    delete wire.editor;
    return wire;
  };

  it("defaults a missing runOn to the category default (security → export)", () => {
    expect(fromWirePolicy(withNoStoredRunOn(FULL_STATE)).runOn).toBe("export");
  });

  it("defaults a missing runOn to upload for other categories", () => {
    const wire = withNoStoredRunOn({
      ...FULL_STATE,
      categoryId: "classification",
    });
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

  it("reads editor participation off the editor block, not sources", () => {
    const wire = toWirePolicy(FULL_STATE);
    expect(fromWirePolicy(wire).runsOnEditor).toBe(true);
    expect(
      fromWirePolicy({ ...wire, editor: { allowed: false, runOn: "upload" } })
        .runsOnEditor,
    ).toBe(false);
  });

  it("prefers the editor block's moment over the legacy options bag", () => {
    const wire = toWirePolicy(FULL_STATE);
    wire.output.options.runOn = "upload";
    wire.editor = { allowed: true, runOn: "export" };
    expect(fromWirePolicy(wire).runOn).toBe("export");
  });

  it("falls back to the stored moment when the editor does not run it", () => {
    const wire = toWirePolicy({ ...FULL_STATE, runOn: "export" });
    wire.editor = { allowed: false, runOn: "upload" };
    expect(fromWirePolicy(wire).runOn).toBe("export");
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
    expect(decoded.inputs).toEqual([]);
    expect(decoded.outputIds).toEqual([]);
    expect(decoded.routingRules).toEqual([]);
    expect(decoded.trigger).toBeNull();
    expect(decoded.runsOnEditor).toBe(false);
    expect(decoded.runOn).toBe("upload");
    expect(decoded.outputMode).toBe("new_version");
  });

  it("defaults fieldValues to empty object when missing", () => {
    const wire = toWirePolicy(FULL_STATE);
    delete (wire.output.options as Record<string, unknown>).fieldValues;
    expect(fromWirePolicy(wire).fieldValues).toEqual({});
  });
});

describe("policyInputs → binding a source selection", () => {
  const trigger = {
    type: "schedule",
    options: { schedule: { type: "every", count: 1, unit: "HOURS" } },
  };

  it("drops the virtual editor source and never binds it", () => {
    expect(policyInputs([EDITOR_SOURCE_ID, "src-dropbox"], trigger)).toEqual([
      { sourceId: "src-dropbox", trigger },
    ]);
  });

  it("pairs every real source with the given trigger", () => {
    expect(policyInputs(["src-dropbox"], null)).toEqual([
      { sourceId: "src-dropbox", trigger: null },
    ]);
  });

  it("returns no inputs for an editor-only selection", () => {
    expect(policyInputs([EDITOR_SOURCE_ID], trigger)).toEqual([]);
  });
});

describe("fromWirePolicy → routing bindings", () => {
  it("unions the options-bag sources with the bound inputs", () => {
    // A record saved before inputs were emitted (sources only in the bag) plus
    // a bound input still decodes to the complete selection, no duplicates.
    const decoded = fromWirePolicy({
      id: "pol_routing",
      name: "Routing",
      enabled: true,
      inputs: [{ sourceId: "src-dropbox", trigger: null }],
      steps: [],
      output: {
        type: "inline",
        options: { categoryId: "routing", sources: ["editor", "src-dropbox"] },
      },
      outputIds: ["src-archive"],
    });
    expect(decoded.sources).toEqual(["editor", "src-dropbox"]);
    expect(decoded.outputIds).toEqual(["src-archive"]);
  });

  it("surfaces the bound input's trigger as the read-view trigger", () => {
    const trigger = { type: "webhook", options: {} };
    const decoded = fromWirePolicy({
      id: "pol_routing",
      name: "Routing",
      enabled: true,
      inputs: [{ sourceId: "src-hook", trigger }],
      steps: [],
      output: { type: "inline", options: { categoryId: "routing" } },
    });
    expect(decoded.trigger).toEqual(trigger);
  });
});
