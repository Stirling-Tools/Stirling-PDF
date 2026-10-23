import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  originalIdOf,
  readViewedPage,
  readWorkbenchSession,
  writeWorkbenchSession,
  saveEditorReturnPath,
  takeEditorReturnPath,
  isSeedableView,
  clearWorkbenchSession,
  suspendWorkbenchSession,
  resumeWorkbenchSession,
  writeViewedPage,
} from "@editor/services/workbenchSession";
import type { StirlingFileStub } from "@editor/types/fileContext";

const SESSION_KEY = "stirling.workbench.session";

beforeEach(() => {
  sessionStorage.clear();
  resumeWorkbenchSession();
});

describe("workbench session record", () => {
  it("round-trips the open files and selection", () => {
    writeWorkbenchSession({ fileIds: ["a", "b"], selectedFileIds: ["b"] });
    expect(readWorkbenchSession()).toMatchObject({
      fileIds: ["a", "b"],
      selectedFileIds: ["b"],
    });
  });

  it("returns null when nothing was recorded", () => {
    expect(readWorkbenchSession()).toBeNull();
  });

  it("rejects a malformed record instead of throwing", () => {
    sessionStorage.setItem(SESSION_KEY, "not json");
    expect(readWorkbenchSession()).toBeNull();
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ v: 2, fileIds: "nope" }),
    );
    expect(readWorkbenchSession()).toBeNull();
  });

  it("drops non-string ids and defaults a missing selection", () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ v: 2, fileIds: ["a", 7, null, "b"] }),
    );
    expect(readWorkbenchSession()).toMatchObject({
      fileIds: ["a", "b"],
      selectedFileIds: [],
    });
  });
});

describe("editor return path", () => {
  it("captures the live address bar and is consumed by the first take", () => {
    // The editor writes its tool route via raw history.pushState, so the save
    // must read window.location, not a lagging router location.
    window.history.pushState({}, "", "/compress?x=1");
    saveEditorReturnPath();
    expect(takeEditorReturnPath()).toBe("/compress?x=1");
    expect(takeEditorReturnPath()).toBeNull();
    window.history.pushState({}, "", "/");
  });
});

describe("originalIdOf", () => {
  it("prefers the original id and falls back to the file id", () => {
    expect(
      originalIdOf({ id: "v3", originalFileId: "root" } as StirlingFileStub),
    ).toBe("root");
    expect(
      originalIdOf({ id: "v1", originalFileId: "" } as StirlingFileStub),
    ).toBe("v1");
  });
});

describe("record hygiene", () => {
  it("discards a record written by an older schema", () => {
    // No version stamp: a shape this build no longer understands.
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ fileIds: ["a"], selectedFileIds: [] }),
    );
    expect(readWorkbenchSession()).toBeNull();

    // v1 recorded userId before it meant anything, so those must go too rather than
    // look like a workbench that legitimately belongs to an anonymous session.
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        v: 1,
        fileIds: ["a"],
        selectedFileIds: [],
        userId: null,
      }),
    );
    expect(readWorkbenchSession()).toBeNull();
  });

  it("drops the previous record when a write fails, rather than leaving it stale", () => {
    writeWorkbenchSession({ fileIds: ["old"], selectedFileIds: [] });
    const setItem = vi
      .spyOn(Object.getPrototypeOf(sessionStorage), "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    writeWorkbenchSession({ fileIds: ["new"], selectedFileIds: [] });
    expect(setItem).toHaveBeenCalledOnce();
    setItem.mockRestore();

    // Better to restore nothing than to restore a workbench the user has moved on from.
    expect(readWorkbenchSession()).toBeNull();
  });

  it("records who the workbench belonged to", () => {
    writeWorkbenchSession({
      fileIds: ["a"],
      selectedFileIds: [],
      userId: "user-1",
    });
    expect(readWorkbenchSession()?.userId).toBe("user-1");
  });

  it("stays gone after sign-out, even though the teardown writes once more", () => {
    writeWorkbenchSession({ fileIds: ["a", "b"], selectedFileIds: [] });

    suspendWorkbenchSession();
    // Signing out unmounts the editor, whose flush writes the workbench one last time -
    // with no user attached. Clearing alone let that recreate the record.
    writeWorkbenchSession({
      fileIds: ["a", "b"],
      selectedFileIds: [],
      userId: null,
    });

    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("keeps the owner when the identity is momentarily unknown", () => {
    // A sign-out teardown and a failed /auth/me both write with no user attached. Losing the
    // owner here would make the record unrestorable for the person it belongs to.
    writeWorkbenchSession({
      fileIds: ["a", "b"],
      selectedFileIds: [],
      userId: "user-a",
    });

    writeWorkbenchSession({
      fileIds: ["a", "b"],
      selectedFileIds: [],
      userId: null,
    });

    expect(readWorkbenchSession()?.userId).toBe("user-a");
  });

  it("remembers the page per file, and forgets it on page 1", () => {
    writeViewedPage("a", 7);
    writeViewedPage("b", 3);
    writeViewedPage("b", 1);

    expect(readViewedPage("a")).toBe(7);
    expect(readViewedPage("b")).toBeNull();
  });

  it("keeps the pages when the workbench is written without them", () => {
    writeViewedPage("a", 7);
    writeWorkbenchSession({ fileIds: ["b"], selectedFileIds: [] });

    expect(readViewedPage("a")).toBe(7);
  });

  it("evicts the least recently read page once full", () => {
    for (let i = 0; i < 200; i++) writeViewedPage(`file-${i}`, 2);
    writeViewedPage("file-0", 5);
    writeViewedPage("newest", 4);

    expect(readViewedPage("file-1")).toBeNull();
    expect(readViewedPage("file-0")).toBe(5);
    expect(readViewedPage("newest")).toBe(4);
  });

  it("treats refused storage as no remembered page instead of throwing", () => {
    const storage = Object.getPrototypeOf(sessionStorage);
    const refuse = () => {
      throw new Error("SecurityError");
    };
    const spies = [
      vi.spyOn(storage, "getItem").mockImplementation(refuse),
      vi.spyOn(storage, "setItem").mockImplementation(refuse),
      vi.spyOn(storage, "removeItem").mockImplementation(refuse),
    ];

    expect(() => writeViewedPage("a", 7)).not.toThrow();
    expect(readViewedPage("a")).toBeNull();

    for (const spy of spies) spy.mockRestore();
  });

  it("ignores a stored page that is not a page number", () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        v: 2,
        fileIds: [],
        pages: { a: 0, b: -3, c: 2.5, d: "4", e: 6 },
      }),
    );

    expect(["a", "b", "c", "d"].map(readViewedPage)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(readViewedPage("e")).toBe(6);
  });

  it("still records for a genuinely anonymous session", () => {
    // Core has no auth at all, so null is the normal owner there and must keep working.
    writeWorkbenchSession({
      fileIds: ["a"],
      selectedFileIds: [],
      userId: null,
    });
    expect(readWorkbenchSession()?.fileIds).toEqual(["a"]);
  });

  it("records again once a new editor session starts", () => {
    suspendWorkbenchSession();
    resumeWorkbenchSession();
    writeWorkbenchSession({ fileIds: ["a"], selectedFileIds: [] });
    expect(readWorkbenchSession()?.fileIds).toEqual(["a"]);
  });

  it("clears on request", () => {
    writeWorkbenchSession({ fileIds: ["a"], selectedFileIds: [] });
    clearWorkbenchSession();
    expect(readWorkbenchSession()).toBeNull();
  });
});

describe("views the restore may reopen", () => {
  it("accepts the workbench views a session can land on", () => {
    expect(isSeedableView("viewer")).toBe(true);
    expect(isSeedableView("fileEditor")).toBe(true);
    expect(isSeedableView("pageEditor")).toBe(true);
  });

  it("leaves path-seeded and tool-owned views alone", () => {
    // The library arrives with the path that names the folder; custom views belong to a tool.
    expect(isSeedableView("myFiles")).toBe(false);
    expect(isSeedableView("custom:compare")).toBe(false);
    expect(isSeedableView(undefined)).toBe(false);
  });
});
