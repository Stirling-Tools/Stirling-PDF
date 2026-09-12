import { describe, expect, it } from "vitest";
import { useServerProcessingBlock } from "@app/hooks/useServerProcessingBlock";

describe("useServerProcessingBlock (core)", () => {
  // Pins the stub: a non-null reason here would disable folder processing on every
  // web build, where the serving backend runs the pipelines perfectly well.
  it("never blocks — the serving backend runs the pipelines", () => {
    expect(useServerProcessingBlock()).toBeNull();
  });
});
