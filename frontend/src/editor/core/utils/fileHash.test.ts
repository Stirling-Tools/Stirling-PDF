import { describe, expect, it } from "vitest";
import { FileHasher } from "@editor/utils/fileHash";

function makeFile(name = "test.pdf", content = "hello"): File {
  return new File([content], name, { type: "application/pdf" });
}

describe("FileHasher.generateHybridHash", () => {
  it("reuses the cached promise for the same File object", async () => {
    const file = makeFile();

    const first = FileHasher.generateHybridHash(file);
    const second = FileHasher.generateHybridHash(file);

    expect(second).toBe(first);
    await expect(first).resolves.toBe(await second);
  });

  it("computes independently for distinct File objects", () => {
    const first = FileHasher.generateHybridHash(makeFile("a.pdf", "a"));
    const second = FileHasher.generateHybridHash(makeFile("b.pdf", "b"));

    expect(second).not.toBe(first);
  });

  it("does not cache failures", async () => {
    const unreadable = {
      name: "broken.pdf",
      size: 2 * 1024 * 1024,
      lastModified: 0,
      type: "application/pdf",
      slice: () => {
        throw new Error("read failed");
      },
    } as unknown as File;

    const first = FileHasher.generateHybridHash(unreadable);
    await expect(first).rejects.toThrow("read failed");

    const second = FileHasher.generateHybridHash(unreadable);
    expect(second).not.toBe(first);
    await expect(second).rejects.toThrow("read failed");
  });
});
