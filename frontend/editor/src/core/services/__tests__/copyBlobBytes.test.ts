import { afterEach, describe, expect, test, vi } from "vitest";
import { copyBlobBytes } from "@app/services/fileStorage";

// WebKit can lose a File's backing store and then never answer a read at all. This is the
// fallback taken once IndexedDB refuses blob values, so an unanswered read here used to
// leave every caller awaiting the write forever.

/** A blob whose reads never settle — the lost-backing-store case. */
function unreadableBlob(): Blob {
  return {
    slice: () => ({ arrayBuffer: () => new Promise<ArrayBuffer>(() => {}) }),
    arrayBuffer: () => new Promise<ArrayBuffer>(() => {}),
  } as unknown as Blob;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("copyBlobBytes", () => {
  test("returns the bytes of a readable blob", async () => {
    await expect(copyBlobBytes(new Blob(["ab"]))).resolves.toEqual(
      await new Blob(["ab"]).arrayBuffer(),
    );
  });

  test("rejects rather than hanging when the read never answers", async () => {
    vi.useFakeTimers();

    const settled = vi.fn();
    const result = copyBlobBytes(unreadableBlob()).catch(settled);
    await vi.advanceTimersByTimeAsync(10_000);
    await result;

    expect(settled).toHaveBeenCalledWith(expect.any(Error));
  });

  test("surfaces a read that fails outright", async () => {
    const failing = {
      slice: () => ({
        arrayBuffer: () => Promise.reject(new Error("backing store gone")),
      }),
    } as unknown as Blob;

    await expect(copyBlobBytes(failing)).rejects.toThrow("backing store gone");
  });
});
