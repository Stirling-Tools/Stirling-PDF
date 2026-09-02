import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { indexedDBManager } from "@app/services/indexedDBManager";

// The stash survives a reload, cannot grow without bound, and never holds a password.

const getStirlingFileStub = vi.fn();
const getStirlingFiles = vi.fn();
const post = vi.fn();

vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFileStub: (...args: unknown[]) => getStirlingFileStub(...args),
    getStirlingFiles: (...args: unknown[]) => getStirlingFiles(...args),
  },
}));

vi.mock("@app/services/apiClient", () => ({
  default: { post: (...args: unknown[]) => post(...args) },
}));

const {
  stashRetryPayload,
  clearRetryPayload,
  loadRetryPayload,
  hasLocalFile,
  retryWithPassword,
  unlockLocalDocument,
} = await import("@app/services/notificationRetry");

/** Duplicated from the service, which keeps its storage details private. */
const DB_NAME = "stirling-pdf-retry";
const STORE_NAME = "retryPayloads";

function payload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    operation: "remove-password",
    endpoint: "/api/v1/security/remove-password",
    params: {},
    fileIds: ["f-1"],
    multiFile: false,
    errorCode: "E004",
    recordedAt: 1_000,
    ...overrides,
  } as Parameters<typeof stashRetryPayload>[0];
}

/** Reads records straight out of IndexedDB, bypassing the service's own mapping. */
async function storedRecords(): Promise<Record<string, unknown>[]> {
  const db = await indexedDBManager.openDatabase({
    name: DB_NAME,
    version: 1,
    stores: [{ name: STORE_NAME, keyPath: "fileId" }],
  });
  return new Promise((resolve, reject) => {
    const request = db
      .transaction([STORE_NAME], "readonly")
      .objectStore(STORE_NAME)
      .getAll();
    request.onsuccess = () =>
      resolve((request.result ?? []) as Record<string, unknown>[]);
    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => {
  getStirlingFileStub.mockReset().mockResolvedValue(null);
  getStirlingFiles.mockReset().mockResolvedValue([]);
  post.mockReset().mockResolvedValue({ status: 200, data: new Blob() });
  await indexedDBManager.deleteDatabase(DB_NAME);
});

describe("the retry stash", () => {
  it("gives back what was stashed, keyed on the file the failure was filed against", async () => {
    await stashRetryPayload(
      payload({ params: { onlyPages: "1-3" }, fileIds: ["f-1", "f-2"] }),
    );

    await expect(loadRetryPayload("f-1")).resolves.toEqual({
      operation: "remove-password",
      endpoint: "/api/v1/security/remove-password",
      params: { onlyPages: "1-3" },
      fileIds: ["f-1", "f-2"],
      multiFile: false,
      errorCode: "E004",
      recordedAt: 1_000,
    });
    // Every file in the run gets a record, so the bell can retry from any of them.
    await expect(loadRetryPayload("f-2")).resolves.toMatchObject({
      operation: "remove-password",
    });
  });

  it("has nothing for a file it never saw, or for no file at all", async () => {
    await stashRetryPayload(payload());

    await expect(loadRetryPayload("f-other")).resolves.toBeNull();
    await expect(loadRetryPayload(null)).resolves.toBeNull();
    await expect(loadRetryPayload("   ")).resolves.toBeNull();
  });

  it("keeps the most recent operation that failed on a file, matching the server's one-incident-per-file dedup", async () => {
    await stashRetryPayload(
      payload({ operation: "compress", endpoint: "/api/v1/misc/compress-pdf" }),
    );
    await stashRetryPayload(
      payload({ operation: "rotate", endpoint: "/api/v1/general/rotate-pdf" }),
    );

    await expect(loadRetryPayload("f-1")).resolves.toMatchObject({
      operation: "rotate",
      endpoint: "/api/v1/general/rotate-pdf",
    });
    expect(await storedRecords()).toHaveLength(1);
  });

  it("evicts the oldest once it is full, so it cannot grow for the lifetime of the origin", async () => {
    // One past the cap: the first failure stashed is the one that goes.
    for (let i = 0; i < 26; i += 1) {
      await stashRetryPayload(payload({ fileIds: [`f-${i}`], recordedAt: i }));
    }

    expect(await storedRecords()).toHaveLength(25);
    await expect(loadRetryPayload("f-0")).resolves.toBeNull();
    await expect(loadRetryPayload("f-25")).resolves.toMatchObject({
      operation: "remove-password",
    });
  });

  it("keeps a batch bigger than the cap whole, rather than dropping some of its files", async () => {
    // One failed multi-file run writes a record per file under one recordedAt, so evicting by
    // time alone would keep an arbitrary 25 of them and offer no retry for the rest.
    const batch = Array.from({ length: 30 }, (_, i) => `b-${i}`);
    await stashRetryPayload(payload({ fileIds: batch, recordedAt: 100 }));

    expect(await storedRecords()).toHaveLength(30);
    for (const fileId of [batch[0], batch[15], batch[29]]) {
      await expect(loadRetryPayload(fileId)).resolves.toMatchObject({
        operation: "remove-password",
      });
    }
  });

  it("evicts earlier failures before the batch that just landed", async () => {
    await stashRetryPayload(payload({ fileIds: ["old"], recordedAt: 1 }));
    const batch = Array.from({ length: 25 }, (_, i) => `n-${i}`);

    await stashRetryPayload(payload({ fileIds: batch, recordedAt: 2 }));

    // The row on screen is the new one, so it is the older unrelated stash that goes.
    await expect(loadRetryPayload("old")).resolves.toBeNull();
    await expect(loadRetryPayload("n-0")).resolves.toMatchObject({
      operation: "remove-password",
    });
  });

  it("forgets a file's stash once its failure is resolved", async () => {
    await stashRetryPayload(payload({ fileIds: ["f-1", "f-2"] }));

    await clearRetryPayload("f-1");

    await expect(loadRetryPayload("f-1")).resolves.toBeNull();
    // Per file: the other input's own row may still be open.
    await expect(loadRetryPayload("f-2")).resolves.toMatchObject({
      operation: "remove-password",
    });
  });

  it("stores no password, whichever field the tool submitted it in", async () => {
    await stashRetryPayload(
      payload({
        params: {
          password: "hunter2",
          newOwnerPassword: "hunter2",
          passphrase: "hunter2",
          apiToken: "hunter2",
          nested: { ownerPassword: "hunter2", keep: "yes" },
          keepThese: ["a", "b"],
        },
      }),
    );

    const stored = await storedRecords();
    expect(JSON.stringify(stored)).not.toContain("hunter2");
    // Scoped to params, since the tool this failure came from is itself called remove-password.
    expect(JSON.stringify(stored.map((record) => record.params))).not.toMatch(
      /pass(word|phrase)|token/i,
    );
    // The rest survive: without them a retry re-runs a different operation than the one that failed.
    expect((await loadRetryPayload("f-1"))?.params).toEqual({
      nested: { keep: "yes" },
      keepThese: ["a", "b"],
    });
  });

  it("stops descending into a pathologically deep object without exhausting the stack", async () => {
    // 5000 levels: enough to overflow an unbounded walk, and nothing a tool would ever submit.
    let deep: Record<string, unknown> = { bottom: "reached" };
    for (let i = 0; i < 5000; i++) deep = { down: deep };

    await expect(
      stashRetryPayload(payload({ params: { deep } })),
    ).resolves.toBeUndefined();
    expect(await loadRetryPayload("f-1")).not.toBeNull();
  });

  it("drops a secret sitting just past the depth limit rather than passing the subtree through", async () => {
    // Only a little past the limit: a far deeper object would fail to store and pass vacuously.
    let past: Record<string, unknown> = { password: "hunter2" };
    for (let i = 0; i < 25; i++) past = { down: past };

    await stashRetryPayload(payload({ params: { past } }));

    // Where the walk gives up it must not hand back a subtree it never examined.
    expect(JSON.stringify(await storedRecords())).not.toContain("hunter2");
  });

  it("survives a cycle in the parameters", async () => {
    // A depth bound is what saves this: a cycle has no leaves to reach.
    const cyclic: Record<string, unknown> = { keep: "yes" };
    cyclic.self = cyclic;

    await expect(
      stashRetryPayload(payload({ params: { cyclic } })),
    ).resolves.toBeUndefined();
    expect(await loadRetryPayload("f-1")).not.toBeNull();
  });
});

describe("hasLocalFile", () => {
  it("is false once the document has left this browser", async () => {
    getStirlingFileStub.mockResolvedValue(null);

    await expect(hasLocalFile("f-1")).resolves.toBe(false);
    await expect(hasLocalFile(null)).resolves.toBe(false);
  });

  it("is true while the document is still stored here", async () => {
    getStirlingFileStub.mockResolvedValue({ id: "f-1", name: "doc.pdf" });

    await expect(hasLocalFile("f-1")).resolves.toBe(true);
  });
});

describe("retryWithPassword", () => {
  it("reports the file is gone instead of throwing, which is an expected outcome here", async () => {
    getStirlingFiles.mockResolvedValue([]);

    const result = await retryWithPassword(payload(), "hunter2");

    expect(result.ok).toBe(false);
    // The reason, not words: the component layer owns the wording, having `t`.
    expect(result.reason).toBe("fileMissing");
    expect(post).not.toHaveBeenCalled();
  });

  it("re-submits the stashed operation with the password added", async () => {
    getStirlingFiles.mockResolvedValue([
      new File(["%PDF-1.7"], "doc.pdf", { type: "application/pdf" }),
    ]);

    const result = await retryWithPassword(
      payload({ params: { onlyPages: "1-3" } }),
      "hunter2",
    );

    expect(result.ok).toBe(true);
    const [path, formData] = post.mock.calls[0] as [string, FormData];
    expect(path).toBe("/api/v1/security/remove-password");
    expect(formData.get("password")).toBe("hunter2");
    expect(formData.get("onlyPages")).toBe("1-3");
    expect(formData.get("fileInput")).toBeInstanceOf(File);
    // The password was used for the one call and nothing else.
    expect(JSON.stringify(await storedRecords())).not.toContain("hunter2");
  });

  it("hands the output back, since a retry the user cannot see the result of is no retry", async () => {
    getStirlingFiles.mockResolvedValue([new File(["%PDF-1.7"], "doc.pdf")]);
    const unlocked = new Blob(["unlocked"]);
    post.mockResolvedValue({
      data: unlocked,
      headers: {
        "content-disposition": 'attachment; filename="doc_unlocked.pdf"',
      },
    });

    const result = await retryWithPassword(payload(), "hunter2");

    expect(result.ok).toBe(true);
    expect(result.files).toHaveLength(1);
    expect(result.files?.[0].filename).toBe("doc_unlocked.pdf");
    // The response body itself, so the caller adopts the bytes the server sent.
    expect(result.files?.[0].blob).toBe(unlocked);
  });

  it("names the output after its input when the server sent no filename", async () => {
    getStirlingFiles.mockResolvedValue([new File(["%PDF-1.7"], "doc.pdf")]);
    post.mockResolvedValue({ data: new Blob(["unlocked"]), headers: {} });

    const result = await retryWithPassword(payload(), "hunter2");

    expect(result.files?.[0].filename).toBe("doc.pdf");
  });

  it("returns the server's own message when the retry fails again", async () => {
    getStirlingFiles.mockResolvedValue([new File(["%PDF-1.7"], "doc.pdf")]);
    post.mockRejectedValue({
      response: { data: "The password is incorrect." },
      message: "Request failed with status code 400",
    });

    const result = await retryWithPassword(payload(), "hunter2");

    expect(result.ok).toBe(false);
    expect(result.message).toBe("The password is incorrect.");
    expect(result.message).not.toContain("hunter2");
  });
});

/** The unlock for a failure with no stash behind it: fixed endpoint, no payload. */
describe("unlockLocalDocument", () => {
  it("removes the password from the document this browser holds, and stores nothing", async () => {
    getStirlingFiles.mockResolvedValue([
      new File(["%PDF-1.7"], "locked.pdf", { type: "application/pdf" }),
    ]);
    post.mockResolvedValue({
      data: new Blob(["unlocked"]),
      headers: {
        "content-disposition": 'attachment; filename="locked_unlocked.pdf"',
      },
    });

    const result = await unlockLocalDocument("f-1", "hunter2");

    const [path, formData] = post.mock.calls[0] as [string, FormData];
    expect(path).toBe("/api/v1/security/remove-password");
    expect(formData.get("password")).toBe("hunter2");
    expect(formData.get("fileInput")).toBeInstanceOf(File);
    expect(result.files?.[0].filename).toBe("locked_unlocked.pdf");
    // The password was used for the one call and nothing else: no stash is written here at all.
    expect(await storedRecords()).toHaveLength(0);
  });

  it("reports the document is gone instead of posting a password nowhere", async () => {
    getStirlingFiles.mockResolvedValue([]);

    const result = await unlockLocalDocument("f-1", "hunter2");

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("fileMissing");
    expect(post).not.toHaveBeenCalled();
  });

  it("returns the server's own message when the password is wrong", async () => {
    getStirlingFiles.mockResolvedValue([new File(["%PDF-1.7"], "locked.pdf")]);
    post.mockRejectedValue({
      response: { data: "The password is incorrect." },
      message: "Request failed with status code 400",
    });

    const result = await unlockLocalDocument("f-1", "wrong");

    expect(result.ok).toBe(false);
    expect(result.message).toBe("The password is incorrect.");
    expect(result.message).not.toContain("wrong");
  });
});
