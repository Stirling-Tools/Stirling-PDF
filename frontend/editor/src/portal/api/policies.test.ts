import { describe, expect, it } from "vitest";
import { parseSimplePolicy } from "@portal/api/policies";
import { policyStep, policyStepToWire } from "@app/policies/operations";
import type { Policy } from "@portal/api/pipelines";

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
