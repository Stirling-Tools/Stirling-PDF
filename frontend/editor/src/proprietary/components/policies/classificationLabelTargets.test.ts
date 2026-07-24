import { describe, it, expect } from "vitest";
import { classificationLabelTargets } from "@app/components/policies/usePolicyAutoRun";
import type { StirlingFileStub } from "@app/types/fileContext";

// Loosely-typed builder: FileId is a branded string, so accept plain string ids
// in tests and cast — classificationLabelTargets only reads id/parent/sources.
const stub = (s: {
  id: string;
  parentFileId?: string;
  sourceFileIds?: string[];
}): StirlingFileStub => s as unknown as StirlingFileStub;

describe("classificationLabelTargets", () => {
  it("targets the run's own file when it's still the leaf", () => {
    const stubs = [stub({ id: "a" }), stub({ id: "b" })];
    expect(classificationLabelTargets("a", stubs)).toEqual(["a"]);
  });

  it("targets a descendant leaf when the file was edited during the run", () => {
    // "a" was consumed into leaf "a2" (edit forked a new version mid-run).
    const stubs = [stub({ id: "a2", sourceFileIds: ["a"] })];
    expect(classificationLabelTargets("a", stubs)).toEqual(["a2"]);
  });

  it("targets a direct child via parentFileId", () => {
    const stubs = [stub({ id: "a2", parentFileId: "a" })];
    expect(classificationLabelTargets("a", stubs)).toEqual(["a2"]);
  });

  it("falls back to the run's file id when nothing matches (file closed)", () => {
    expect(classificationLabelTargets("a", [stub({ id: "z" })])).toEqual(["a"]);
  });
});
