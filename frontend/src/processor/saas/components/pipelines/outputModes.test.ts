import { describe, expect, it } from "vitest";
// Resolves to the SaaS override (src/portal-saas) via the @portal cascade.
import { availableOutputModes } from "@portal/components/pipelines/outputModes";

describe("availableOutputModes (SaaS)", () => {
  it("offers durable destinations without exposing the server filesystem", () => {
    expect(availableOutputModes()).toEqual(["s3", "vectordb"]);
  });
});
