import { describe, expect, it } from "vitest";
import { getStartupNavigationAction } from "@app/utils/homePageNavigation";

describe("getStartupNavigationAction", () => {
  it("returns viewer + active index for 0->1 transition when not in fileEditor", () => {
    expect(getStartupNavigationAction(0, 1, null, "viewer")).toEqual({
      workbench: "viewer",
      activeFileIndex: 0,
    });
    expect(getStartupNavigationAction(0, 1, null, "pageEditor")).toEqual({
      workbench: "viewer",
      activeFileIndex: 0,
    });
  });

  it("returns fileEditor for 0->2+ transition when not in fileEditor", () => {
    expect(getStartupNavigationAction(0, 2, null, "viewer")).toEqual({
      workbench: "fileEditor",
    });
  });

  it("does not force navigation for pdfTextEditor or multiTool", () => {
    expect(
      getStartupNavigationAction(0, 1, "pdfTextEditor", "viewer"),
    ).toBeNull();
    expect(
      getStartupNavigationAction(0, 3, "pdfTextEditor", "viewer"),
    ).toBeNull();
    expect(
      getStartupNavigationAction(0, 1, "multiTool", "pageEditor"),
    ).toBeNull();
    expect(
      getStartupNavigationAction(0, 3, "multiTool", "pageEditor"),
    ).toBeNull();
  });

  it("does not navigate when file count decreases", () => {
    expect(getStartupNavigationAction(2, 1, null, "viewer")).toBeNull();
    expect(getStartupNavigationAction(3, 1, null, "fileEditor")).toBeNull();
  });

  it("navigates to last file when already in viewer and files are added", () => {
    expect(getStartupNavigationAction(1, 2, null, "viewer")).toEqual({
      workbench: "viewer",
      activeFileIndex: 1,
    });
    expect(getStartupNavigationAction(3, 5, null, "viewer")).toEqual({
      workbench: "viewer",
      activeFileIndex: 4,
    });
  });

  it("does not navigate when adding files in non-viewer workbenches", () => {
    expect(getStartupNavigationAction(1, 2, null, "fileEditor")).toBeNull();
    expect(getStartupNavigationAction(3, 4, null, "fileEditor")).toBeNull();
    expect(getStartupNavigationAction(1, 3, null, "pageEditor")).toBeNull();
  });

  it("handles all workbench types consistently for 0→N transitions", () => {
    // 0→1 always goes to viewer regardless of current workbench (since default is viewer)
    expect(getStartupNavigationAction(0, 1, null, "viewer")).toEqual({
      workbench: "viewer",
      activeFileIndex: 0,
    });
    expect(getStartupNavigationAction(0, 1, null, "fileEditor")).toEqual({
      workbench: "viewer",
      activeFileIndex: 0,
    });
    expect(getStartupNavigationAction(0, 1, null, "pageEditor")).toEqual({
      workbench: "viewer",
      activeFileIndex: 0,
    });
    expect(getStartupNavigationAction(0, 1, null, "custom:formFill")).toEqual({
      workbench: "viewer",
      activeFileIndex: 0,
    });

    // 0→N (N>1) always goes to fileEditor
    expect(getStartupNavigationAction(0, 3, null, "viewer")).toEqual({
      workbench: "fileEditor",
    });
    expect(getStartupNavigationAction(0, 3, null, "custom:myTool")).toEqual({
      workbench: "fileEditor",
    });
  });
});
