import { describe, expect, it } from "vitest";
import type { FileId } from "@app/types/file";
import type {
  FileContextState,
  StirlingFileStub,
} from "@app/types/fileContext";
import { selectThumbnailEvictionIds } from "@app/contexts/file/lifecycle";

const THUMB = (bytes: number) => `data:image/png;base64,${"a".repeat(bytes)}`;

const fid = (s: string): FileId => s as FileId;

function stub(id: string, thumbBytes: number, blob = false): StirlingFileStub {
  return {
    id: fid(id),
    thumbnailUrl: blob ? "blob:thumb" : THUMB(thumbBytes),
    processedFile: {
      totalPages: 1,
      pages: [
        {
          pageNumber: 1,
          thumbnail: THUMB(thumbBytes),
          rotation: 0,
          splitBefore: false,
        },
      ],
      thumbnailUrl: THUMB(thumbBytes),
      lastProcessed: 0,
    },
  } as StirlingFileStub;
}

function state(
  ids: FileId[],
  opts?: { pinned?: string[]; selected?: string[] },
) {
  const byId: Record<string, StirlingFileStub> = {};
  for (const id of ids) {
    byId[id] = stub(id, 1_500_000);
  }
  return {
    files: {
      ids: ids,
      byId: byId,
    },
    pinnedFiles: new Set((opts?.pinned ?? []).map(fid)),
    ui: { selectedFileIds: (opts?.selected ?? []).map(fid) },
  } as FileContextState;
}

describe("selectThumbnailEvictionIds", () => {
  it("strips oldest unprotected stubs when over budget", () => {
    // ~4.5MB per stub x25 = ~112MB > 64MB cap.
    const ids = Array.from({ length: 25 }, (_, i) => fid(`f${i}`));
    const evict = selectThumbnailEvictionIds(state(ids));
    expect(evict.length).toBeGreaterThan(0);
    expect(evict[0]).toBe("f0");
    expect(evict).not.toContain("f24");
  });

  it("keeps pinned, selected and just-hydrated files", () => {
    const ids = Array.from({ length: 25 }, (_, i) => fid(`f${i}`));
    const evict = selectThumbnailEvictionIds(
      state(ids, { pinned: ["f0"], selected: ["f1"] }),
      fid("f2"),
    );
    expect(evict).not.toContain("f0");
    expect(evict).not.toContain("f1");
    expect(evict).not.toContain("f2");
    expect(evict[0]).toBe("f3");
  });

  it("is a no-op under budget", () => {
    expect(selectThumbnailEvictionIds(state([fid("a"), fid("b")]))).toEqual([]);
  });

  it("ignores cheap blob thumbnails", () => {
    const s = state([fid("a")]);
    (s.files.byId as Record<string, StirlingFileStub>)[fid("a")] = stub(
      "a",
      0,
      true,
    );
    expect(selectThumbnailEvictionIds(s)).toEqual([]);
  });
});
