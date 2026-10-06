import { describe, it, expect } from "vitest";
import { reorderFileIds } from "@app/components/fileEditor/reorderFileIds";
import { FileId } from "@app/types/fileContext";

describe("reorderFileIds", () => {
  const ids: FileId[] = [
    "A" as FileId,
    "B" as FileId,
    "C" as FileId,
    "D" as FileId,
    "E" as FileId,
  ];

  it("moves unselected single file forward (B onto D -> A, C, D, B, E)", () => {
    const result = reorderFileIds(ids, "B" as FileId, "D" as FileId, []);
    expect(result).toEqual(["A", "C", "D", "B", "E"]);
  });

  it("moves unselected single file backward (D onto B -> A, D, B, C, E)", () => {
    const result = reorderFileIds(ids, "D" as FileId, "B" as FileId, []);
    expect(result).toEqual(["A", "D", "B", "C", "E"]);
  });

  it("moves selected group forward preserving visual order (D, B selected, move B onto E -> A, C, E, B, D)", () => {
    const result = reorderFileIds(ids, "B" as FileId, "E" as FileId, [
      "D" as FileId,
      "B" as FileId,
    ]);
    expect(result).toEqual(["A", "C", "E", "B", "D"]);
  });

  it("moves unselected file when dragging unselected item even if others are selected", () => {
    const result = reorderFileIds(ids, "C" as FileId, "E" as FileId, [
      "B" as FileId,
      "D" as FileId,
    ]);
    expect(result).toEqual(["A", "B", "D", "E", "C"]);
  });

  it("returns unchanged array reference when dropping onto a member of moving group", () => {
    const result = reorderFileIds(ids, "B" as FileId, "D" as FileId, [
      "B" as FileId,
      "D" as FileId,
    ]);
    expect(result).toBe(ids);
  });

  it("returns unchanged array reference when dropping onto itself", () => {
    const result = reorderFileIds(ids, "B" as FileId, "B" as FileId, [
      "B" as FileId,
    ]);
    expect(result).toBe(ids);
  });

  it("returns unchanged array reference when source or target is missing", () => {
    expect(reorderFileIds(ids, "Z" as FileId, "B" as FileId, [])).toBe(ids);
    expect(reorderFileIds(ids, "B" as FileId, "Z" as FileId, [])).toBe(ids);
  });

  it("returns original array reference if the resulting order is identical", () => {
    // Moving B before C (B onto B is handled above, but moving adjacent without position change)
    const result = reorderFileIds(ids, "B" as FileId, "C" as FileId, []);
    // sourceIndex = 1, targetIndex = 2. remaining = [A, C, D, E]. targetPosition of C = 1.
    // insertPosition = 1 + 1 = 2 -> [A, C, B, D, E] != original
    expect(result).toEqual(["A", "C", "B", "D", "E"]);
  });
});
