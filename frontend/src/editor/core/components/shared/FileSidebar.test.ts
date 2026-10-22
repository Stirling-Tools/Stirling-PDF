import { describe, expect, it } from "vitest";
import { overlayLiveFields } from "@app/components/shared/FileSidebar";
import type { StirlingFileStub } from "@app/types/fileContext";

const stub = (overrides: Partial<StirlingFileStub>): StirlingFileStub =>
  ({ id: "f1", name: "a.pdf", size: 1, ...overrides }) as StirlingFileStub;

describe("overlayLiveFields", () => {
  it("prefers the live record's values over the stored stub", () => {
    const stored = stub({ name: "old.pdf", classificationLabels: ["finance"] });
    const live = stub({ name: "new.pdf", classificationLabels: ["legal"] });

    expect(overlayLiveFields(stored, live)).toMatchObject({
      name: "new.pdf",
      classificationLabels: ["legal"],
    });
  });

  it("keeps stored values for fields the live record does not carry", () => {
    const stored = stub({
      processedFile: { isEncrypted: true } as StirlingFileStub["processedFile"],
      diskSyncedModifiedMs: 4242,
    });
    const live = stub({
      processedFile: undefined,
      diskSyncedModifiedMs: undefined,
    });

    const merged = overlayLiveFields(stored, live);

    expect(merged.processedFile).toEqual({ isEncrypted: true });
    expect(merged.diskSyncedModifiedMs).toBe(4242);
  });
});
