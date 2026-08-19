/**
 * Only a high-confidence local heuristic verdict avoids a paid AI classification;
 * anything weaker, or not yet computed, escalates to the engine.
 */
import { describe, expect, it } from "vitest";
import { shouldDispatchToAi } from "@app/components/policies/usePolicyAutoRun";
import type { StirlingFileStub } from "@app/types/fileContext";

const stub = (
  confidence?: StirlingFileStub["classificationConfidence"],
): StirlingFileStub =>
  ({ id: "f1", classificationConfidence: confidence }) as StirlingFileStub;

describe("classification escalation", () => {
  it("trusts only a high-confidence heuristic verdict", () => {
    expect(shouldDispatchToAi("classification", stub("high"))).toBe(false);
  });

  it("escalates anything less certain than high", () => {
    for (const confidence of ["medium", "low", "none"] as const) {
      expect(shouldDispatchToAi("classification", stub(confidence))).toBe(true);
    }
  });

  it("defers while the heuristic has not reported yet", () => {
    // Not a skip: dispatching now races the local pass and pays for a free answer;
    // the caller re-evaluates once the verdict lands.
    expect(shouldDispatchToAi("classification", stub(undefined))).toBe(false);
  });

  it("does not gate any other policy category", () => {
    expect(shouldDispatchToAi("security", stub(undefined))).toBe(true);
    expect(shouldDispatchToAi("security", stub("high"))).toBe(true);
  });
});
