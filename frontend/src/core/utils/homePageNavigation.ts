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
  console.log('[homePageNavigation] Called with:', {
    previousFileCount,
    currentFileCount,
    selectedToolKey,
    currentWorkbench,
  });

  // pdfTextEditor handles its own empty state
  if (selectedToolKey === 'pdfTextEditor') {
    console.log('[homePageNavigation] pdfTextEditor detected, returning null');
    return null;
  }

  // Only handle transitions from empty (0 files) to some files
  if (previousFileCount !== 0) {
    console.log('[homePageNavigation] Not a 0→N transition, returning null');
    return null;
  }

  // 0→1: Go to viewer to view the single file
  if (currentFileCount === 1) {
    console.log('[homePageNavigation] 0→1 transition, returning viewer');
    return { workbench: 'viewer', activeFileIndex: 0 };
  }

  // 0→N (N>1): Go to fileEditor to manage multiple files
  if (currentFileCount > 1) {
    console.log('[homePageNavigation] 0→N transition, returning fileEditor');
    return { workbench: 'fileEditor' };
  }

  console.log('[homePageNavigation] Still at 0 files, returning null');
  return null;
}
