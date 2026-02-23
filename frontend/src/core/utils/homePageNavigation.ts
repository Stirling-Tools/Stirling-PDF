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

  const filesAdded = currentFileCount - previousFileCount;

  // Exactly 1 file added → open viewer at the new file's index (regardless of prior count)
  if (filesAdded === 1) {
    console.log('[homePageNavigation] Single file added, returning viewer');
    return { workbench: 'viewer', activeFileIndex: currentFileCount - 1 };
  }

  // 0→N (multiple files from empty): Go to fileEditor to manage multiple files
  if (previousFileCount === 0 && currentFileCount > 1) {
    console.log('[homePageNavigation] 0→N transition, returning fileEditor');
    return { workbench: 'fileEditor' };
  }

  console.log('[homePageNavigation] Still at 0 files, returning null');
  return null;
}
