import { useCallback, useMemo } from 'react';
import {
  Text, Center, Box, LoadingOverlay, Stack
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { useFileState, useFileManagement, useFileActions, useFileContext, useFileSelection } from '@app/contexts/FileContext';
import { useNavigationActions } from '@app/contexts/NavigationContext';
import { zipFileService } from '@app/services/zipFileService';
import { detectFileExtension } from '@app/utils/fileUtils';
import FileEditorThumbnail from '@app/components/fileEditor/FileEditorThumbnail';
import { FileId, StirlingFile } from '@app/types/fileContext';
import { alert } from '@app/components/toast';
import { downloadFile } from '@app/services/downloadService';


interface FileEditorProps {
  onOpenPageEditor?: () => void;
  onMergeFiles?: (files: StirlingFile[]) => void;
  toolMode?: boolean;
  supportedExtensions?: string[];
}

const FileEditor = ({
  toolMode = false,
  supportedExtensions = ["pdf"]
}: FileEditorProps) => {

  const isFileSupported = useCallback((fileName: string): boolean => {
    const extension = detectFileExtension(fileName);
    return extension ? supportedExtensions.includes(extension) : false;
  }, [supportedExtensions]);

  const { state, selectors } = useFileState();
  const { addFiles, removeFiles, reorderFiles } = useFileManagement();
  const { actions: fileActions } = useFileActions();
  const { actions: fileContextActions } = useFileContext();
  const { setSelectedFiles } = useFileSelection();
  const { clearAllFileErrors: _clearAllFileErrors } = fileContextActions;

  const activeStirlingFileStubs = useMemo(() => selectors.getStirlingFileStubs(), [state.files.byId, state.files.ids]);

  const { actions: navActions } = useNavigationActions();

  const showStatus = useCallback((message: string, type: 'neutral' | 'success' | 'warning' | 'error' = 'neutral') => {
    alert({ alertType: type, title: message, expandable: false, durationMs: 4000 });
  }, []);
  const showError = useCallback((message: string) => {
    alert({ alertType: 'error', title: 'Error', body: message, expandable: true });
  }, []);

  const handleFileUpload = useCallback(async (uploadedFiles: File[]) => {
    try {
      if (uploadedFiles.length > 0) {
        await addFiles(uploadedFiles, { selectFiles: false });
        showStatus(`Added ${uploadedFiles.length} file(s)`, 'success');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process files';
      showError(errorMessage);
      console.error('File processing error:', err);
    }
  }, [addFiles, showStatus, showError]);

  const handleReorderFiles = useCallback((sourceFileId: FileId, targetFileId: FileId, _selectedFileIds: FileId[]) => {
    const currentIds = activeStirlingFileStubs.map(r => r.id);

    const sourceIndex = currentIds.findIndex(id => id === sourceFileId);
    const targetIndex = currentIds.findIndex(id => id === targetFileId);

    if (sourceIndex === -1 || targetIndex === -1) {
      console.warn('Could not find source or target file for reordering');
      return;
    }

    const newOrder = [...currentIds];
    newOrder.splice(sourceIndex, 1);

    let insertIndex = newOrder.findIndex(id => id === targetFileId);
    if (insertIndex !== -1) {
      const isMovingForward = sourceIndex < targetIndex;
      if (isMovingForward) insertIndex += 1;
    } else {
      insertIndex = newOrder.length;
    }

    newOrder.splice(insertIndex, 0, sourceFileId);
    reorderFiles(newOrder);
    showStatus('File reordered');
  }, [activeStirlingFileStubs, reorderFiles, showStatus]);

  const handleCloseFile = useCallback((fileId: FileId) => {
    removeFiles([fileId], false);
  }, [removeFiles]);

  const handleDownloadFile = useCallback(async (fileId: FileId) => {
    const record = activeStirlingFileStubs.find(r => r.id === fileId);
    const file = record ? selectors.getFile(record.id) : null;
    if (record && file) {
      const result = await downloadFile({
        data: file,
        filename: file.name,
        localPath: record.localFilePath
      });
      if (result.savedPath) {
        fileActions.updateStirlingFileStub(fileId, {
          localFilePath: record.localFilePath ?? result.savedPath,
          isDirty: false
        });
      }
    }
  }, [activeStirlingFileStubs, selectors, fileActions]);

  const handleUnzipFile = useCallback(async (fileId: FileId) => {
    const record = activeStirlingFileStubs.find(r => r.id === fileId);
    const file = record ? selectors.getFile(record.id) : null;
    if (record && file) {
      try {
        const result = await zipFileService.extractAndStoreFilesWithHistory(file, record);

        if (result.success && result.extractedStubs.length > 0) {
          await fileActions.addStirlingFileStubs(result.extractedStubs);
          removeFiles([fileId], false);
          alert({
            alertType: 'success',
            title: `Extracted ${result.extractedStubs.length} file(s) from ${file.name}`,
            expandable: false,
            durationMs: 3500
          });
        } else {
          alert({
            alertType: 'error',
            title: `Failed to extract files from ${file.name}`,
            body: result.errors.join('\n'),
            expandable: true,
            durationMs: 3500
          });
        }
      } catch (error) {
        console.error('Failed to unzip file:', error);
        alert({
          alertType: 'error',
          title: `Error unzipping ${file.name}`,
          expandable: false,
          durationMs: 3500
        });
      }
    }
  }, [activeStirlingFileStubs, selectors, fileActions, removeFiles]);

  const handleViewFile = useCallback((fileId: FileId) => {
    const record = activeStirlingFileStubs.find(r => r.id === fileId);
    if (record) {
      setSelectedFiles([fileId]);
      navActions.setWorkbench('viewer');
    }
  }, [activeStirlingFileStubs, setSelectedFiles, navActions]);

  return (
    <Dropzone
      onDrop={handleFileUpload}
      multiple={true}
      maxSize={2 * 1024 * 1024 * 1024}
      style={{
        border: 'none',
        borderRadius: 0,
        backgroundColor: 'transparent'
      }}
      activateOnClick={false}
      activateOnDrag={true}
    >
      <Box pos="relative" style={{ overflow: 'auto' }}>
        <LoadingOverlay visible={state.ui.isProcessing} />

        <Box p="md">
          {activeStirlingFileStubs.length === 0 ? (
            <Center h="60vh">
              <Stack align="center" gap="md">
                <Text size="lg" c="dimmed">📁</Text>
                <Text c="dimmed">No files loaded</Text>
                <Text size="sm" c="dimmed">Upload PDF files, ZIP archives, or load from storage to get started</Text>
              </Stack>
            </Center>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: '1.5rem',
                padding: '1rem',
                pointerEvents: 'auto'
              }}
            >
              {activeStirlingFileStubs.map((record, index) => (
                <FileEditorThumbnail
                  key={record.id}
                  file={record}
                  index={index}
                  totalFiles={activeStirlingFileStubs.length}
                  onCloseFile={handleCloseFile}
                  onViewFile={handleViewFile}
                  onReorderFiles={handleReorderFiles}
                  onDownloadFile={handleDownloadFile}
                  onUnzipFile={handleUnzipFile}
                  toolMode={toolMode}
                  isSupported={isFileSupported(record.name)}
                />
              ))}
            </div>
          )}
        </Box>
      </Box>
    </Dropzone>
  );
};

export default FileEditor;
