// @vitest-environment node
import { describe, test, expect } from "vitest";
import { findRepeatedChains, rankChains } from "@editor/utils/activityChains";

const isAutomatable = (toolId: string) =>
  toolId !== "annotate" && toolId !== "automate";

describe("findRepeatedChains", () => {
  test("offers the longest chain repeated across enough files", () => {
    const histories = [
      ["compress", "addWatermark", "flatten"],
      ["compress", "addWatermark", "flatten"],
      ["rotate", "compress", "addWatermark", "flatten"],
    ];

    expect(findRepeatedChains(histories, { isAutomatable })).toEqual([
      {
        operations: ["compress", "addWatermark", "flatten"],
        fileCount: 3,
        scope: "user",
      },
    ]);
  });

  test("ignores chains seen on fewer files than the threshold", () => {
    const histories = [
      ["compress", "addWatermark"],
      ["compress", "addWatermark"],
    ];

    expect(findRepeatedChains(histories, { isAutomatable })).toEqual([]);
  });

  test("counts a chain once per file even when it repeats within that file", () => {
    const histories = [
      ["compress", "flatten", "compress", "flatten"],
      ["compress", "flatten"],
    ];

    expect(findRepeatedChains(histories, { isAutomatable })).toEqual([]);
  });

  test("keeps a shorter chain when it is more common than its extensions", () => {
    const histories = [
      ["ocr", "compress", "flatten"],
      ["ocr", "compress"],
      ["ocr", "compress"],
    ];

    expect(findRepeatedChains(histories, { isAutomatable })).toEqual([
      { operations: ["ocr", "compress"], fileCount: 3, scope: "user" },
    ]);
  });

  test("breaks chains at steps that cannot be automated", () => {
    const histories = [
      ["compress", "annotate", "flatten"],
      ["compress", "annotate", "flatten"],
      ["compress", "annotate", "flatten"],
    ];

    expect(findRepeatedChains(histories, { isAutomatable })).toEqual([]);
  });

  test("collapses a tool run twice in a row into one step", () => {
    const histories = [
      ["rotate", "rotate", "compress"],
      ["rotate", "compress"],
      ["rotate", "rotate", "rotate", "compress"],
    ];

    expect(findRepeatedChains(histories, { isAutomatable })).toEqual([
      { operations: ["rotate", "compress"], fileCount: 3, scope: "user" },
    ]);
  });

  test("ranks by file count and caps the result", () => {
    const histories = [
      ...Array.from({ length: 5 }, () => ["ocr", "compress"]),
      ...Array.from({ length: 4 }, () => ["rotate", "flatten"]),
      ...Array.from({ length: 3 }, () => ["sanitize", "addPassword"]),
    ];

    expect(findRepeatedChains(histories, { isAutomatable, limit: 2 })).toEqual([
      { operations: ["ocr", "compress"], fileCount: 5, scope: "user" },
      { operations: ["rotate", "flatten"], fileCount: 4, scope: "user" },
    ]);
  });
});

describe("rankChains", () => {
  test("prefers the full workflow over the prefixes counted alongside it", () => {
    const chains = [
      { operations: ["ocr", "compress"], fileCount: 6, scope: "team" as const },
      {
        operations: ["ocr", "compress", "flatten"],
        fileCount: 6,
        scope: "team" as const,
      },
      {
        operations: ["split", "merge"],
        fileCount: 2,
        scope: "install" as const,
      },
    ];

    expect(rankChains(chains)).toEqual([
      {
        operations: ["ocr", "compress", "flatten"],
        fileCount: 6,
        scope: "team",
      },
    ]);
  });

  test("folds a shorter chain into a longer one that most of its runs went on to", () => {
    const chains = [
      {
        operations: ["sanitize", "watermark"],
        fileCount: 317,
        scope: "install" as const,
      },
      {
        operations: ["sanitize", "watermark", "compress"],
        fileCount: 304,
        scope: "install" as const,
      },
    ];

    expect(rankChains(chains)).toEqual([
      {
        operations: ["sanitize", "watermark", "compress"],
        fileCount: 304,
        scope: "install",
      },
    ]);
  });

  test("never folds one scope's chain into another scope's", () => {
    const chains = [
      {
        operations: ["ocr", "compress"],
        fileCount: 12,
        scope: "user" as const,
      },
      {
        operations: ["ocr", "compress", "flatten"],
        fileCount: 284,
        scope: "install" as const,
      },
    ];

    expect(rankChains(chains).map((chain) => chain.scope)).toEqual([
      "install",
      "user",
    ]);
  });

  test("puts the viewer's own habits ahead of busier team and server ones", () => {
    const chains = [
      {
        operations: ["sanitize", "watermark"],
        fileCount: 300,
        scope: "install" as const,
      },
      {
        operations: ["rotate", "compress"],
        fileCount: 149,
        scope: "team" as const,
      },
      { operations: ["ocr", "flatten"], fileCount: 12, scope: "user" as const },
    ];

    expect(
      rankChains(chains, { order: "nearestFirst" }).map((chain) => chain.scope),
    ).toEqual(["user", "team", "install"]);
  });
});
