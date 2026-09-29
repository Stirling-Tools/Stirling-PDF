import { describe, expect, test } from "vitest";
import { dispatchableFileId } from "@app/components/policies/policyLocalPass";
import type { StirlingFileStub } from "@app/types/fileContext";

// A locked classification came from the classification demo's sweep and must never reach the AI.
// runPolicyOnFile takes only a DispatchableFileId, and this is its sole producer, so a
// dispatch site cannot be written that skips the check without an explicit cast.

const stub = (over: Partial<StirlingFileStub> = {}) =>
  ({ id: "f1", name: "a.pdf", size: 1, ...over }) as StirlingFileStub;

describe("dispatchableFileId", () => {
  test("refuses a locked classification", () => {
    expect(dispatchableFileId(stub({ classificationLocked: true }))).toBeNull();
  });

  test("refuses at low confidence, which is what would otherwise escalate", () => {
    expect(
      dispatchableFileId(
        stub({
          classificationLocked: true,
          classificationLabels: ["invoice"],
          classificationConfidence: "none",
        }),
      ),
    ).toBeNull();
  });

  test("refuses with no labels at all", () => {
    // An unreadable classification-demo document must not be handed to the AI to have another go.
    expect(
      dispatchableFileId(
        stub({ classificationLocked: true, classificationLabels: [] }),
      ),
    ).toBeNull();
  });

  test("allows an ordinary upload", () => {
    expect(dispatchableFileId(stub())).toBe("f1");
    expect(
      dispatchableFileId(stub({ classificationLabels: ["invoice"] })),
    ).toBe("f1");
  });
});
