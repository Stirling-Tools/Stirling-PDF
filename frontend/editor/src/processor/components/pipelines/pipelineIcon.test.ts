import { describe, expect, it } from "vitest";
import { canonicalPipelineIconKey } from "@processor/components/pipelines/pipelineIcon";

describe("canonicalPipelineIconKey", () => {
  it("maps a category id to the picker's canonical key", () => {
    // The builder seeds a template hand-off's icon from its category id; the picker only offers the
    // canonical keys, so this must resolve or the shield shows as the default glyph.
    expect(canonicalPipelineIconKey("security")).toBe("shield");
    expect(canonicalPipelineIconKey("classification")).toBe("label");
  });

  it("leaves a canonical key (or empty) unchanged", () => {
    expect(canonicalPipelineIconKey("shield")).toBe("shield");
    expect(canonicalPipelineIconKey("")).toBe("");
  });
});
