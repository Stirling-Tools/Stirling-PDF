import { describe, expect, test, vi } from "vitest";
import "fake-indexeddb/auto";

vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));

describe("getLeafStubsNamed", () => {
  test("returns the leaf records stored under the name, and no other", async () => {
    const [{ fileStorage }, { createStirlingFile, createNewStirlingFileStub }] =
      await Promise.all([
        import("@app/services/fileStorage"),
        import("@app/types/fileContext"),
      ]);
    const store = async (name: string, isLeaf = true) => {
      const file = new File(["%PDF-1.7"], name, { type: "application/pdf" });
      const stub = { ...createNewStirlingFileStub(file), isLeaf };
      await fileStorage.storeStirlingFile(
        createStirlingFile(file, stub.id),
        stub,
      );
      return stub.id;
    };

    const first = await store("report.pdf");
    const second = await store("report.pdf");
    await store("report.pdf", false);
    await store("other.pdf");

    const found = await fileStorage.getLeafStubsNamed("report.pdf");
    expect(found.map((stub) => stub.id).sort()).toEqual([first, second].sort());
    expect(await fileStorage.getLeafStubsNamed("missing.pdf")).toEqual([]);
  });
});
