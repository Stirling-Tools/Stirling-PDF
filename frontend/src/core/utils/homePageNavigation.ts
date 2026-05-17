import type { WorkbenchType } from "@app/types/workbench";

export type StartupWorkbench = "viewer" | "fileEditor";

export interface StartupNavigationAction {
  workbench: StartupWorkbench;
  activeFileIndex?: number;
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
