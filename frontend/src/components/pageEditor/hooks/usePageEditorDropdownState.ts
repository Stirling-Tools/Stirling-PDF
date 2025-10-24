import { useMemo } from 'react';
import { usePageEditor } from '../../../contexts/PageEditorContext';
import { useFileState } from '../../../contexts/FileContext';
import { FileId } from '../../../types/file';
import { useFileColorMap } from './useFileColorMap';

export interface PageEditorDropdownFile {
  fileId: FileId;
  name: string;
  versionNumber?: number;
  isSelected: boolean;
}

export interface PageEditorDropdownState {
  files: PageEditorDropdownFile[];
  selectedCount: number;
  totalCount: number;
  onToggleSelection: (fileId: FileId) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  fileColorMap: Map<FileId, number>;
}

const isPdf = (name?: string | null) =>
  typeof name === 'string' && name.toLowerCase().endsWith('.pdf');

export function usePageEditorDropdownState(): PageEditorDropdownState {
  const { state, selectors } = useFileState();
  const {
    toggleFileSelection,
    reorderFiles,
    fileOrder,
  } = usePageEditor();

  const pageEditorFiles = useMemo(() => {
    return fileOrder
      .map<PageEditorDropdownFile | null>((fileId) => {
        const stub = selectors.getStirlingFileStub(fileId);
        if (!isPdf(stub?.name)) return null;

        return {
          fileId,
          name: stub?.name || '',
          versionNumber: stub?.versionNumber,
          isSelected: state.ui.selectedFileIds.includes(fileId),
        };
      })
      .filter((file): file is PageEditorDropdownFile => file !== null);
  }, [fileOrder, selectors, state.ui.selectedFileIds]);

  const fileColorMap = useFileColorMap(pageEditorFiles.map((file) => file.fileId));

  const selectedCount = useMemo(
    () => pageEditorFiles.filter((file) => file.isSelected).length,
    [pageEditorFiles]
  );

  return useMemo<PageEditorDropdownState>(() => ({
    files: pageEditorFiles,
    selectedCount,
    totalCount: pageEditorFiles.length,
    onToggleSelection: toggleFileSelection,
    onReorder: reorderFiles,
    fileColorMap,
  }), [pageEditorFiles, selectedCount, toggleFileSelection, reorderFiles, fileColorMap]);
}
