import { useState, useCallback, useEffect } from 'react';
import { Box, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useFileManager } from '@app/hooks/useFileManager';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { StirlingFileStub } from '@app/types/fileContext';
import { SMART_FOLDER_VIEW_ID, SMART_FOLDER_WORKBENCH_ID } from '@app/components/smartFolders/SmartFoldersRegistration';
import { WatchFolderFileList } from '@app/components/smartFolders/WatchFolderFileList';
import { useNavigationActions } from '@app/contexts/NavigationContext';

export function SmartFolderSidebarPanel() {
  const { t } = useTranslation();
  const { loadRecentFiles } = useFileManager();
  const [recentFiles, setRecentFiles] = useState<StirlingFileStub[]>([]);
  const { customWorkbenchViews, setCustomWorkbenchViewData } = useToolWorkflow();
  const { actions } = useNavigationActions();

  const smartFolderView = customWorkbenchViews.find(v => v.id === SMART_FOLDER_VIEW_ID);
  const folderId = smartFolderView?.data?.folderId ?? null;

  const refreshRecentFiles = useCallback(async () => {
    const files = await loadRecentFiles();
    setRecentFiles(files);
  }, [loadRecentFiles]);

  useEffect(() => {
    refreshRecentFiles();
    window.addEventListener('stirling:files-changed', refreshRecentFiles);
    return () => window.removeEventListener('stirling:files-changed', refreshRecentFiles);
  }, [refreshRecentFiles]);

  const handleSendToFolder = useCallback(async (fileId: string, targetFolderId: string) => {
    if (folderId === targetFolderId) {
      // Already viewing this folder — just queue the file, no navigation
      setCustomWorkbenchViewData(SMART_FOLDER_VIEW_ID, { folderId: targetFolderId, pendingFileId: fileId });
    } else {
      setCustomWorkbenchViewData(SMART_FOLDER_VIEW_ID, { folderId: targetFolderId, pendingFileId: fileId });
      actions.setWorkbench(SMART_FOLDER_WORKBENCH_ID);
    }
  }, [folderId, setCustomWorkbenchViewData, actions]);

  const handleNavigateToFolder = useCallback((targetFolderId: string) => {
    setCustomWorkbenchViewData(SMART_FOLDER_VIEW_ID, { folderId: targetFolderId });
    actions.setWorkbench(SMART_FOLDER_WORKBENCH_ID);
  }, [setCustomWorkbenchViewData, actions]);

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Box px="sm" pt="xs" pb="xs" style={{ flexShrink: 0, borderBottom: '1px solid var(--border-subtle)' }}>
        <Text size="xs" fw={600} tt="uppercase" c="dimmed">
          {t('smartFolders.sidebarFiles', 'My Files')}
        </Text>
      </Box>
      <WatchFolderFileList
        files={recentFiles}
        folderId={folderId}
        onSendToFolder={handleSendToFolder}
        onNavigateToFolder={handleNavigateToFolder}
      />
    </Box>
  );
}
