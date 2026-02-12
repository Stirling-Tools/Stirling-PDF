import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  Text, Center, Box, LoadingOverlay, Stack
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { useFileSelection, useFileState, useFileManagement, useFileActions, useFileContext } from '@app/contexts/FileContext';
import { useNavigationActions } from '@app/contexts/NavigationContext';
import { zipFileService } from '@app/services/zipFileService';
import { detectFileExtension } from '@app/utils/fileUtils';
import FileEditorThumbnail from '@app/components/fileEditor/FileEditorThumbnail';
import AddFileCard from '@app/components/fileEditor/AddFileCard';
import FilePickerModal from '@app/components/shared/FilePickerModal';
import { FileId, StirlingFile } from '@app/types/fileContext';
import { alert } from '@app/components/toast';
import { downloadFile } from '@app/services/downloadService';
import { useFileEditorRightRailButtons } from '@app/components/fileEditor/fileEditorRightRailButtons';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';


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

  // Utility function to check if a file extension is supported
  const isFileSupported = useCallback((fileName: string): boolean => {
    const extension = detectFileExtension(fileName);
    return extension ? supportedExtensions.includes(extension) : false;
  }, [supportedExtensions]);

  // Use optimized FileContext hooks
  const { state, selectors } = useFileState();
  const { addFiles, removeFiles, reorderFiles } = useFileManagement();
  const { actions: fileActions } = useFileActions();
  const { actions: fileContextActions } = useFileContext();
  const { clearAllFileErrors } = fileContextActions;

  // Extract needed values from state (memoized to prevent infinite loops)
  const activeStirlingFileStubs = useMemo(() => selectors.getStirlingFileStubs(), [state.files.byId, state.files.ids]);
  const selectedFileIds = state.ui.selectedFileIds;
  const totalItems = state.files.ids.length;
  const selectedCount = selectedFileIds.length;

  // Get navigation actions
  const { actions: navActions } = useNavigationActions();

  // Get file selection context
  const { setSelectedFiles } = useFileSelection();

  const [_status, _setStatus] = useState<string | null>(null);
  const [_error, _setError] = useState<string | null>(null);

  // Toast helpers
  const showStatus = useCallback((message: string, type: 'neutral' | 'success' | 'warning' | 'error' = 'neutral') => {
    alert({ alertType: type, title: message, expandable: false, durationMs: 4000 });
  }, []);
  const showError = useCallback((message: string) => {
    alert({ alertType: 'error', title: 'Error', body: message, expandable: true });
  }, []);
  const [selectionMode, setSelectionMode] = useState(toolMode);

  // Current tool (for enforcing maxFiles limits)
  const { selectedTool } = useToolWorkflow();

  // Compute effective max allowed files based on the active tool and mode
  const maxAllowed = useMemo<number>(() => {
    const rawMax = selectedTool?.maxFiles;
    return (!toolMode || rawMax == null || rawMax < 0) ? Infinity : rawMax;
  }, [selectedTool?.maxFiles, toolMode]);

  // Enable selection mode automatically in tool mode
  useEffect(() => {
    if (toolMode) {
      setSelectionMode(true);
    }
  }, [toolMode]);
  const [showFilePickerModal, setShowFilePickerModal] = useState(false);
  // Get selected file IDs from context (defensive programming)
  const contextSelectedIds = Array.isArray(selectedFileIds) ? selectedFileIds : [];

  // Create refs for frequently changing values to stabilize callbacks
  const contextSelectedIdsRef = useRef<FileId[]>([]);
  contextSelectedIdsRef.current = contextSelectedIds;

  // Use activeStirlingFileStubs directly - no conversion needed
  const localSelectedIds = contextSelectedIds;

  const handleSelectAllFiles = useCallback(() => {
    // Respect maxAllowed: if limited, select the last N files
    const allIds = state.files.ids;
    const idsToSelect = Number.isFinite(maxAllowed) ? allIds.slice(-maxAllowed) : allIds;
    setSelectedFiles(idsToSelect);
    try {
      clearAllFileErrors();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Failed to clear file errors on select all:', error);
      }
    }
  }, [state.files.ids, setSelectedFiles, clearAllFileErrors, maxAllowed]);

  const handleDeselectAllFiles = useCallback(() => {
    setSelectedFiles([]);
    try {
      clearAllFileErrors();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Failed to clear file errors on deselect:', error);
      }
    }
  }, [setSelectedFiles, clearAllFileErrors]);

  const handleCloseSelectedFiles = useCallback(() => {
    if (selectedFileIds.length === 0) return;
    void removeFiles(selectedFileIds, false);
    setSelectedFiles([]);
  }, [selectedFileIds, removeFiles, setSelectedFiles]);

  useFileEditorRightRailButtons({
    totalItems,
    selectedCount,
    onSelectAll: handleSelectAllFiles,
    onDeselectAll: handleDeselectAllFiles,
    onCloseSelected: handleCloseSelectedFiles,
  });

  // Process uploaded files using context
  // ZIP extraction is now handled automatically in FileContext based on user preferences
  const handleFileUpload = useCallback(async (uploadedFiles: File[]) => {
    _setError(null);

    try {
      if (uploadedFiles.length > 0) {
        // FileContext will automatically handle ZIP extraction based on user preferences
        // - Respects autoUnzip setting
        // - Respects autoUnzipFileLimit
        // - HTML ZIPs stay intact
        // - Non-ZIP files pass through unchanged
        await addFiles(uploadedFiles, { selectFiles: true });
        // After auto-selection, enforce maxAllowed if needed
        if (Number.isFinite(maxAllowed)) {
          const nowSelectedIds = selectors.getSelectedStirlingFileStubs().map(r => r.id);
          if (nowSelectedIds.length > maxAllowed) {
            setSelectedFiles(nowSelectedIds.slice(-maxAllowed));
          }
        }
        showStatus(`Added ${uploadedFiles.length} file(s)`, 'success');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process files';
      showError(errorMessage);
      console.error('File processing error:', err);
    }
  }, [addFiles, showStatus, showError, selectors, maxAllowed, setSelectedFiles]);

  const toggleFile = useCallback((fileId: FileId) => {
    const currentSelectedIds = contextSelectedIdsRef.current;

    const targetRecord = activeStirlingFileStubs.find(r => r.id === fileId);
    if (!targetRecord) return;

    const contextFileId = fileId; // No need to create a new ID
    const isSelected = currentSelectedIds.includes(contextFileId);

    let newSelection: FileId[];

    if (isSelected) {
      // Remove file from selection
      newSelection = currentSelectedIds.filter(id => id !== contextFileId);
    } else {
      // Add file to selection
      // Determine max files allowed from the active tool (negative or undefined means unlimited)
      const rawMax = selectedTool?.maxFiles;
      const maxAllowed = (!toolMode || rawMax == null || rawMax < 0) ? Infinity : rawMax;

      if (maxAllowed === 1) {
        // Only one file allowed -> replace selection with the new file
        newSelection = [contextFileId];
      } else {
        // If at capacity, drop the oldest selected and append the new one
        if (Number.isFinite(maxAllowed) && currentSelectedIds.length >= maxAllowed) {
          newSelection = [...currentSelectedIds.slice(1), contextFileId];
        } else {
          newSelection = [...currentSelectedIds, contextFileId];
        }
      }
    }

    // Update context (this automatically updates tool selection since they use the same action)
    setSelectedFiles(newSelection);
  }, [setSelectedFiles, toolMode, _setStatus, activeStirlingFileStubs, selectedTool?.maxFiles]);

  // Enforce maxAllowed when tool changes or when an external action sets too many selected files
  useEffect(() => {
    if (Number.isFinite(maxAllowed) && selectedFileIds.length > maxAllowed) {
      setSelectedFiles(selectedFileIds.slice(-maxAllowed));
    }
  }, [maxAllowed, selectedFileIds, setSelectedFiles]);


  // File reordering handler for drag and drop
  const handleReorderFiles = useCallback((sourceFileId: FileId, targetFileId: FileId, selectedFileIds: FileId[]) => {
    const currentIds = activeStirlingFileStubs.map(r => r.id);

    // Find indices
    const sourceIndex = currentIds.findIndex(id => id === sourceFileId);
    const targetIndex = currentIds.findIndex(id => id === targetFileId);

    if (sourceIndex === -1 || targetIndex === -1) {
      console.warn('Could not find source or target file for reordering');
      return;
    }

    // Handle multi-file selection reordering
    const filesToMove = selectedFileIds.length > 1
      ? selectedFileIds.filter(id => currentIds.includes(id))
      : [sourceFileId];

    // Create new order
    const newOrder = [...currentIds];

    // Remove files to move from their current positions (in reverse order to maintain indices)
    const sourceIndices = filesToMove.map(id => newOrder.findIndex(nId => nId === id))
      .sort((a, b) => b - a); // Sort descending

    sourceIndices.forEach(index => {
      newOrder.splice(index, 1);
    });

    // Calculate insertion index after removals
    let insertIndex = newOrder.findIndex(id => id === targetFileId);
    if (insertIndex !== -1) {
      // Determine if moving forward or backward
      const isMovingForward = sourceIndex < targetIndex;
      if (isMovingForward) {
        // Moving forward: insert after target
        insertIndex += 1;
      } else {
        // Moving backward: insert before target (insertIndex already correct)
      }
    } else {
      // Target was moved, insert at end
      insertIndex = newOrder.length;
    }

    // Insert files at the calculated position
    newOrder.splice(insertIndex, 0, ...filesToMove);

    // Update file order
    reorderFiles(newOrder);

    // Update status
    const moveCount = filesToMove.length;
    showStatus(`${moveCount > 1 ? `${moveCount} files` : 'File'} reordered`);
  }, [activeStirlingFileStubs, reorderFiles, _setStatus]);



  // File operations using context
  const handleCloseFile = useCallback((fileId: FileId) => {
    const record = activeStirlingFileStubs.find(r => r.id === fileId);
    const file = record ? selectors.getFile(record.id) : null;
    if (record && file) {
      // Remove file from context but keep in storage (close, don't delete)
      const contextFileId = record.id;
      removeFiles([contextFileId], false);

      // Remove from context selections
      const currentSelected = selectedFileIds.filter(id => id !== contextFileId);
      setSelectedFiles(currentSelected);
    }
  }, [activeStirlingFileStubs, selectors, removeFiles, setSelectedFiles, selectedFileIds]);

  const handleDownloadFile = useCallback(async (fileId: FileId) => {
    const record = activeStirlingFileStubs.find(r => r.id === fileId);
    const file = record ? selectors.getFile(record.id) : null;
    if (record && file) {
      await downloadFile({
        data: file,
        filename: file.name,
        localPath: record.localFilePath
      });
      // Mark file as clean after successful save to disk
      if (record.localFilePath && record.isDirty) {
        fileActions.updateFileRecord(fileId, { isDirty: false });
      }
    }
  }, [activeStirlingFileStubs, selectors, fileActions]);

  const handleUnzipFile = useCallback(async (fileId: FileId) => {
    const record = activeStirlingFileStubs.find(r => r.id === fileId);
    const file = record ? selectors.getFile(record.id) : null;
    if (record && file) {
      try {
        // Extract and store files using shared service method
        const result = await zipFileService.extractAndStoreFilesWithHistory(file, record);

        if (result.success && result.extractedStubs.length > 0) {
          // Add extracted file stubs to FileContext
          await fileActions.addStirlingFileStubs(result.extractedStubs);

          // Remove the original ZIP file
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
      // Set the file as selected in context and switch to viewer for preview
      setSelectedFiles([fileId]);
      navActions.setWorkbench('viewer');
    }
  }, [activeStirlingFileStubs, setSelectedFiles, navActions.setWorkbench]);

  const handleLoadFromStorage = useCallback(async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;

    try {
      // Use FileContext to handle loading stored files
      // The files are already in FileContext, just need to add them to active files
      showStatus(`Loaded ${selectedFiles.length} files from storage`);
    } catch (err) {
      console.error('Error loading files from storage:', err);
      showError('Failed to load some files from storage');
    }
  }, []);


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
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              rowGap: '1.5rem',
              padding: '1rem',
              pointerEvents: 'auto'
            }}
          >
            {/* Add File Card - only show when files exist */}
            {activeStirlingFileStubs.length > 0 && (
              <AddFileCard
                key="add-file-card"
                onFileSelect={handleFileUpload}
              />
            )}

            {activeStirlingFileStubs.map((record, index) => {
              return (
                <FileEditorThumbnail
                  key={record.id}
                  file={record}
                  index={index}
                  totalFiles={activeStirlingFileStubs.length}
                  selectedFiles={localSelectedIds}
                  selectionMode={selectionMode}
                  onToggleFile={toggleFile}
                  onCloseFile={handleCloseFile}
                  onViewFile={handleViewFile}
                  _onSetStatus={showStatus}
                  onReorderFiles={handleReorderFiles}
                  onDownloadFile={handleDownloadFile}
                  onUnzipFile={handleUnzipFile}
                  toolMode={toolMode}
                  isSupported={isFileSupported(record.name)}
                />
              );
            })}
          </div>
        )}
      </Box>

      {/* File Picker Modal */}
      <FilePickerModal
        opened={showFilePickerModal}
        onClose={() => setShowFilePickerModal(false)}
        storedFiles={[]} // FileEditor doesn't have access to stored files, needs to be passed from parent
        onSelectFiles={handleLoadFromStorage}
      />


      </Box>
    </Dropzone>
  );
};

export default FileEditor;
