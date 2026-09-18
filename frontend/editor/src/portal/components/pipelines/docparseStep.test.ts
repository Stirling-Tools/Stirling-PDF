import { describe, expect, it } from "vitest";
import {
  newRagIngestStep,
  prepareVectorDestination,
  ragIngestStepConfigured,
  vectorDestinationConfigured,
} from "@portal/components/pipelines/docparseStep";
import { isReadableSource } from "@portal/components/sources/sourceTypes";

describe("RAG database destinations", () => {
  it.each([
    { exportChunksJsonl: true },
    { exportMarkdown: true },
    { includeOriginal: false, exportChunksJsonl: true },
  ])("rejects corpus output for editor input: %o", (params) => {
    const step = newRagIngestStep();
    const corpus = { ...step, params: { ...step.params, ...params } };
    expect(ragIngestStepConfigured(corpus, true)).toBe(false);
    expect(ragIngestStepConfigured(corpus, false)).toBe(true);
    expect(ragIngestStepConfigured(step, true)).toBe(true);
  });
  it("adds preparation without indexing into Stirling by default", () => {
    const steps = prepareVectorDestination([]);
    expect(vectorDestinationConfigured(steps)).toBe(true);
    expect(steps[0].params).toMatchObject({
      index: false,
      exportChunksJsonl: true,
      includeOriginal: false,
    });
    expect(ragIngestStepConfigured(steps[0])).toBe(true);
  });
  it("preserves an existing step's indexing and chunking settings", () => {
    const step = newRagIngestStep();
    const steps = prepareVectorDestination([step]);
    expect(steps).toHaveLength(1);
    expect(steps[0].params).toMatchObject({
      index: true,
      chunkSize: 512,
      overlap: 64,
    });
    expect(step.params).toMatchObject({
      includeOriginal: true,
      exportChunksJsonl: false,
    });
  });
  it("keeps vector destinations out of the input picker", () => {
    expect(isReadableSource({ type: "vectordb" })).toBe(false);
    expect(isReadableSource({ type: "s3" })).toBe(true);
    expect(isReadableSource({ type: "editor" })).toBe(true);
  });
  it("requires an export before dropping the original", () => {
    const step = newRagIngestStep();
    const prepared = prepareVectorDestination([step])[0];
    expect(vectorDestinationConfigured([step])).toBe(false);
    expect(vectorDestinationConfigured([prepared])).toBe(true);
  });
});

describe("RAG chunk parameter limits", () => {
  it.each([
    { chunkSize: 63 },
    { chunkSize: 32769 },
    { chunkSize: 100.5 },
    { overlap: -1 },
    { chunkSize: 8192, overlap: 4097 },
    { mode: "advanced" },
  ])("rejects invalid chunk settings %j", (parameters) => {
    const step = newRagIngestStep();
    expect(
      ragIngestStepConfigured({
        ...step,
        params: { ...step.params, ...parameters },
      }),
    ).toBe(false);
  });
  it("allows zero overlap", () => {
    const step = newRagIngestStep();
    expect(
      ragIngestStepConfigured({
        ...step,
        params: { ...step.params, overlap: 0 },
      }),
    ).toBe(true);
  });
});
