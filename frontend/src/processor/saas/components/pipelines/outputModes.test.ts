import { describe, expect, it } from "vitest";
// Resolves to the SaaS override (src/portal-saas) via the @processor cascade.
import { availableOutputModes } from "@processor/components/pipelines/outputModes";

describe("availableOutputModes (SaaS)", () => {
  it("offers only s3: no server filesystem, and inline results would expire unseen", () => {
    expect(availableOutputModes()).toEqual(["s3"]);
  });
});
