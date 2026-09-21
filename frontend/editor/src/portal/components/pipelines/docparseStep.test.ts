import { describe, expect, it } from "vitest";
import {
  newIngestStep,
  ingestStepConfigured,
} from "@portal/components/pipelines/docparseStep";

describe("RAG chunk parameter limits", () => {
  it.each([
    { chunkSize: 63 },
    { chunkSize: 32769 },
    { chunkSize: 100.5 },
    { overlap: -1 },
    { chunkSize: 8192, overlap: 4097 },
  ])("rejects invalid chunk settings %j", (parameters) => {
    const step = newIngestStep();
    expect(
      ingestStepConfigured({
        ...step,
        params: { ...step.params, ...parameters },
      }),
    ).toBe(false);
  });
  it("allows zero overlap", () => {
    const step = newIngestStep();
    expect(
      ingestStepConfigured({
        ...step,
        params: { ...step.params, overlap: 0 },
      }),
    ).toBe(true);
  });
});
