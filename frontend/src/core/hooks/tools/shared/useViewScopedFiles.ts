import { useMemo } from 'react';
import { useAllFiles } from '@app/contexts/FileContext';
import { useViewer } from '@app/contexts/ViewerContext';
import { useNavigationState } from '@app/contexts/NavigationContext';
import { StirlingFile } from '@app/types/fileContext';

/**
 * Returns the effective file set for tool operations.
 *
 * - Viewer: scopes to the single file currently shown ("what you see is what gets processed").
 * - All other views (pageEditor, fileEditor, custom): returns all loaded files.
 *
 * Individual file selection is intentionally ignored outside the viewer — in views
 * like the page selector, selection tracks pages not files, and tools should
 * operate on the full active file set.
 */
export function useViewScopedFiles(): StirlingFile[] {
  const { activeFileIndex } = useViewer();
  const { files: allFiles } = useAllFiles();
  const { workbench } = useNavigationState();

  return useMemo(() => {
    if (workbench === 'viewer') {
      const viewerFile = allFiles[activeFileIndex];
      return viewerFile ? [viewerFile] : allFiles;
    }
    return allFiles;
  }, [workbench, allFiles, activeFileIndex]);
}
