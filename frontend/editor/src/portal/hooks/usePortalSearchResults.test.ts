import { describe, expect, it, vi } from "vitest";
import {
  rankPortalPipelineResults,
  rankPortalPolicyResults,
} from "@portal/hooks/usePortalSearchResults";
import type { CatalogueEntry } from "@portal/api/policies";
import type { PipelineView } from "@portal/api/pipelines";

const t = (key: string, options?: Record<string, unknown>) => {
  if (key === "portal.policies.defaultName") {
    return `${options?.category as string} Policy`;
  }
  return key;
};

function makePolicyEntry(overrides?: Partial<CatalogueEntry>): CatalogueEntry {
  return {
    category: {
      id: "security",
      label: "Security",
      tone: "purple",
      desc: "Protect sensitive documents",
    },
    config: {
      summary: "",
      rules: [],
      scopeLabel: "",
      fields: [],
      defaultOperations: [],
    },
    policy: {
      category: {
        id: "security",
        label: "Security",
        tone: "purple",
        desc: "Protect sensitive documents",
      },
      config: {
        summary: "",
        rules: [],
        scopeLabel: "",
        fields: [],
        defaultOperations: [],
      },
      state: {
        configured: true,
        status: "active",
        sources: [],
        scopeTypes: [],
        reviewerEmail: "",
        fieldValues: {},
        backendId: "policy-security",
      },
      steps: [],
      stats: {
        enforced: 0,
        dataProcessed: "0 B",
        activeFor: "0d",
      },
      activity: [],
    },
    ...overrides,
  };
}

function makePipelineView(
  id: string,
  name: string,
  trigger = "manual",
): PipelineView {
  return {
    id,
    name,
    enabled: true,
    status: "active",
    trigger,
    sources: [],
    steps: [],
    output: "inline",
    owner: "alice",
  };
}

describe("usePortalSearchResults helpers", () => {
  it("ranks configured policies under the policies group", () => {
    const openPolicy = vi.fn();
    const results = rankPortalPolicyResults(
      [makePolicyEntry()],
      "security policy",
      t,
      openPolicy,
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      key: "portal-policy:security",
      group: "portal-policies",
      title: "Security Policy",
    });

    void results[0]?.onSelect();
    expect(openPolicy).toHaveBeenCalledWith("security");
  });

  it("filters policy-backed records out of the pipelines group", () => {
    const openPipeline = vi.fn();
    const results = rankPortalPipelineResults(
      [
        makePipelineView("policy-security", "Security Policy"),
        makePipelineView("custom-pipeline", "Nightly OCR"),
      ],
      "nightly",
      new Set(["policy-security"]),
      openPipeline,
    );

    expect(results.map((result) => result.key)).toEqual([
      "portal-pipeline:custom-pipeline",
    ]);
  });
});
