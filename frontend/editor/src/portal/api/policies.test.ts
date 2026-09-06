import { describe, expect, it } from "vitest";
import { buildWireFromSetup, parseSimplePolicy } from "@portal/api/policies";
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

describe("buildWireFromSetup", () => {
  const t = ((key: string) => key) as unknown as Parameters<
    typeof buildWireFromSetup
  >[2];

  function customised(): Policy {
    return {
      ...classificationPolicy(false),
      name: "QA Licensed Security Export",
      icon: "shield",
    };
  }

  it("keeps the stored name and icon when the wizard saves an existing policy", () => {
    const entry = parseSimplePolicy(customised());
    expect(entry).not.toBeNull();

    const wire = buildWireFromSetup(
      entry!,
      {
        required: entry!.policy!.state.required,
        extraOptions: entry!.policy!.state.extraOptions,
        runsOnEditor: true,
        fieldValues: entry!.policy!.state.fieldValues,
        sources: entry!.policy!.state.sources,
        scopeTypes: entry!.policy!.state.scopeTypes,
        reviewerEmail: entry!.policy!.state.reviewerEmail,
        outputMode: "new_version",
        outputName: "",
        outputNamePosition: "suffix",
        runOn: "upload",
        maxRetries: 0,
        retryDelayMinutes: 0,
        steps: entry!.policy!.steps,
      },
      t,
    );

    expect(wire.name).toBe("QA Licensed Security Export");
    expect(wire.icon).toBe("shield");
  });

  it("falls back to the category name for a policy that has none yet", () => {
    const entry = parseSimplePolicy(classificationPolicy(false));
    const blank = {
      ...entry!,
      policy: {
        ...entry!.policy!,
        state: { ...entry!.policy!.state, name: "" },
      },
    };

    const wire = buildWireFromSetup(
      blank,
      {
        required: false,
        runsOnEditor: true,
        fieldValues: {},
        sources: [],
        scopeTypes: [],
        reviewerEmail: "",
        outputMode: "new_version",
        outputName: "",
        outputNamePosition: "suffix",
        runOn: "upload",
        maxRetries: 0,
        retryDelayMinutes: 0,
        steps: [],
      },
      t,
    );

    expect(wire.name).toBe("portal.policies.defaultName");
  });
});
