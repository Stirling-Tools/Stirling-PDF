import { describe, expect, it } from "vitest";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import {
  persistedSourceFields,
  inheritedSourceLink,
  sourceLinkForNewFile,
  reconcileBeforeOpen,
} from "@app/contexts/file/storedFileReconciler";

// Where IndexedDB is the only truth there is nothing to reconcile against, and
// the workbench has to be able to rely on that: a stub that started answering
// would put link fields on files that have no source.

const stub = { id: "f1" as FileId, name: "a.pdf" } as StirlingFileStub;

describe("reconciling a record with no source", () => {
  it("serves the stored copy untouched", async () => {
    await expect(
      reconcileBeforeOpen(stub, {
        getStub: () => undefined,
        listStubs: () => [],
        putFile: () => {},
        updateStub: () => {},
        dropFile: () => {},
        reprocessFile: () => {},
      }),
    ).resolves.toEqual({});
  });

  it("mirrors no field into storage beyond the stored copy itself", () => {
    expect(persistedSourceFields({ localFilePath: "C:/x.pdf" })).toBe(null);
  });

  it("gives a derived file no link to inherit", () => {
    expect(inheritedSourceLink(stub)).toEqual({});
  });

  it("leaves a newly added file unlinked", async () => {
    await expect(sourceLinkForNewFile("k")).resolves.toEqual({});
  });
});
