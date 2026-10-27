import { describe, expect, test, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { expectConsole } from "@editor/tests/failOnConsole";
import type { FileId } from "@editor/types/file";
import type { StirlingFile, StirlingFileStub } from "@editor/types/fileContext";

/**
 * Listings show only leaves, so a version chain whose every record is non-leaf
 * cannot be opened again. persistVersionedOutputs must never hide an input
 * until its replacement is durably stored.
 */

async function freshFileStorage() {
  vi.resetModules();
  const [{ fileStorage }, { createStirlingFile, createNewStirlingFileStub }] =
    await Promise.all([
      import("@editor/services/fileStorage"),
      import("@editor/types/fileContext"),
    ]);
  await fileStorage.clearAll();

  const pdf = (name: string) =>
    new File(["%PDF-1.7 stirling"], name, { type: "application/pdf" });

  const storeOriginal = async (name: string) => {
    const file = pdf(name);
    const stub = createNewStirlingFileStub(file);
    await fileStorage.storeStirlingFile(
      createStirlingFile(file, stub.id),
      stub,
    );
    return stub;
  };

  const nextVersion = (
    parent: StirlingFileStub,
  ): { file: StirlingFile; stub: StirlingFileStub } => {
    const file = pdf(`v2-${parent.name}`);
    const stub: StirlingFileStub = {
      ...createNewStirlingFileStub(file),
      versionNumber: (parent.versionNumber ?? 1) + 1,
      parentFileId: parent.id,
      originalFileId: parent.originalFileId ?? parent.id,
    };
    return { file: createStirlingFile(file, stub.id), stub };
  };

  const leafIds = async () =>
    (await fileStorage.getLeafStirlingFileStubs()).map((s) => s.id).sort();

  return { fileStorage, storeOriginal, nextVersion, leafIds };
}

/** Fail the store of one output, delegating every other write to the real one. */
function failStoreFor(
  fileStorage: Awaited<ReturnType<typeof freshFileStorage>>["fileStorage"],
  failingId: FileId,
) {
  const realStore = fileStorage.storeStirlingFile.bind(fileStorage);
  vi.spyOn(fileStorage, "storeStirlingFile").mockImplementation((file, stub) =>
    file.fileId === failingId
      ? Promise.reject(new DOMException("disk full", "QuotaExceededError"))
      : realStore(file, stub),
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("persistVersionedOutputs — leaf state", () => {
  test("a stored output becomes the only leaf of its chain", async () => {
    const { fileStorage, storeOriginal, nextVersion, leafIds } =
      await freshFileStorage();
    const input = await storeOriginal("doc.pdf");
    const output = nextVersion(input);

    await fileStorage.persistVersionedOutputs(
      [input.id],
      [output.file],
      [output.stub],
    );

    expect(await leafIds()).toEqual([output.stub.id]);
  });

  test("a failed output store leaves its input a leaf", async () => {
    expectConsole.error(/Failed to persist output file to storage/);
    const { fileStorage, storeOriginal, nextVersion, leafIds } =
      await freshFileStorage();
    const input = await storeOriginal("doc.pdf");
    const output = nextVersion(input);
    failStoreFor(fileStorage, output.stub.id);

    await fileStorage.persistVersionedOutputs(
      [input.id],
      [output.file],
      [output.stub],
    );

    expect(await leafIds()).toEqual([input.id]);
    expect((await fileStorage.getStirlingFileStub(input.id))?.isLeaf).not.toBe(
      false,
    );
  });

  test("only the input whose output failed stays a leaf", async () => {
    expectConsole.error(/Failed to persist output file to storage/);
    const { fileStorage, storeOriginal, nextVersion, leafIds } =
      await freshFileStorage();
    const a = await storeOriginal("a.pdf");
    const b = await storeOriginal("b.pdf");
    const aOut = nextVersion(a);
    const bOut = nextVersion(b);
    failStoreFor(fileStorage, bOut.stub.id);

    await fileStorage.persistVersionedOutputs(
      [a.id, b.id],
      [aOut.file, bOut.file],
      [aOut.stub, bOut.stub],
    );

    expect(await leafIds()).toEqual([aOut.stub.id, b.id].sort());
  });

  test("an input stays a leaf while its output write is still pending", async () => {
    const { fileStorage, storeOriginal, nextVersion, leafIds } =
      await freshFileStorage();
    const input = await storeOriginal("doc.pdf");
    const output = nextVersion(input);
    // A write that never settles stands in for the app dying mid-write.
    vi.spyOn(fileStorage, "storeStirlingFile").mockReturnValue(
      new Promise(() => {}),
    );
    const markSpy = vi.spyOn(fileStorage, "markFileAsProcessed");

    void fileStorage.persistVersionedOutputs(
      [input.id],
      [output.file],
      [output.stub],
    );

    expect(await leafIds()).toEqual([input.id]);
    expect(markSpy).not.toHaveBeenCalled();
  });

  test("v1 outputs never hide their inputs", async () => {
    const { fileStorage, storeOriginal, leafIds } = await freshFileStorage();
    const { createStirlingFile, createNewStirlingFileStub } =
      await import("@editor/types/fileContext");
    const input = await storeOriginal("doc.pdf");
    const converted = new File(["converted"], "doc.docx");
    const stub = createNewStirlingFileStub(converted);

    await fileStorage.persistVersionedOutputs(
      [input.id],
      [createStirlingFile(converted, stub.id)],
      [stub],
    );

    expect(await leafIds()).toEqual([input.id, stub.id].sort());
  });
});
