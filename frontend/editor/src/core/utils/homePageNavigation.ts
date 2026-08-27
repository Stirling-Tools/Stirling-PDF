import {
  getDefaultWorkbench,
  type WorkbenchType,
} from "@app/types/workbench";

export type StartupWorkbench = "viewer" | "fileEditor";

export interface StartupNavigationAction {
  workbench: StartupWorkbench;
  activeFileIndex?: number;
}

/**
 * The view the editor settles on for a given number of open files: several files
 * means the file editor, one or none means the viewer - which with no files is
 * the landing screen.
 *
 * Shared so opening files and returning home can't disagree about what "default"
 * means (see getStartupNavigationAction below, which follows the same rule).
 */
export function getDefaultWorkbenchForFileCount(
  fileCount: number,
): WorkbenchType {
  return fileCount > 1 ? "fileEditor" : getDefaultWorkbench();
}

export function getStartupNavigationAction(
  previousFileCount: number,
  currentFileCount: number,
  selectedToolKey: string | null,
  currentWorkbench: WorkbenchType,
): StartupNavigationAction | null {
  // These tools manage their own state when files are added and should not be
  // auto-navigated away from their workbench.
  if (selectedToolKey === "pdfTextEditor" || selectedToolKey === "multiTool") {
    return null;
  }

  // The user is browsing their file library - don't auto-switch them out of
  // the file manager just because a new upload landed.
  if (currentWorkbench === "myFiles") {
    return null;
  }

  // Already actively viewing in the viewer → update to the latest file
  if (
    previousFileCount > 0 &&
    currentWorkbench === "viewer" &&
    currentFileCount > previousFileCount
  ) {
    return { workbench: "viewer", activeFileIndex: currentFileCount - 1 };
  }

  // From landing page (no prior files)
  if (previousFileCount === 0) {
    if (currentFileCount === 1) {
      return { workbench: "viewer", activeFileIndex: 0 };
    }
    if (currentFileCount > 1) {
      return { workbench: "fileEditor" };
    }
  }

  return null;
}
