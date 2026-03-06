import { useState, useCallback, useEffect } from 'react';
import { Box, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { FileManagerProvider } from '@app/contexts/FileManagerContext';
import FileListArea from '@app/components/fileManager/FileListArea';
import { useFileManager } from '@app/hooks/useFileManager';
import { useAllFiles } from '@app/contexts/FileContext';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { StirlingFileStub } from '@app/types/fileContext';
import { SMART_FOLDER_VIEW_ID } from '@app/components/smartFolders/SmartFoldersRegistration';

export function SmartFolderSidebarPanel() {
  const { t } = useTranslation();
  const { loadRecentFiles, handleRemoveFile, loading } = useFileManager();
  const [recentFiles, setRecentFiles] = useState<StirlingFileStub[]>([]);
  const { fileIds: activeFileIds } = useAllFiles();
  const { customWorkbenchViews, setCustomWorkbenchViewData } = useToolWorkflow();

  const smartFolderView = customWorkbenchViews.find(v => v.id === SMART_FOLDER_VIEW_ID);
  const folderId = smartFolderView?.data?.folderId ?? null;

  const refreshRecentFiles = useCallback(async () => {
    const files = await loadRecentFiles();
    setRecentFiles(files);
  }, [loadRecentFiles]);

  useEffect(() => {
    refreshRecentFiles();
  }, [refreshRecentFiles]);

  const handleRemoveFileByIndex = useCallback(async (index: number) => {
    await handleRemoveFile(index, recentFiles, setRecentFiles);
  }, [handleRemoveFile, recentFiles]);

  // Double-clicking a file sends it to the currently open folder (no-op on home page)
  const handleFilesSelected = useCallback((files: StirlingFileStub[]) => {
    if (files.length === 0 || !folderId) return;
    files.forEach((file, i) => {
      setTimeout(() => {
        setCustomWorkbenchViewData(SMART_FOLDER_VIEW_ID, { folderId, pendingFileId: file.id });
      }, i * 50);
    });
  }, [folderId, setCustomWorkbenchViewData]);

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Box px="sm" pt="xs" pb="xs" style={{ flexShrink: 0, borderBottom: '1px solid var(--border-subtle)' }}>
        <Text size="xs" fw={600} tt="uppercase" c="dimmed">
          {t('smartFolders.sidebarFiles', 'Your Files')}
        </Text>
      </Box>
      <FileManagerProvider
        recentFiles={recentFiles}
        onRecentFilesSelected={handleFilesSelected}
        onNewFilesSelect={() => {}}
        onClose={() => {}}
        isFileSupported={(name) => name.toLowerCase().endsWith('.pdf')}
        isOpen={true}
        onFileRemove={handleRemoveFileByIndex}
        modalHeight="100%"
        refreshRecentFiles={refreshRecentFiles}
        isLoading={loading}
        activeFileIds={activeFileIds}
      >
        <FileListArea scrollAreaHeight="100%" scrollAreaStyle={{ flex: 1, minHeight: 0 }} />
      </FileManagerProvider>
    </Box>
  );
}
