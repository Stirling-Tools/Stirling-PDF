import { describe, it, expect } from "vitest";
import { reorderFileIds } from "@app/components/fileEditor/reorderFileIds";
import { FileId } from "@app/types/fileContext";

describe("reorderFileIds (pairwise swap)", () => {
  const ids: FileId[] = [
    "A" as FileId,
    "B" as FileId,
    "C" as FileId,
    "D" as FileId,
    "E" as FileId,
  ];

  it("swaps two files directly without moving intervening items (B onto E -> A, E, C, D, B)", () => {
    const result = reorderFileIds(ids, "B" as FileId, "E" as FileId);
    expect(result).toEqual(["A", "E", "C", "D", "B"]);
  });

  it("swaps two adjacent files (B onto C -> A, C, B, D, E)", () => {
    const result = reorderFileIds(ids, "B" as FileId, "C" as FileId);
    expect(result).toEqual(["A", "C", "B", "D", "E"]);
  });

  it("returns unchanged array reference when dropping onto itself", () => {
    const result = reorderFileIds(ids, "B" as FileId, "B" as FileId);
    expect(result).toBe(ids);
  });

  it("returns unchanged array reference when source or target is missing", () => {
    expect(reorderFileIds(ids, "Z" as FileId, "B" as FileId)).toBe(ids);
    expect(reorderFileIds(ids, "B" as FileId, "Z" as FileId)).toBe(ids);
  });
});
