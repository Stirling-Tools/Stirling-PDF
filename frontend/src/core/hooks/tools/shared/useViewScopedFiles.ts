import { useMemo } from 'react';
import { useFileSelection, useAllFiles } from '@app/contexts/FileContext';
import { useViewer } from '@app/contexts/ViewerContext';
import { useNavigationState } from '@app/contexts/NavigationContext';
import { StirlingFile } from '@app/types/fileContext';

/**
 * Returns the effective file selection for tool operations.
 *
 * In viewer mode, scopes to the single file currently shown so that
 * "what you see is what gets processed". In file-editor mode the full
 * selection is returned unchanged.
 */
export function useViewScopedFiles(): StirlingFile[] {
  const { selectedFiles } = useFileSelection();
  const { activeFileIndex } = useViewer();
  const { files: allFiles } = useAllFiles();
  const { workbench } = useNavigationState();

  return useMemo(() => {
    if (workbench === 'viewer') {
      const viewerFile = allFiles[activeFileIndex];
      return viewerFile ? [viewerFile] : selectedFiles;
    }
    return selectedFiles;
  }, [workbench, allFiles, activeFileIndex, selectedFiles]);
}
