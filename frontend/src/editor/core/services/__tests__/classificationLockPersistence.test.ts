import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { fileStorage } from "@app/services/fileStorage";
import {
  createNewStirlingFileStub,
  createStirlingFile,
} from "@app/types/fileContext";

// classificationLocked is what stops a policy reclassifying a file the onboarding demo
// already settled. The upload auto-run checks the lock and not the labels, so a lock lost
// on reload would hand those files to the AI on the next launch.

beforeEach(() => {
  // Fresh database per test; assigning the global is how fake-indexeddb is reset.
  vi.stubGlobal("indexedDB", new IDBFactory());
});

async function storeAndReload(locked: boolean) {
  const file = createStirlingFile(
    new File(["%PDF-1.4"], "invoice.pdf", { type: "application/pdf" }),
  );
  const stub = createNewStirlingFileStub(file, file.fileId);
  stub.classificationLabels = ["invoice"];
  stub.classificationConfidence = "none";
  if (locked) stub.classificationLocked = true;

  await fileStorage.storeStirlingFile(file, stub);
  return fileStorage.getStirlingFileStub(file.fileId);
}

describe("classificationLocked survives storage", () => {
  test("a locked verdict is still locked after a reload", async () => {
    const reloaded = await storeAndReload(true);

    expect(reloaded?.classificationLocked).toBe(true);
    // Confidence rides along: "none" is the verdict a policy would otherwise escalate.
    expect(reloaded?.classificationConfidence).toBe("none");
    expect(reloaded?.classificationLabels).toEqual(["invoice"]);
  });

  test("an ordinary upload comes back unlocked", async () => {
    const reloaded = await storeAndReload(false);

    expect(reloaded?.classificationLocked).toBeUndefined();
  });
});
