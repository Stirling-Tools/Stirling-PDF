import type { WorkbenchType } from '@app/types/workbench';

export type StartupWorkbench = 'viewer' | 'fileEditor';

export interface StartupNavigationAction {
  workbench: StartupWorkbench;
  activeFileIndex?: number;
}

export function getStartupNavigationAction(
  previousFileCount: number,
  currentFileCount: number,
  selectedToolKey: string | null,
  currentWorkbench: WorkbenchType
): StartupNavigationAction | null {
  // pdfTextEditor handles its own empty state
  if (selectedToolKey === 'pdfTextEditor') {
    return null;
  }

  // Adding more files while in viewer → switch to fileEditor when 2+ files
  if (previousFileCount > 0 && currentWorkbench === 'viewer' && currentFileCount > previousFileCount) {
    if (currentFileCount > 1) {
      return { workbench: 'fileEditor' };
    }
    return { workbench: 'viewer', activeFileIndex: currentFileCount - 1 };
  }

  // From landing page (no prior files)
  if (previousFileCount === 0) {
    if (currentFileCount === 1) {
      return { workbench: 'viewer', activeFileIndex: 0 };
    }
    if (currentFileCount > 1) {
      return { workbench: 'fileEditor' };
    }
  }

  return null;
}
