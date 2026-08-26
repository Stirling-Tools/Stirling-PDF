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
});
