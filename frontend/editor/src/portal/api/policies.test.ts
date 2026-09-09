import { describe, expect, it } from "vitest";
import {
  buildWireFromSetup,
  parseSimplePolicy,
  type PolicySetupResult,
} from "@portal/api/policies";
import { policyStep, policyStepToWire } from "@app/policies/operations";
import type { Policy } from "@portal/api/pipelines";
import type { TFunction } from "i18next";

const t = ((key: string) => key) as unknown as TFunction;

/** A minimal wizard result; the fields under test are the stored name/icon, not these. */
function setupResult(): PolicySetupResult {
  return {
    required: false,
    fieldValues: {},
    sources: [],
    runsOnEditor: true,
    scopeTypes: [],
    reviewerEmail: "",
    outputMode: "new_version",
    outputName: "",
    outputNamePosition: "suffix",
    runOn: "upload",
    maxRetries: 0,
    retryDelayMinutes: 0,
    steps: [],
  };
}

/** A template-representable classification policy, `required` as given. */
function classificationPolicy(required: boolean): Policy {
  return {
    id: "plc-1",
    name: "Classify",
    enabled: true,
    required,
    inputs: [],
    steps: [policyStepToWire(policyStep("classify"))],
    output: { type: "inline", options: { categoryId: "classification" } },
    outputIds: [],
  };
}

describe("parseSimplePolicy", () => {
  it("carries required through so the wizard reopens org-mandated", () => {
    const entry = parseSimplePolicy(classificationPolicy(true));
    expect(entry?.policy?.state.required).toBe(true);
  });

  it("keeps a non-required policy non-required", () => {
    const entry = parseSimplePolicy(classificationPolicy(false));
    expect(entry?.policy?.state.required).toBe(false);
  });

  it("reads runOn from editor, not the stale options bag", () => {
    // The builder writes the current runOn to `editor` and leaves the legacy options-bag copy
    // behind, so the two disagree here on purpose; `editor` must win.
    const policy: Policy = {
      ...classificationPolicy(false),
      output: {
        type: "inline",
        options: { categoryId: "classification", runOn: "upload" },
      },
      editor: { allowed: true, runOn: "export" },
    };
    const entry = parseSimplePolicy(policy);
    expect(entry?.policy?.state.runOn).toBe("export");
    expect(entry?.policy?.state.runsOnEditor).toBe(true);
  });
});

describe("buildWireFromSetup", () => {
  it("preserves the stored icon and name so a wizard save doesn't reset them", () => {
    const policy: Policy = {
      ...classificationPolicy(false),
      name: "My classifier",
      icon: "shield",
    };
    const entry = parseSimplePolicy(policy);
    const wire = buildWireFromSetup(entry!, setupResult(), t);
    expect(wire.icon).toBe("shield");
    expect(wire.name).toBe("My classifier");
  });
});
