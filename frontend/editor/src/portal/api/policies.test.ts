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
    const entry = parseSimplePolicy(classificationPolicy(true), []);
    expect(entry?.policy?.state.required).toBe(true);
  });

  it("keeps a non-required policy non-required", () => {
    const entry = parseSimplePolicy(classificationPolicy(false), []);
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
    const entry = parseSimplePolicy(policy, []);
    expect(entry?.policy?.state.runOn).toBe("export");
    expect(entry?.policy?.state.runsOnEditor).toBe(true);
  });

  it("carries the run history of the policy it was handed", () => {
    const policy = classificationPolicy(true);
    const runs = [
      {
        runId: "admin:r1",
        policyId: policy.id,
        status: "COMPLETED",
        currentStep: 2,
        stepCount: 2,
        error: null,
        errorCode: null,
        errorSubscribed: null,
        outputs: [{ fileName: "invoice_redacted.pdf" }],
        createdAt: Date.now(),
        fileName: null,
      },
      // A run belonging to some other policy must not leak in.
      {
        ...{},
        runId: "admin:r2",
        policyId: "other",
        status: "COMPLETED",
        currentStep: 1,
        stepCount: 1,
        error: null,
        errorCode: null,
        errorSubscribed: null,
        outputs: [],
        createdAt: Date.now(),
        fileName: null,
      },
    ] as unknown as Parameters<typeof parseSimplePolicy>[1];

    const entry = parseSimplePolicy(policy, runs);

    expect(entry?.policy?.activity).toHaveLength(1);
    expect(entry?.policy?.activity[0]?.doc).toBe("invoice_redacted.pdf");
    expect(entry?.policy?.stats.enforced).toBe(1);
  });
});

describe("buildWireFromSetup", () => {
  it("preserves the stored icon and name so a wizard save doesn't reset them", () => {
    const policy: Policy = {
      ...classificationPolicy(false),
      name: "My classifier",
      icon: "shield",
    };
    const entry = parseSimplePolicy(policy, []);
    const wire = buildWireFromSetup(entry!, setupResult(), t);
    expect(wire.icon).toBe("shield");
    expect(wire.name).toBe("My classifier");
  });
});
