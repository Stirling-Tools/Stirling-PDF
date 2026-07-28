import { describe, it, expect } from "vitest";
import { classificationLabelTargetStubs } from "@app/components/policies/usePolicyAutoRun";
import type { StirlingFileStub } from "@app/types/fileContext";

// Loosely-typed builder: FileId is a branded string, so accept plain string ids
// in tests and cast — classificationLabelTargetStubs only reads id/parent/sources.
const stub = (s: {
  id: string;
  parentFileId?: string;
  sourceFileIds?: string[];
}): StirlingFileStub => s as unknown as StirlingFileStub;

const ids = (stubs: StirlingFileStub[]) => stubs.map((s) => s.id as string);

describe("classificationLabelTargetStubs", () => {
  it("targets the run's own file when it's still the leaf", () => {
    const stubs = [stub({ id: "a" }), stub({ id: "b" })];
    expect(ids(classificationLabelTargetStubs("a", stubs))).toEqual(["a"]);
  });

  it("targets a descendant leaf when the file was edited during the run", () => {
    // "a" was consumed into leaf "a2" (edit forked a new version mid-run).
    const stubs = [stub({ id: "a2", sourceFileIds: ["a"] })];
    expect(ids(classificationLabelTargetStubs("a", stubs))).toEqual(["a2"]);
  });

  it("targets a direct child via parentFileId", () => {
    const stubs = [stub({ id: "a2", parentFileId: "a" })];
    expect(ids(classificationLabelTargetStubs("a", stubs))).toEqual(["a2"]);
  });

  it("returns the stubs themselves, so the caller can see what's already tagged", () => {
    const target = stub({ id: "a" });
    expect(classificationLabelTargetStubs("a", [target])[0]).toBe(target);
  });

  it("is empty when the document has left the workspace (file closed)", () => {
    // No fallback to the run's own id: stamping a consumed id would no-op
    // anyway, and an empty result lets the caller settle without downloading.
    expect(classificationLabelTargetStubs("a", [stub({ id: "z" })])).toEqual(
      [],
    );
  });
});
