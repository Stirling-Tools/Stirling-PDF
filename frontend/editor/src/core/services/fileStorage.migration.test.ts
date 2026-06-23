import { describe, it, expect } from "vitest";
import {
  legacyDerivedFromTool,
  type StoredStirlingFileRecord,
} from "@app/services/fileStorage";
import type { FileId } from "@app/types/file";

/**
 * Backfill of `derivedFromTool` for files persisted before the field existed
 * (old users' IndexedDB). New records always carry an explicit flag, so this
 * helper only governs pre-upgrade records.
 */
function record(
  overrides: Partial<StoredStirlingFileRecord>,
): StoredStirlingFileRecord {
  return {
    id: "f" as FileId,
    fileId: "f" as FileId,
    quickKey: "k",
    name: "f.pdf",
    type: "application/pdf",
    size: 1,
    lastModified: 0,
    isLeaf: true,
    originalFileId: "f",
    versionNumber: 1,
    data: new ArrayBuffer(0),
    ...overrides,
  } as StoredStirlingFileRecord;
}

describe("legacyDerivedFromTool — IndexedDB backfill for pre-upgrade files", () => {
  it("flags a legacy versioned edit (has tool history)", () => {
    expect(
      legacyDerivedFromTool(
        record({ toolHistory: [{ toolId: "compress" as any, timestamp: 0 }] }),
      ),
    ).toBe(true);
  });

  it("flags a legacy file past its first version", () => {
    expect(legacyDerivedFromTool(record({ versionNumber: 2 }))).toBe(true);
  });

  it("flags a legacy file with a parent", () => {
    expect(legacyDerivedFromTool(record({ parentFileId: "p" as FileId }))).toBe(
      true,
    );
  });

  it("leaves a clean legacy root unflagged — treated as an upload (safe default for enforcement)", () => {
    // A genuine upload AND a legacy independent artifact (convert/split/merge)
    // both look like this; old data can't tell them apart, so we enforce.
    expect(legacyDerivedFromTool(record({}))).toBeUndefined();
  });
});
