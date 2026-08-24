import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  originalIdOf,
  readWorkbenchSession,
  writeWorkbenchSession,
  saveEditorReturnPath,
  takeEditorReturnPath,
  isSeedableView,
  clearWorkbenchSession,
  suspendWorkbenchSession,
  resumeWorkbenchSession,
} from "@app/services/workbenchSession";
import type { StirlingFileStub } from "@app/types/fileContext";

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
  it("is consumed by the first take", () => {
    saveEditorReturnPath("/compress?x=1");
    expect(takeEditorReturnPath()).toBe("/compress?x=1");
    expect(takeEditorReturnPath()).toBeNull();
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
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    writeWorkbenchSession({ fileIds: ["new"], selectedFileIds: [] });
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

  it("refuses to rewrite a signed-in workbench as anonymous", () => {
    // Every sign-out path ends in a teardown flush with no user attached - including the ones
    // that never call suspend (SaaS signs out straight from the settings modal).
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

    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
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

  it("leaves URL-owned and tool-owned views alone", () => {
    // HomePage pins myFiles to /files and bounces it elsewhere; custom views belong to a tool.
    expect(isSeedableView("myFiles")).toBe(false);
    expect(isSeedableView("custom:compare")).toBe(false);
    expect(isSeedableView(undefined)).toBe(false);
  });
});
