import { describe, it, expect } from "vitest";
import {
  isClassificationCategory,
  orderRewritesFirst,
  policyDeliversOutputFiles,
  policyRequiresAiEngine,
  policyRewritesDocument,
  shouldDispatchToAi,
} from "@app/data/classificationPolicy";
import type { StirlingFileStub } from "@app/types/fileContext";

const stub = (
  confidence?: StirlingFileStub["classificationConfidence"],
): StirlingFileStub =>
  ({ classificationConfidence: confidence }) as StirlingFileStub;

const derivedStub = (
  confidence?: StirlingFileStub["classificationConfidence"],
): StirlingFileStub =>
  ({
    derivedFromTool: true,
    classificationConfidence: confidence,
  }) as StirlingFileStub;

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

  it("marks classification as the AI-escalation policy", () => {
    expect(policyRequiresAiEngine("classification")).toBe(true);
    expect(policyRequiresAiEngine("security")).toBe(false);
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

describe("shouldDispatchToAi", () => {
  it("always dispatches a policy that is not classification", () => {
    expect(shouldDispatchToAi("security", stub())).toBe(true);
    expect(shouldDispatchToAi("security", stub("high"))).toBe(true);
  });

  it("holds back until the local heuristic has reported", () => {
    // Not a skip: dispatching now races the local pass and pays for a free answer;
    // the caller re-evaluates once the verdict lands.
    expect(shouldDispatchToAi("classification", stub())).toBe(false);
  });

  it("lets a confident local verdict stand", () => {
    expect(shouldDispatchToAi("classification", stub("high"))).toBe(false);
  });

  it("escalates anything less than confident", () => {
    expect(shouldDispatchToAi("classification", stub("medium"))).toBe(true);
    expect(shouldDispatchToAi("classification", stub("low"))).toBe(true);
    expect(shouldDispatchToAi("classification", stub("none"))).toBe(true);
  });

  it("escalates an upload whose local pass threw, rather than waiting forever", () => {
    // An encrypted document never reports a local verdict, so waiting means the server run
    // never dispatches, nothing records the failure, and the bell stays empty.
    expect(shouldDispatchToAi("classification", stub(), true)).toBe(true);
  });

  it("still lets a confident verdict stand even if an earlier pass had thrown", () => {
    expect(shouldDispatchToAi("classification", stub("high"), true)).toBe(
      false,
    );
  });

  it("escalates a tool-derived file with no verdict at all", () => {
    // A derived file gets no local pass (useClientSideClassification skips it), so
    // there is no verdict to wait for: holding back would skip it forever. This is
    // the chained case for a new_file-mode output, or a version made before the
    // upload's verdict landed.
    expect(shouldDispatchToAi("classification", derivedStub())).toBe(true);
  });

  it("lets a derived file's inherited verdict decide like an upload's own", () => {
    expect(shouldDispatchToAi("classification", derivedStub("high"))).toBe(
      false,
    );
    expect(shouldDispatchToAi("classification", derivedStub("low"))).toBe(true);
  });
});
