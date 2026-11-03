// @vitest-environment node
import { describe, expect, it } from "vitest";
// Resolves to the hosted edition (src/processor/cloud) via the saas @processor cascade.
import { availableOutputModes } from "@processor/components/pipelines/outputModes";

describe("availableOutputModes (SaaS)", () => {
  it("offers durable destinations without exposing the server filesystem", () => {
    expect(availableOutputModes()).toEqual(["s3", "vectordb"]);
  });
});
