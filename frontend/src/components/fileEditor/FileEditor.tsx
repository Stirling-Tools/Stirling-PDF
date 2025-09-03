import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Text, Center, Box, Notification, LoadingOverlay, Stack, Group, Portal
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { useTranslation } from 'react-i18next';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useFileSelection, useFileState, useFileManagement } from '../../contexts/FileContext';
import { FileId } from '../../types/fileContext';
import { useNavigationActions } from '../../contexts/NavigationContext';
import { fileStorage } from '../../services/fileStorage';
import { generateThumbnailForFile } from '../../utils/thumbnailUtils';
import { zipFileService } from '../../services/zipFileService';
import { detectFileExtension } from '../../utils/fileUtils';
import styles from './FileEditor.module.css';
import FileEditorThumbnail from './FileEditorThumbnail';
import FilePickerModal from '../shared/FilePickerModal';
import SkeletonLoader from '../shared/SkeletonLoader';


interface FileEditorProps {
  onOpenPageEditor?: (file: File) => void;
  onMergeFiles?: (files: File[]) => void;
  toolMode?: boolean;
  showUpload?: boolean;
  showBulkActions?: boolean;
  supportedExtensions?: string[];
}

const FileEditor = ({
  onOpenPageEditor,
  onMergeFiles,
  toolMode = false,
  showUpload = true,
  showBulkActions = true,
  supportedExtensions = ["pdf"]
}: FileEditorProps) => {
  const { t } = useTranslation();

  // Utility function to check if a file extension is supported
  const isFileSupported = useCallback((fileName: string): boolean => {
    const extension = detectFileExtension(fileName);
    return extension ? supportedExtensions.includes(extension) : false;
  }, [supportedExtensions]);

  // Use optimized FileContext hooks
  const { state, selectors } = useFileState();
  const { addFiles, removeFiles, reorderFiles } = useFileManagement();
  
  // Extract needed values from state (memoized to prevent infinite loops)
  const activeFiles = useMemo(() => selectors.getFiles(), [selectors.getFilesSignature()]);
  const activeFileRecords = useMemo(() => selectors.getFileRecords(), [selectors.getFilesSignature()]);
  const selectedFileIds = state.ui.selectedFileIds;
  const isProcessing = state.ui.isProcessing;
  
  const { actions: navActions } = useNavigationActions();
  
  // Get file selection context
  const { setSelectedFiles } = useFileSelection();

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(toolMode);

  // Enable selection mode automatically in tool mode
  React.useEffect(() => {
    if (toolMode) {
      setSelectionMode(true);
    }
  }, [toolMode]);
  const [showFilePickerModal, setShowFilePickerModal] = useState(false);
  const [zipExtractionProgress, setZipExtractionProgress] = useState<{
    isExtracting: boolean;
    currentFile: string;
    progress: number;
    extractedCount: number;
    totalFiles: number;
  }>({
    isExtracting: false,
    currentFile: '',
    progress: 0,
    extractedCount: 0,
    totalFiles: 0
  });
  // Get selected file IDs from context (defensive programming)
  const contextSelectedIds = Array.isArray(selectedFileIds) ? selectedFileIds : [];
  
  // Create refs for frequently changing values to stabilize callbacks
  const contextSelectedIdsRef = useRef<string[]>([]);
  contextSelectedIdsRef.current = contextSelectedIds;

  // Use activeFileRecords directly - no conversion needed
  const localSelectedIds = contextSelectedIds;

  // Helper to convert FileRecord to FileThumbnail format
  const recordToFileItem = useCallback((record: any) => {
    const file = selectors.getFile(record.id);
    if (!file) return null;
    
    return {
      id: record.id,
      name: file.name,
      pageCount: record.processedFile?.totalPages || 1,
      thumbnail: record.thumbnailUrl || '',
      size: file.size,
      file: file
    };
  }, [selectors]);


  // Process uploaded files using context
  const handleFileUpload = useCallback(async (uploadedFiles: File[]) => {
    setError(null);

    try {
      const allExtractedFiles: File[] = [];
      const errors: string[] = [];

      for (const file of uploadedFiles) {
        if (file.type === 'application/pdf') {
          // Handle PDF files normally
          allExtractedFiles.push(file);
        } else if (file.type === 'application/zip' || file.type === 'application/x-zip-compressed' || file.name.toLowerCase().endsWith('.zip')) {
          // Handle ZIP files - only expand if they contain PDFs
          try {
            // Validate ZIP file first
            const validation = await zipFileService.validateZipFile(file);

            if (validation.isValid && validation.containsPDFs) {
              // ZIP contains PDFs - extract them
              setZipExtractionProgress({
                isExtracting: true,
                currentFile: file.name,
                progress: 0,
                extractedCount: 0,
                totalFiles: validation.fileCount
              });

              const extractionResult = await zipFileService.extractPdfFiles(file, (progress) => {
                setZipExtractionProgress({
                  isExtracting: true,
                  currentFile: progress.currentFile,
                  progress: progress.progress,
                  extractedCount: progress.extractedCount,
                  totalFiles: progress.totalFiles
                });
              });

              // Reset extraction progress
              setZipExtractionProgress({
                isExtracting: false,
                currentFile: '',
                progress: 0,
                extractedCount: 0,
                totalFiles: 0
              });

              if (extractionResult.success) {
                allExtractedFiles.push(...extractionResult.extractedFiles);
              
              if (extractionResult.errors.length > 0) {
                errors.push(...extractionResult.errors);
              }
              } else {
                errors.push(`Failed to extract ZIP file "${file.name}": ${extractionResult.errors.join(', ')}`);
              }
            } else {
              // ZIP doesn't contain PDFs or is invalid - treat as regular file
              allExtractedFiles.push(file);
            }
          } catch (zipError) {
            errors.push(`Failed to process ZIP file "${file.name}": ${zipError instanceof Error ? zipError.message : 'Unknown error'}`);
            setZipExtractionProgress({
              isExtracting: false,
              currentFile: '',
              progress: 0,
              extractedCount: 0,
              totalFiles: 0
            });
          }
        } else {
          allExtractedFiles.push(file);
        }
      }

      // Show any errors
      if (errors.length > 0) {
        setError(errors.join('\n'));
      }

      // Process all extracted files
      if (allExtractedFiles.length > 0) {
        // Add files to context (they will be processed automatically)
        await addFiles(allExtractedFiles);
        setStatus(`Added ${allExtractedFiles.length} files`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process files';
      setError(errorMessage);
      console.error('File processing error:', err);
      
      // Reset extraction progress on error
      setZipExtractionProgress({
        isExtracting: false,
        currentFile: '',
        progress: 0,
        extractedCount: 0,
        totalFiles: 0
      });
    }
  }, [addFiles]);

  const selectAll = useCallback(() => {
    setSelectedFiles(activeFileRecords.map(r => r.id)); // Use FileRecord IDs directly
  }, [activeFileRecords, setSelectedFiles]);

  const deselectAll = useCallback(() => setSelectedFiles([]), [setSelectedFiles]);

  const closeAllFiles = useCallback(() => {
    if (activeFileRecords.length === 0) return;

    // Remove all files from context but keep in storage
    const allFileIds = activeFileRecords.map(record => record.id);
    removeFiles(allFileIds, false); // false = keep in storage
    
    // Clear selections
    setSelectedFiles([]);
  }, [activeFileRecords, removeFiles, setSelectedFiles]);

  const toggleFile = useCallback((fileId: string) => {
    const currentSelectedIds = contextSelectedIdsRef.current;
    
    const targetRecord = activeFileRecords.find(r => r.id === fileId);
    if (!targetRecord) return;

    const contextFileId = fileId; // No need to create a new ID
    const isSelected = currentSelectedIds.includes(contextFileId);

    let newSelection: string[];

    if (isSelected) {
      // Remove file from selection
      newSelection = currentSelectedIds.filter(id => id !== contextFileId);
    } else {
      // Add file to selection
      // In tool mode, typically allow multiple files unless specified otherwise
      const maxAllowed = toolMode ? 10 : Infinity; // Default max for tools
      
      if (maxAllowed === 1) {
        newSelection = [contextFileId];
      } else {
        // Check if we've hit the selection limit
        if (maxAllowed > 1 && currentSelectedIds.length >= maxAllowed) {
          setStatus(`Maximum ${maxAllowed} files can be selected`);
          return;
        }
        newSelection = [...currentSelectedIds, contextFileId];
      }
    }

    // Update context (this automatically updates tool selection since they use the same action)
    setSelectedFiles(newSelection.map(id => id as FileId));
  }, [setSelectedFiles, toolMode, setStatus, activeFileRecords]);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      const newMode = !prev;
      if (!newMode) {
        setSelectedFiles([]);
      }
      return newMode;
    });
  }, [setSelectedFiles]);

  // File reordering handler for drag and drop
  const handleReorderFiles = useCallback((sourceFileId: string, targetFileId: string, selectedFileIds: string[]) => {
    const currentIds = activeFileRecords.map(r => r.id);
    
    // Find indices
    const sourceIndex = currentIds.findIndex(id => id === sourceFileId);
    const targetIndex = currentIds.findIndex(id => id === targetFileId);
    
    if (sourceIndex === -1 || targetIndex === -1) {
      console.warn('Could not find source or target file for reordering');
      return;
    }

    // Handle multi-file selection reordering
    const filesToMove = selectedFileIds.length > 1 
      ? selectedFileIds.filter(id => currentIds.includes(id as any))
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
    newOrder.splice(insertIndex, 0, ...filesToMove.map(id => id as any));

    // Update file order
    reorderFiles(newOrder);

    // Update status
    const moveCount = filesToMove.length;
    setStatus(`${moveCount > 1 ? `${moveCount} files` : 'File'} reordered`);
  }, [activeFileRecords, reorderFiles, setStatus]);



  // File operations using context
  const handleDeleteFile = useCallback((fileId: string) => {
    const record = activeFileRecords.find(r => r.id === fileId);
    const file = record ? selectors.getFile(record.id) : null;

    if (record && file) {
      // Remove file from context but keep in storage (close, don't delete)
      removeFiles([record.id], false);

      // Remove from context selections
      const currentSelected = selectedFileIds.filter(id => id !== record.id);
      setSelectedFiles(currentSelected);
    }
  }, [activeFileRecords, selectors, removeFiles, setSelectedFiles, selectedFileIds]);

  const handleViewFile = useCallback((fileId: string) => {
    const record = activeFileRecords.find(r => r.id === fileId);
    if (record) {
      // Set the file as selected in context and switch to viewer for preview
      setSelectedFiles([fileId as FileId]);
      navActions.setWorkbench('viewer');
    }
  }, [activeFileRecords, setSelectedFiles, navActions.setWorkbench]);

  const handleMergeFromHere = useCallback((fileId: string) => {
    const startIndex = activeFileRecords.findIndex(r => r.id === fileId);
    if (startIndex === -1) return;

    const recordsToMerge = activeFileRecords.slice(startIndex);
    const filesToMerge = recordsToMerge.map(r => selectors.getFile(r.id)).filter(Boolean) as File[];
    if (onMergeFiles) {
      onMergeFiles(filesToMerge);
    }
  }, [activeFileRecords, selectors, onMergeFiles]);

  const handleSplitFile = useCallback((fileId: string) => {
    const file = selectors.getFile(fileId as FileId);
    if (file && onOpenPageEditor) {
      onOpenPageEditor(file);
    }
  }, [selectors, onOpenPageEditor]);

  const handleLoadFromStorage = useCallback(async (selectedFiles: any[]) => {
    if (selectedFiles.length === 0) return;

    try {
      // Use FileContext to handle loading stored files
      // The files are already in FileContext, just need to add them to active files
      setStatus(`Loaded ${selectedFiles.length} files from storage`);
    } catch (err) {
      console.error('Error loading files from storage:', err);
      setError('Failed to load some files from storage');
    }
  }, []);


  return (
    <Dropzone
      onDrop={handleFileUpload}
      multiple={true}
      maxSize={2 * 1024 * 1024 * 1024}
      style={{
        height: '100vh',
        border: 'none',
        borderRadius: 0,
        backgroundColor: 'transparent'
      }}
      activateOnClick={false}
      activateOnDrag={true}
    >
      <Box pos="relative" h="100vh" style={{ overflow: 'auto' }}>
        <LoadingOverlay visible={false} />

        <Box p="md" pt="xl">


        {activeFileRecords.length === 0 && !zipExtractionProgress.isExtracting ? (
          <Center h="60vh">
            <Stack align="center" gap="md">
              <Text size="lg" c="dimmed">📁</Text>
              <Text c="dimmed">No files loaded</Text>
              <Text size="sm" c="dimmed">Upload PDF files, ZIP archives, or load from storage to get started</Text>
            </Stack>
          </Center>
        ) : activeFileRecords.length === 0 && zipExtractionProgress.isExtracting ? (
          <Box>
            <SkeletonLoader type="controls" />

            {/* ZIP Extraction Progress */}
            {zipExtractionProgress.isExtracting && (
              <Box mb="md" p="sm" style={{ backgroundColor: 'var(--mantine-color-orange-0)', borderRadius: 8 }}>
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={500}>Extracting ZIP archive...</Text>
                  <Text size="sm" c="dimmed">{Math.round(zipExtractionProgress.progress)}%</Text>
                </Group>
                <Text size="xs" c="dimmed" mb="xs">
                  {zipExtractionProgress.currentFile || 'Processing files...'}
                </Text>
                <Text size="xs" c="dimmed" mb="xs">
                  {zipExtractionProgress.extractedCount} of {zipExtractionProgress.totalFiles} files extracted
                </Text>
                <div style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: 'var(--mantine-color-gray-2)',
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${Math.round(zipExtractionProgress.progress)}%`,
                    height: '100%',
                    backgroundColor: 'var(--mantine-color-orange-6)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </Box>
            )}


            <SkeletonLoader type="fileGrid" count={6} />
          </Box>
        ) : (
          <div 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
              gap: '1.5rem', 
              padding: '1rem',
              pointerEvents: 'auto'
            }}
          >
            {activeFileRecords.map((record, index) => {
              const fileItem = recordToFileItem(record);
              if (!fileItem) return null;
              
              return (
                <FileEditorThumbnail
                  key={record.id}
                  file={fileItem}
                  index={index}
                  totalFiles={activeFileRecords.length}
                  selectedFiles={localSelectedIds}
                  selectionMode={selectionMode}
                  onToggleFile={toggleFile}
                  onDeleteFile={handleDeleteFile}
                  onViewFile={handleViewFile}
                  onSetStatus={setStatus}
                  onReorderFiles={handleReorderFiles}
                  toolMode={toolMode}
                  isSupported={isFileSupported(fileItem.name)}
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

      {status && (
        <Portal>
          <Notification
            color="blue"
            mt="md"
            onClose={() => setStatus(null)}
            style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 10001 }}
          >
            {status}
          </Notification>
        </Portal>
      )}

      {error && (
        <Portal>
          <Notification
            color="red"
            mt="md"
            onClose={() => setError(null)}
            style={{ position: 'fixed', bottom: 80, right: 20, zIndex: 10001 }}
          >
            {error}
          </Notification>
        </Portal>
      )}
      </Box>
    </Dropzone>
  );
};

export default FileEditor;
