import { describe, expect, it } from "vitest";
import {
  assemblePolicies,
  buildWireFromSetup,
  assemblePolicies,
  parseSimplePolicy,
  type PolicySetupResult,
  type WirePolicy,
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

describe("assemblePolicies", () => {
  it("keeps routing bindings in decorated state when a saved policy is reopened", () => {
    const routingRule = {
      condition: {
        input: { source: "document" as const, field: "document.extension" },
        operator: "matches-any" as const,
        values: ["pdf"],
      },
      outputId: "finance",
    };
    const response = assemblePolicies(
      [
        {
          id: "route-1",
          name: "Route documents",
          enabled: true,
          inputs: [
            {
              sourceId: "inbox",
              trigger: { type: "folder-watch", options: {} },
            },
          ],
          steps: [],
          output: { type: "inline", options: { categoryId: "routing" } },
          outputIds: ["archive"],
          routingRules: [routingRule],
          editor: { allowed: false, runOn: "upload" },
        },
      ],
      [],
    );

    const state = response.catalogue.find(
      (entry) => entry.category.id === "routing",
    )?.policy?.state;
    expect(state?.trigger).toEqual({ type: "folder-watch", options: {} });
    expect(state?.outputIds).toEqual(["archive"]);
    expect(state?.routingRules).toEqual([routingRule]);
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

it("round-trips source bindings, schedule, paused state and database target", () => {
  const policy: Policy = {
    ...classificationPolicy(false),
    name: "Archive ingestion",
    enabled: false,
    icon: "database",
    inputs: [
      {
        sourceId: "incoming",
        trigger: {
          type: "schedule",
          options: { schedule: { type: "every", count: 15, unit: "MINUTES" } },
        },
      },
    ],
    outputIds: ["knowledge"],
    editor: { allowed: false, runOn: "upload" },
    steps: [
      policyStepToWire(policyStep("ocr", { languages: ["eng"] })),
      policyStepToWire(
        policyStep("ragIngest", {
          index: "false",
          includeOriginal: "false",
          exportChunksJsonl: "true",
        }),
      ),
    ],
    output: {
      type: "inline",
      options: { categoryId: "ingestion", customMetadata: "kept" },
    },
  };
  const entry = parseSimplePolicy(policy, [])!;
  expect(entry).not.toBeNull();
  const result = {
    ...setupResult(),
    runsOnEditor: false,
    inputs: entry.policy!.state.inputs,
    outputIds: entry.policy!.state.outputIds,
    steps: entry.policy!.steps,
    extraOptions: entry.policy!.state.extraOptions,
  };
  const wire = buildWireFromSetup(entry, result, t, false);
  expect(wire.inputs).toEqual(policy.inputs);
  expect(wire.outputIds).toEqual(["knowledge"]);
  expect(wire.steps).toEqual(policy.steps);
  expect(wire.output.options).toMatchObject({ customMetadata: "kept" });
  expect(wire.enabled).toBe(false);
  expect(wire.name).toBe("Archive ingestion");
  expect(wire.icon).toBe("database");
});

it("keeps advanced triggers and inline output types in the full builder", () => {
  const policy = classificationPolicy(false);
  expect(
    parseSimplePolicy(
      {
        ...policy,
        inputs: [
          {
            sourceId: "in",
            trigger: {
              type: "schedule",
              options: { schedule: { type: "cron", expression: "0 0 * * *" } },
            },
          },
        ],
      },
      [],
    ),
  ).toBeNull();
  expect(
    parseSimplePolicy(
      {
        ...policy,
        output: { type: "folder", options: { categoryId: "classification" } },
      },
      [],
    ),
  ).toBeNull();
});

it("preserves source bindings and custom identity through catalogue setup links", () => {
  const policy: WirePolicy = {
    id: "contracts-policy",
    trigger: null,
    steps: [policyStepToWire(policyStep("classify"))],
    output: { type: "inline", options: { categoryId: "classification" } },
    name: "Contracts classifier",
    icon: "shield",
    enabled: false,
    inputs: [{ sourceId: "contracts", trigger: null }],
    outputIds: ["archive"],
  };
  const entry = assemblePolicies([policy], []).catalogue.find(
    (entry) => entry.category.id === "classification",
  )!;
  const state = entry.policy!.state;
  const wire = buildWireFromSetup(
    entry,
    {
      ...setupResult(),
      inputs: state.inputs,
      outputIds: state.outputIds,
      runsOnEditor: false,
    },
    t,
    false,
  );
  expect(wire).toMatchObject({
    name: policy.name,
    icon: policy.icon,
    enabled: false,
    inputs: policy.inputs,
    outputIds: policy.outputIds,
  });
});
