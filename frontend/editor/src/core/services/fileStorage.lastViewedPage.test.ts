import { beforeEach, describe, expect, test, vi } from "vitest";
import "fake-indexeddb/auto";

vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));

async function freshFileStorage() {
  vi.resetModules();
  const [
    { fileStorage },
    { createStirlingFile, createNewStirlingFileStub },
    pages,
  ] = await Promise.all([
    import("@app/services/fileStorage"),
    import("@app/types/fileContext"),
    import("@app/services/lastViewedPageStore"),
  ]);
  const store = async (name: string) => {
    const file = createStirlingFile(
      new File(["%PDF-1.7 stirling"], name, { type: "application/pdf" }),
    );
    const stub = createNewStirlingFileStub(file, file.fileId);
    await fileStorage.storeStirlingFile(file, stub);
    pages.setLastViewedPage(file, 5);
    return file;
  };
  return { fileStorage, store, pages };
}

beforeEach(() => localStorage.clear());

describe("fileStorage deletes forget the last viewed page", () => {
  test("of a single deleted file, and no other", async () => {
    const { fileStorage, store, pages } = await freshFileStorage();
    const deleted = await store("deleted.pdf");
    const kept = await store("kept.pdf");

    await fileStorage.deleteStirlingFile(deleted.fileId);

    expect(pages.getLastViewedPage(deleted.quickKey)).toBeNull();
    expect(pages.getLastViewedPage(kept.quickKey)).toBe(5);
  });

  test("of every file in a batch", async () => {
    const { fileStorage, store, pages } = await freshFileStorage();
    const first = await store("first.pdf");
    const second = await store("second.pdf");

    await fileStorage.deleteMultipleStirlingFiles([
      first.fileId,
      second.fileId,
    ]);

    expect(pages.getLastViewedPage(first.quickKey)).toBeNull();
    expect(pages.getLastViewedPage(second.quickKey)).toBeNull();
  });
});
