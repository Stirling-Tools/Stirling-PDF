import { beforeEach, describe, expect, test, vi } from "vitest";
import "fake-indexeddb/auto";
import { expectConsole } from "@app/tests/failOnConsole";
import type { StirlingFileStub } from "@app/types/fileContext";

vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));

// The blob-value verdict persists in localStorage, so each test starts undecided.
beforeEach(() => localStorage.clear());

async function freshFileStorage() {
  vi.resetModules();
  const [{ fileStorage }, { createStirlingFile, createNewStirlingFileStub }] =
    await Promise.all([
      import("@app/services/fileStorage"),
      import("@app/types/fileContext"),
    ]);
  const makeFile = (
    name: string,
    stubOverrides?: Partial<StirlingFileStub>,
  ) => {
    const file = new File(["%PDF-1.7 stirling"], name, {
      type: "application/pdf",
    });
    const stub = { ...createNewStirlingFileStub(file), ...stubOverrides };
    return { file: createStirlingFile(file, stub.id), stub };
  };
  return { fileStorage, makeFile };
}

describe("persistVersionedOutputs - the chain always keeps a leaf", () => {
  test("stores the output before retiring the input", async () => {
    const { fileStorage, makeFile } = await freshFileStorage();
    const input = makeFile("in.pdf");
    await fileStorage.storeStirlingFile(input.file, input.stub);
    const output = makeFile("out.pdf", {
      versionNumber: 2,
      originalFileId: input.stub.id,
      parentFileId: input.stub.id,
    });
    const calls: string[] = [];
    const store = fileStorage.storeStirlingFile.bind(fileStorage);
    const mark = fileStorage.markFileAsProcessed.bind(fileStorage);
    vi.spyOn(fileStorage, "storeStirlingFile").mockImplementation((f, s) => {
      calls.push("store");
      return store(f, s);
    });
    vi.spyOn(fileStorage, "markFileAsProcessed").mockImplementation((id) => {
      calls.push("mark");
      return mark(id);
    });

    await fileStorage.persistVersionedOutputs(
      [input.stub.id],
      [output.file],
      [output.stub],
    );

    expect(calls).toEqual(["store", "mark"]);
    expect((await fileStorage.getStirlingFileStub(input.stub.id))?.isLeaf).toBe(
      false,
    );
    expect(
      (await fileStorage.getStirlingFileStub(output.stub.id))?.isLeaf,
    ).toBe(true);
  });

  test("keeps the input a leaf when the output fails to store", async () => {
    expectConsole.error(/Failed to persist output file to storage/);
    const { fileStorage, makeFile } = await freshFileStorage();
    const input = makeFile("in.pdf");
    await fileStorage.storeStirlingFile(input.file, input.stub);
    const output = makeFile("out.pdf", {
      versionNumber: 2,
      originalFileId: input.stub.id,
      parentFileId: input.stub.id,
    });
    vi.spyOn(fileStorage, "storeStirlingFile").mockRejectedValueOnce(
      new DOMException("quota", "QuotaExceededError"),
    );

    await fileStorage.persistVersionedOutputs(
      [input.stub.id],
      [output.file],
      [output.stub],
    );

    expect((await fileStorage.getStirlingFileStub(input.stub.id))?.isLeaf).toBe(
      true,
    );
  });
});
