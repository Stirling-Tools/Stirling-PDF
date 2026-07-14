import { describe, expect, test, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";

// Stub ONLY the Tauri OS boundary. Everything below (real fileStorage on a real
// IndexedDB, the real desktop desktopFileLink seam, the real pruner) runs for
// real, so this exercises the full disk-linked-recents chain end to end.
const { existsByPath, invoke } = vi.hoisted(() => ({
  existsByPath: new Map<string, boolean>(),
  invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === "path_exists") {
      return existsByPath.get(args?.path as string) ?? false;
    }
    throw new Error(`unexpected command ${cmd}`);
  }),
}));
vi.mock("@tauri-apps/api/core", async (importActual) => {
  const actual = await importActual<typeof import("@tauri-apps/api/core")>();
  return { ...actual, isTauri: () => true, invoke };
});

import { fileStorage } from "@app/services/fileStorage";
import {
  pruneMissingRecentFiles,
  reconcileServerBackedRecents,
} from "@app/services/pruneMissingRecentFiles";
import {
  createStirlingFile,
  type StirlingFileStub,
} from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

async function storeFile(
  id: string,
  overrides: Partial<StirlingFileStub> = {},
): Promise<void> {
  const file = new File([`data-${id}`], `${id}.pdf`, {
    type: "application/pdf",
  });
  const stirlingFile = createStirlingFile(file, id as FileId);
  const stub: StirlingFileStub = {
    id: id as FileId,
    name: `${id}.pdf`,
    type: "application/pdf",
    size: file.size,
    lastModified: 0,
    quickKey: stirlingFile.quickKey,
    isLeaf: true,
    originalFileId: id,
    versionNumber: 1,
    ...overrides,
  };
  await fileStorage.storeStirlingFile(stirlingFile, stub);
}

beforeEach(async () => {
  existsByPath.clear();
  invoke.mockClear();
  // fake-indexeddb persists within a run; wipe the store for test isolation.
  const all = await fileStorage.getAllStirlingFileStubs();
  if (all.length > 0) {
    await fileStorage.deleteMultipleStirlingFiles(all.map((s) => s.id));
  }
});

describe("desktop recent files ↔ disk link (real storage + seam)", () => {
  test("localFilePath round-trips through IndexedDB", async () => {
    await storeFile("rt", { localFilePath: "/docs/rt.pdf" });

    const stubs = await fileStorage.getLeafStirlingFileStubs();
    const loaded = stubs.find((s) => s.id === "rt");

    // Regression: before persisting localFilePath in the record, this was
    // undefined after a reload and the whole feature was inert.
    expect(loaded?.localFilePath).toBe("/docs/rt.pdf");
  });

  test("localFilePath applied post-store (OS open-with / drag-drop path) persists", async () => {
    // useAppInitialization stores the opened file first, then applies the disk
    // path via updateFileMetadata — this is the drag-drop / "open with" path.
    await storeFile("dragged");
    await fileStorage.updateFileMetadata("dragged" as FileId, {
      localFilePath: "/docs/dragged.pdf",
    });

    const stubs = await fileStorage.getLeafStirlingFileStubs();
    expect(stubs.find((s) => s.id === "dragged")?.localFilePath).toBe(
      "/docs/dragged.pdf",
    );
  });

  test("prunes a recent whose disk file is gone and deletes it from storage", async () => {
    await storeFile("gone", { localFilePath: "/docs/gone.pdf" });
    await storeFile("kept", { localFilePath: "/docs/kept.pdf" });
    existsByPath.set("/docs/gone.pdf", false);
    existsByPath.set("/docs/kept.pdf", true);

    const stubs = await fileStorage.getLeafStirlingFileStubs();
    const survivors = await pruneMissingRecentFiles(stubs);

    expect(survivors.map((s) => s.id).sort()).toEqual(["kept"]);
    // Really removed from IndexedDB, not just filtered from the array.
    expect(await fileStorage.getStirlingFileStub("gone" as FileId)).toBeNull();
    expect(
      await fileStorage.getStirlingFileStub("kept" as FileId),
    ).not.toBeNull();
    expect(invoke).toHaveBeenCalledWith("path_exists", {
      path: "/docs/gone.pdf",
    });
  });

  test("prune leaves server-backed files alone (server reconciliation owns them)", async () => {
    await storeFile("onserver", {
      localFilePath: "/docs/onserver.pdf",
      remoteStorageId: 42,
    });
    existsByPath.set("/docs/onserver.pdf", false);

    const survivors = await pruneMissingRecentFiles(
      await fileStorage.getLeafStirlingFileStubs(),
    );

    // Untouched by the pre-fetch prune: still present, link intact.
    expect(survivors.find((s) => s.id === "onserver")?.localFilePath).toBe(
      "/docs/onserver.pdf",
    );
    expect(
      await fileStorage.getStirlingFileStub("onserver" as FileId),
    ).not.toBeNull();
  });

  test("demotes a server-confirmed file whose disk original is gone (removed locally, kept on server)", async () => {
    await storeFile("onserver", {
      localFilePath: "/docs/onserver.pdf",
      remoteStorageId: 42,
    });
    existsByPath.set("/docs/onserver.pdf", false);

    const removed = await reconcileServerBackedRecents(
      await fileStorage.getLeafStirlingFileStubs(),
      (id) => id === 42, // server confirms it holds file 42
    );

    expect(removed).toEqual(["onserver"]);
    // Local copy really removed from IndexedDB — it becomes a pure server file
    // (shown under My Files, downloadable), so nothing is lost.
    expect(
      await fileStorage.getStirlingFileStub("onserver" as FileId),
    ).toBeNull();
  });

  test("does NOT demote a server-backed file the server can't confirm (no data loss)", async () => {
    await storeFile("stale", {
      localFilePath: "/docs/stale.pdf",
      remoteStorageId: 99,
    });
    existsByPath.set("/docs/stale.pdf", false);

    const removed = await reconcileServerBackedRecents(
      await fileStorage.getLeafStirlingFileStubs(),
      () => false, // server no longer has it
    );

    expect(removed).toEqual([]);
    // Local copy preserved — it may be the only remaining copy.
    expect(
      await fileStorage.getStirlingFileStub("stale" as FileId),
    ).not.toBeNull();
  });

  test("keeps an in-app-edited file whose disk path is gone, detaching the dead link", async () => {
    // A v2 with tool history: its edited bytes live only in IndexedDB once the
    // disk file is gone, so it must be KEPT (not deleted) — just detached.
    await storeFile("edited", {
      localFilePath: "/docs/edited.pdf",
      versionNumber: 2,
      toolHistory: [{ toolId: "compress" as never, timestamp: 1 }],
    });
    existsByPath.set("/docs/edited.pdf", false);

    const survivors = await pruneMissingRecentFiles(
      await fileStorage.getLeafStirlingFileStubs(),
    );

    expect(survivors.some((s) => s.id === "edited")).toBe(true);
    const stored = await fileStorage.getStirlingFileStub("edited" as FileId);
    expect(stored).not.toBeNull();
    expect(stored?.localFilePath).toBeUndefined();
  });

  test("leaves web/browser-uploaded files (no disk link) untouched", async () => {
    // Files added via the <input type=file> fallback have no localFilePath, so
    // they are never disk-checked, detached, or pruned.
    await storeFile("weblink");
    existsByPath.set("/docs/anything.pdf", false);

    const survivors = await pruneMissingRecentFiles(
      await fileStorage.getLeafStirlingFileStubs(),
    );

    expect(survivors.some((s) => s.id === "weblink")).toBe(true);
    expect(
      await fileStorage.getStirlingFileStub("weblink" as FileId),
    ).not.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});
