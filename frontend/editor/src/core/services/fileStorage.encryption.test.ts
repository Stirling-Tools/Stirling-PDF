import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  fileStorage,
  type StoredStirlingFileRecord,
} from "@app/services/fileStorage";
import {
  indexedDBManager,
  DATABASE_CONFIGS,
} from "@app/services/indexedDBManager";
import {
  createNewStirlingFileStub,
  createStirlingFile,
} from "@app/types/fileContext";
import {
  clearPdfAccess,
  getPdfAccess,
  rememberPdfAccess,
} from "@app/services/pdfPasswordStore";

afterEach(async () => {
  clearPdfAccess();
  await fileStorage.clearAll();
});

describe("stored PDF protection metadata", () => {
  it("reading a saved copy does not revoke the active document's session", async () => {
    const file = new File(["encrypted bytes"], "private.pdf", {
      type: "application/pdf",
    });
    const stub = createNewStirlingFileStub(file);
    const original = createStirlingFile(file, stub.id);
    rememberPdfAccess(original, {
      password: "secret",
      encrypted: true,
      signed: false,
      ownerAuthenticated: true,
      permissions: -4,
      canModify: true,
      canAssemble: true,
      pageCount: 1,
    });
    await fileStorage.storeStirlingFile(original, stub);
    const copy = await fileStorage.getStirlingFile(stub.id);
    expect(copy).not.toBe(original);
    expect(getPdfAccess(stub.id)?.password).toBe("secret");
    expect(getPdfAccess(copy)).toBeUndefined();
  });
  it("retains encryption through all library read paths without retaining session access", async () => {
    const file = new File(["encrypted bytes"], "private.pdf", {
      type: "application/pdf",
    });
    const stub = createNewStirlingFileStub(file);
    stub.processedFile = { pages: [], isEncrypted: true };
    stub.thumbnailUrl = "data:image/png;base64,private";
    await fileStorage.storeStirlingFile(
      createStirlingFile(file, stub.id),
      stub,
    );
    clearPdfAccess();
    const reads = [
      await fileStorage.getStirlingFileStub(stub.id),
      ...(await fileStorage.getAllStirlingFileStubs()),
      ...(await fileStorage.getLeafStirlingFileStubs()),
    ];
    expect(reads).toHaveLength(3);
    for (const read of reads)
      expect(read?.processedFile?.isEncrypted).toBe(true);
  });

  it("discards legacy PDF previews whose encryption status was never stored", async () => {
    const file = new File(["protected legacy bytes"], "legacy.pdf", {
      type: "application/pdf",
    });
    const stub = createNewStirlingFileStub(file);
    const record: StoredStirlingFileRecord = {
      ...stub,
      fileId: stub.id,
      quickKey: "legacy",
      data: new Uint8Array([1, 2]).buffer,
      thumbnail: "data:image/png;base64,private",
      thumbnailStoredAt: Date.now(),
    };
    const db = await indexedDBManager.openDatabase(DATABASE_CONFIGS.FILES);
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("files", "readwrite");
      transaction.objectStore("files").put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    const reads = [
      await fileStorage.getStirlingFileStub(stub.id),
      ...(await fileStorage.getAllStirlingFileStubs()),
      ...(await fileStorage.getLeafStirlingFileStubs()),
    ];
    for (const read of reads) expect(read?.thumbnailUrl).toBeUndefined();
  });
});
