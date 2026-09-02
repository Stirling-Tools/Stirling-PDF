import { describe, it, expect } from "vitest";
import {
  isClassificationCategory,
  localVerdictNeedsEscalation,
  orderRewritesFirst,
  orderedRewritingCategories,
  policyDeliversOutputFiles,
  policyRewritesDocument,
} from "@app/data/classificationPolicy";
import type { PoliciesByCategory } from "@app/types/policies";

const rewriter = (order: number) =>
  ({
    configured: true,
    status: "active",
    backendId: `backend-${order}`,
    runsOnEditor: true,
    runOn: "upload",
    order,
  }) as unknown as PoliciesByCategory[string];

describe("isClassificationCategory", () => {
  it("recognises the classification category and nothing else", () => {
    expect(isClassificationCategory("classification")).toBe(true);
    expect(isClassificationCategory("security")).toBe(false);
    expect(isClassificationCategory("")).toBe(false);
  });
});

describe("policy capabilities", () => {
  it("treats classification as annotating, everything else as rewriting", () => {
    expect(policyRewritesDocument("security")).toBe(true);
    expect(policyRewritesDocument("classification")).toBe(false);
    // A builder pipeline (no catalogue category) runs tools, so it rewrites.
    expect(policyRewritesDocument("pipeline-abc123")).toBe(true);
  });

  it("expects output files from rewriting policies only", () => {
    expect(policyDeliversOutputFiles("security")).toBe(true);
    expect(policyDeliversOutputFiles("classification")).toBe(false);
  });
});

describe("orderRewritesFirst", () => {
  it("moves annotating policies to the end, preserving other order", () => {
    expect(
      orderRewritesFirst(["classification", "security", "compliance"]),
    ).toEqual(["security", "compliance", "classification"]);
  });

  it("leaves an order without an annotating policy untouched", () => {
    expect(orderRewritesFirst(["security", "compliance"])).toEqual([
      "security",
      "compliance",
    ]);
  });

  it("is a no-op when the annotating policy is already last", () => {
    expect(orderRewritesFirst(["security", "classification"])).toEqual([
      "security",
      "classification",
    ]);
  });

  it("handles the annotating policy as the only one", () => {
    expect(orderRewritesFirst(["classification"])).toEqual(["classification"]);
  });
});

describe("orderedRewritingCategories", () => {
  it("lists only file-producing policies, ordered by order, excluding classification", () => {
    const policies = {
      classification: rewriter(0), // annotating: excluded despite being active
      security: rewriter(2),
      compliance: rewriter(1),
    } as unknown as PoliciesByCategory;
    // classification is filtered by policyDeliversOutputFiles, not by the shape above.
    expect(orderedRewritingCategories(policies)).toEqual([
      "compliance",
      "security",
    ]);
  });

  it("excludes inactive, non-editor, export-triggered, and unconfigured policies", () => {
    const mixed = {
      security: rewriter(0),
      inactive: { ...rewriter(1), status: "paused" },
      notEditor: { ...rewriter(2), runsOnEditor: false },
      onExport: { ...rewriter(3), runOn: "export" },
      unconfigured: { ...rewriter(4), configured: false },
      noBackend: { ...rewriter(5), backendId: undefined },
    } as unknown as PoliciesByCategory;
    expect(orderedRewritingCategories(mixed)).toEqual(["security"]);
  });

  it("is empty when classification is the only policy", () => {
    const only = {
      classification: rewriter(0),
    } as unknown as PoliciesByCategory;
    expect(orderedRewritingCategories(only)).toEqual([]);
  });
});

describe("localVerdictNeedsEscalation", () => {
  it("lets a confident local verdict stand", () => {
    expect(localVerdictNeedsEscalation("high")).toBe(false);
  });

  it("does not escalate when no verdict has been recorded yet", () => {
    expect(localVerdictNeedsEscalation(undefined)).toBe(false);
  });

  it("escalates anything less than confident", () => {
    expect(localVerdictNeedsEscalation("medium")).toBe(true);
    expect(localVerdictNeedsEscalation("low")).toBe(true);
    expect(localVerdictNeedsEscalation("none")).toBe(true);
  });
});
