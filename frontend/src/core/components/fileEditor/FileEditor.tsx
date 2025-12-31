import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  Text, Center, Box, LoadingOverlay, Stack
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFileSelection, useFileState, useFileManagement, useFileActions, useFileContext } from '@app/contexts/FileContext';
import { useNavigationActions } from '@app/contexts/NavigationContext';
import { zipFileService } from '@app/services/zipFileService';
import { detectFileExtension } from '@app/utils/fileUtils';
import FileEditorThumbnail from '@app/components/fileEditor/FileEditorThumbnail';
import AddFileCard from '@app/components/fileEditor/AddFileCard';
import FilePickerModal from '@app/components/shared/FilePickerModal';
import { FileId, StirlingFile, StirlingFileStub } from '@app/types/fileContext';
import { alert } from '@app/components/toast';
import { downloadBlob } from '@app/utils/downloadUtils';
import { useFileEditorRightRailButtons } from '@app/components/fileEditor/fileEditorRightRailButtons';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { usePendingFiles } from '@app/contexts/PendingFilesContext';

// Grid constants for virtualization
const GRID_CONSTANTS = {
  ITEM_WIDTH: 320, // px - matches minmax(320px, 1fr)
  ITEM_HEIGHT: 380, // px - approximate card height including gaps
  ITEM_GAP: 24, // px - matches 1.5rem row gap
  OVERSCAN: 2, // number of rows to render outside viewport
};


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
  const activeStirlingFileStubs = useMemo(() => selectors.getStirlingFileStubs(), [selectors.getFilesSignature()]);
  const selectedFileIds = state.ui.selectedFileIds;
  const totalItems = state.files.ids.length;
  const selectedCount = selectedFileIds.length;

  // Get navigation actions
  const { actions: navActions } = useNavigationActions();

  // Get file selection context
  const { setSelectedFiles } = useFileSelection();

  const [_status, _setStatus] = useState<string | null>(null);
  const [_error, _setError] = useState<string | null>(null);
  
  // Use shared pending files context for upload placeholders
  const { pendingFiles, addPendingFiles, removePendingFiles } = usePendingFiles();

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

  // Virtualization state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [itemsPerRow, setItemsPerRow] = useState(4);

  // Calculate items per row based on container width
  const calculateItemsPerRow = useCallback(() => {
    if (!gridContainerRef.current) return 4;
    const containerWidth = gridContainerRef.current.offsetWidth;
    if (containerWidth === 0) return 4;
    
    // Account for padding (1rem = 16px on each side)
    const availableWidth = containerWidth - 32;
    const itemWithGap = GRID_CONSTANTS.ITEM_WIDTH + GRID_CONSTANTS.ITEM_GAP;
    const calculated = Math.floor((availableWidth + GRID_CONSTANTS.ITEM_GAP) / itemWithGap);
    return Math.max(1, calculated);
  }, []);

  // Update items per row on resize
  useEffect(() => {
    const updateLayout = () => {
      const newItemsPerRow = calculateItemsPerRow();
      setItemsPerRow(newItemsPerRow);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);

    const resizeObserver = new ResizeObserver(updateLayout);
    if (gridContainerRef.current) {
      resizeObserver.observe(gridContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateLayout);
      resizeObserver.disconnect();
    };
  }, [calculateItemsPerRow]);

  // Combine all items for virtualization (AddFileCard + files + pending)
  const allItems = useMemo(() => {
    const items: Array<{ type: 'add' } | { type: 'file'; record: StirlingFileStub; index: number } | { type: 'pending'; pendingFile: typeof pendingFiles[0]; index: number }> = [];
    
    // Add file card (always first when files exist)
    if (activeStirlingFileStubs.length > 0 || pendingFiles.length > 0) {
      items.push({ type: 'add' });
    }
    
    // Add actual files
    activeStirlingFileStubs.forEach((record, index) => {
      items.push({ type: 'file', record, index });
    });
    
    // Add pending files
    pendingFiles.forEach((pendingFile, index) => {
      items.push({ type: 'pending', pendingFile, index });
    });
    
    return items;
  }, [activeStirlingFileStubs, pendingFiles]);

  // Get scroll element for virtualizer
  const getScrollElement = useCallback(() => scrollContainerRef.current, []);

  // Row virtualizer
  const rowCount = Math.ceil(allItems.length / itemsPerRow);
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement,
    estimateSize: () => GRID_CONSTANTS.ITEM_HEIGHT,
    overscan: GRID_CONSTANTS.OVERSCAN,
  });

  // Re-measure when items per row changes
  useEffect(() => {
    rowVirtualizer.measure();
  }, [itemsPerRow, allItems.length]);

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
  const handleFileUpload = useCallback((uploadedFiles: File[]) => {
    _setError(null);

    if (uploadedFiles.length > 0) {
      // Create pending file placeholders immediately for instant visual feedback
      const pendingIds = addPendingFiles(uploadedFiles);
      
      // Track completed files for status message
      let completedCount = 0;
      const totalCount = uploadedFiles.length;
      
      // Process each file individually so they load one by one
      uploadedFiles.forEach((file, index) => {
        const pendingId = pendingIds[index];
        
        (async () => {
          try {
            // FileContext will automatically handle ZIP extraction based on user preferences
            await addFiles([file], { selectFiles: true });
            
            // After auto-selection, enforce maxAllowed if needed
            if (Number.isFinite(maxAllowed)) {
              const nowSelectedIds = selectors.getSelectedStirlingFileStubs().map(r => r.id);
              if (nowSelectedIds.length > maxAllowed) {
                setSelectedFiles(nowSelectedIds.slice(-maxAllowed));
              }
            }
            
            completedCount++;
            // Show status when all files are done
            if (completedCount === totalCount) {
              showStatus(`Added ${totalCount} file(s)`, 'success');
            }
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to process files';
            showError(`Error processing ${file.name}: ${errorMessage}`);
            console.error('File processing error:', err);
          } finally {
            // Remove this file's pending placeholder when done
            removePendingFiles([pendingId]);
          }
        })();
      });
    }
  }, [addFiles, addPendingFiles, removePendingFiles, showStatus, showError, selectors, maxAllowed, setSelectedFiles]);

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

  const handleDownloadFile = useCallback((fileId: FileId) => {
    const record = activeStirlingFileStubs.find(r => r.id === fileId);
    const file = record ? selectors.getFile(record.id) : null;
    if (record && file) {
       downloadBlob(file, file.name);
    }
  }, [activeStirlingFileStubs, selectors, _setStatus]);

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


  // Render a single item based on its type
  const renderItem = useCallback((item: typeof allItems[0]) => {
    if (item.type === 'add') {
      return (
        <AddFileCard
          key="add-file-card"
          onFileSelect={handleFileUpload}
        />
      );
    }
    
    if (item.type === 'file') {
      const { record, index } = item;
      return (
        <FileEditorThumbnail
          key={record.id}
          file={record}
          index={index}
          totalFiles={activeStirlingFileStubs.length + pendingFiles.length}
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
    }
    
    if (item.type === 'pending') {
      const { pendingFile, index } = item;
      const placeholderStub: StirlingFileStub = {
        id: pendingFile.id,
        name: pendingFile.name,
        size: pendingFile.size,
        lastModified: pendingFile.lastModified,
        type: '',
        thumbnailUrl: undefined,
        versionNumber: 1,
        isLeaf: true,
        originalFileId: pendingFile.id,
      };
      return (
        <FileEditorThumbnail
          key={`pending-${pendingFile.id}`}
          file={placeholderStub}
          index={activeStirlingFileStubs.length + index}
          totalFiles={activeStirlingFileStubs.length + pendingFiles.length}
          selectedFiles={[]}
          selectionMode={selectionMode}
          onToggleFile={() => {}}
          onCloseFile={() => {}}
          onViewFile={() => {}}
          _onSetStatus={() => {}}
          onDownloadFile={() => {}}
          toolMode={toolMode}
          isSupported={true}
          isLoading={true}
        />
      );
    }
    
    return null;
  }, [
    handleFileUpload, activeStirlingFileStubs.length, pendingFiles.length,
    localSelectedIds, selectionMode, toggleFile, handleCloseFile, handleViewFile,
    showStatus, handleReorderFiles, handleDownloadFile, handleUnzipFile, toolMode, isFileSupported
  ]);

  // Calculate optimal grid width for centering
  const gridWidth = itemsPerRow * GRID_CONSTANTS.ITEM_WIDTH + (itemsPerRow - 1) * GRID_CONSTANTS.ITEM_GAP;

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
      <Box pos="relative" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <LoadingOverlay visible={false} />

        {activeStirlingFileStubs.length === 0 && pendingFiles.length === 0 ? (
          <Center h="60vh">
            <Stack align="center" gap="md">
              <Text size="lg" c="dimmed">📁</Text>
              <Text c="dimmed">No files loaded</Text>
              <Text size="sm" c="dimmed">Upload PDF files, ZIP archives, or load from storage to get started</Text>
            </Stack>
          </Center>
        ) : (
          <Box 
            ref={scrollContainerRef}
            style={{ 
              flex: 1, 
              overflow: 'auto',
              padding: '1rem',
            }}
          >
            <div
              ref={gridContainerRef}
              style={{
                position: 'relative',
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
              }}
            >
              <div
                style={{
                  maxWidth: `${gridWidth}px`,
                  margin: '0 auto',
                  position: 'relative',
                  height: '100%',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const startIndex = virtualRow.index * itemsPerRow;
                  const endIndex = Math.min(startIndex + itemsPerRow, allItems.length);
                  const rowItems = allItems.slice(startIndex, endIndex);

                  return (
                    <div
                      key={virtualRow.index}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          gap: `${GRID_CONSTANTS.ITEM_GAP}px`,
                          justifyContent: 'flex-start',
                        }}
                      >
                        {rowItems.map((item) => renderItem(item))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Box>
        )}

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
