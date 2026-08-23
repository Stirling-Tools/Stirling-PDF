import { describe, it, expect, beforeEach } from "vitest";
import {
  originalIdOf,
  readWorkbenchSession,
  writeWorkbenchSession,
  saveEditorReturnPath,
  takeEditorReturnPath,
  isSeedableView,
} from "@app/services/workbenchSession";
import type { StirlingFileStub } from "@app/types/fileContext";

const SESSION_KEY = "stirling.workbench.session";

beforeEach(() => sessionStorage.clear());

describe("workbench session record", () => {
  it("round-trips the open files and selection", () => {
    writeWorkbenchSession({ fileIds: ["a", "b"], selectedFileIds: ["b"] });
    expect(readWorkbenchSession()).toEqual({
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
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ fileIds: "nope" }));
    expect(readWorkbenchSession()).toBeNull();
  });

  it("drops non-string ids and defaults a missing selection", () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ fileIds: ["a", 7, null, "b"] }),
    );
    expect(readWorkbenchSession()).toEqual({
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
