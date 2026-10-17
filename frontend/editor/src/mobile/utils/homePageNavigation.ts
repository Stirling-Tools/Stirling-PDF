import { getDefaultWorkbench, type WorkbenchType } from "@app/types/workbench";
import {
  getStartupNavigationAction as coreStartupNavigationAction,
  type StartupNavigationAction,
  type StartupWorkbench,
} from "@core/utils/homePageNavigation";

export type { StartupNavigationAction, StartupWorkbench };

// The mobile app opens files as documents: several files open the first one in
// the viewer, and the document header switches between them, rather than
// landing on the file grid.

export function getDefaultWorkbenchForFileCount(
  _fileCount: number,
): WorkbenchType {
  return getDefaultWorkbench();
}

export function getStartupNavigationAction(
  previousFileCount: number,
  currentFileCount: number,
  selectedToolKey: string | null,
  currentWorkbench: WorkbenchType,
): StartupNavigationAction | null {
  const action = coreStartupNavigationAction(
    previousFileCount,
    currentFileCount,
    selectedToolKey,
    currentWorkbench,
  );
  return action?.workbench === "fileEditor"
    ? { workbench: "viewer", activeFileIndex: 0 }
    : action;
}
