// @vitest-environment node
import { describe, test, expect } from "vitest";
import { excludeExisting } from "@editor/hooks/useToolWorkflowSuggestions";
import type { ActivityChain } from "@editor/utils/activityChains";

const chain = (operations: string[], fileCount: number): ActivityChain => ({
  operations,
  fileCount,
  scope: "team",
});

describe("excludeExisting", () => {
  test("drops chains that match an existing automation step for step", () => {
    const chains = [
      chain(["compress", "flatten"], 5),
      chain(["ocr", "compress"], 4),
    ];

    expect(excludeExisting(chains, [["compress", "flatten"]])).toEqual([
      chain(["ocr", "compress"], 4),
    ]);
  });

  test("keeps a chain whose steps appear in a different order", () => {
    const chains = [chain(["compress", "flatten"], 5)];

    expect(excludeExisting(chains, [["flatten", "compress"]])).toEqual(chains);
  });

  test("caps the suggestions shown", () => {
    const chains = [
      chain(["a", "b"], 9),
      chain(["c", "d"], 8),
      chain(["e", "f"], 7),
      chain(["g", "h"], 6),
    ];

    expect(excludeExisting(chains, [])).toHaveLength(3);
  });

  test("takes a larger cap where there is room for more", () => {
    const chains = [
      chain(["a", "b"], 9),
      chain(["c", "d"], 8),
      chain(["e", "f"], 7),
      chain(["g", "h"], 6),
    ];

    expect(excludeExisting(chains, [], 6)).toHaveLength(4);
  });
});
