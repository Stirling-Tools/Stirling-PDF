// @vitest-environment node
import { describe, expect, it } from "vitest";
// Resolves to the SaaS override (src/portal-saas) via the @processor cascade.
import { availableOutputModes } from "@processor/components/pipelines/outputModes";

describe("availableOutputModes (SaaS)", () => {
  it("offers durable destinations without exposing the server filesystem", () => {
    expect(availableOutputModes()).toEqual(["s3", "vectordb"]);
  });
});
