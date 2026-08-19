/**
 * The rule that decides whether a document costs an AI classification.
 *
 * The local heuristic runs on every editor upload; only a high-confidence verdict from it stands
 * alone. Anything weaker - or not yet computed - goes to the engine, which overwrites it.
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
    // Not a skip: dispatching now would race the local pass and pay for an answer it is about to
    // produce for free. The caller re-evaluates when the verdict lands on the stub.
    expect(shouldDispatchToAi("classification", stub(undefined))).toBe(false);
  });

  it("does not gate any other policy category", () => {
    expect(shouldDispatchToAi("security", stub(undefined))).toBe(true);
    expect(shouldDispatchToAi("security", stub("high"))).toBe(true);
  });
});
