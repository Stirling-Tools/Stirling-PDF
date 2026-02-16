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
  if (selectedToolKey === 'pdfTextEditor') {
    return null;
  }

  // Don't auto-switch away from fileEditor - user chose to be there
  if (currentWorkbench === 'fileEditor') {
    return null;
  }

  if (previousFileCount === 0 && currentFileCount === 1) {
    return { workbench: 'viewer', activeFileIndex: 0 };
  }

  if (previousFileCount === 0 && currentFileCount > 1) {
    return { workbench: 'fileEditor' };
  }

  return null;
}
