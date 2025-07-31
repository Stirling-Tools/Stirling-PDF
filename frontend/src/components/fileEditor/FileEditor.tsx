import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Button, Text, Center, Box, Notification, TextInput, LoadingOverlay, Modal, Alert, Container,
  Stack, Group
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { useTranslation } from 'react-i18next';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useFileContext } from '../../contexts/FileContext';
import { useFileSelection } from '../../contexts/FileSelectionContext';
import { FileOperation } from '../../types/fileContext';
import { fileStorage } from '../../services/fileStorage';
import { generateThumbnailForFile } from '../../utils/thumbnailUtils';
import { zipFileService } from '../../services/zipFileService';
import styles from '../pageEditor/PageEditor.module.css';
import FileThumbnail from '../pageEditor/FileThumbnail';
import DragDropGrid from '../pageEditor/DragDropGrid';
import FilePickerModal from '../shared/FilePickerModal';
import SkeletonLoader from '../shared/SkeletonLoader';

interface FileItem {
  id: string;
  name: string;
  pageCount: number;
  thumbnail: string;
  size: number;
  file: File;
  splitBefore?: boolean;
}

interface FileEditorProps {
  onOpenPageEditor?: (file: File) => void;
  onMergeFiles?: (files: File[]) => void;
  toolMode?: boolean;
  showUpload?: boolean;
  showBulkActions?: boolean;
}

const FileEditor = ({
  onOpenPageEditor,
  onMergeFiles,
  toolMode = false,
  showUpload = true,
  showBulkActions = true
}: FileEditorProps) => {
  const { t } = useTranslation();

  // Get file context
  const fileContext = useFileContext();
  const {
    activeFiles,
    processedFiles,
    selectedFileIds,
    setSelectedFiles: setContextSelectedFiles,
    isProcessing,
    addFiles,
    removeFiles,
    setCurrentView,
    recordOperation,
    markOperationApplied
  } = fileContext;

  // Get file selection context
  const { 
    selectedFiles: toolSelectedFiles, 
    setSelectedFiles: setToolSelectedFiles, 
    maxFiles, 
    isToolMode 
  } = useFileSelection();

  const [files, setFiles] = useState<FileItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [selectionMode, setSelectionMode] = useState(toolMode);
  
  // Enable selection mode automatically in tool mode
  React.useEffect(() => {
    if (toolMode) {
      setSelectionMode(true);
    }
  }, [toolMode]);
  const [draggedFile, setDraggedFile] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [multiFileDrag, setMultiFileDrag] = useState<{fileIds: string[], count: number} | null>(null);
  const [dragPosition, setDragPosition] = useState<{x: number, y: number} | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showFilePickerModal, setShowFilePickerModal] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
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
  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastActiveFilesRef = useRef<string[]>([]);
  const lastProcessedFilesRef = useRef<number>(0);

  // Get selected file IDs from context (defensive programming)
  const contextSelectedIds = Array.isArray(selectedFileIds) ? selectedFileIds : [];
  
  // Map context selections to local file IDs for UI display
  const localSelectedIds = files
    .filter(file => {
      const fileId = (file.file as any).id || file.name;
      return contextSelectedIds.includes(fileId);
    })
    .map(file => file.id);

  // Convert shared files to FileEditor format
  const convertToFileItem = useCallback(async (sharedFile: any): Promise<FileItem> => {
    // Generate thumbnail if not already available
    const thumbnail = sharedFile.thumbnail || await generateThumbnailForFile(sharedFile.file || sharedFile);

    return {
      id: sharedFile.id || `file-${Date.now()}-${Math.random()}`,
      name: (sharedFile.file?.name || sharedFile.name || 'unknown'),
      pageCount: sharedFile.pageCount || Math.floor(Math.random() * 20) + 1, // Mock for now
      thumbnail,
      size: sharedFile.file?.size || sharedFile.size || 0,
      file: sharedFile.file || sharedFile,
    };
  }, []);

  // Convert activeFiles to FileItem format using context (async to avoid blocking)
  useEffect(() => {
    // Check if the actual content has changed, not just references
    const currentActiveFileNames = activeFiles.map(f => f.name);
    const currentProcessedFilesSize = processedFiles.size;
    
    const activeFilesChanged = JSON.stringify(currentActiveFileNames) !== JSON.stringify(lastActiveFilesRef.current);
    const processedFilesChanged = currentProcessedFilesSize !== lastProcessedFilesRef.current;
    
    if (!activeFilesChanged && !processedFilesChanged) {
      return;
    }
    
    // Update refs
    lastActiveFilesRef.current = currentActiveFileNames;
    lastProcessedFilesRef.current = currentProcessedFilesSize;
    
    const convertActiveFiles = async () => {
      
      if (activeFiles.length > 0) {
        setLocalLoading(true);
        try {
          // Process files in chunks to avoid blocking UI
          const convertedFiles: FileItem[] = [];
          
          for (let i = 0; i < activeFiles.length; i++) {
            const file = activeFiles[i];
            
            // Try to get thumbnail from processed file first
            const processedFile = processedFiles.get(file);
            let thumbnail = processedFile?.pages?.[0]?.thumbnail;
            
            // If no thumbnail from processed file, try to generate one
            if (!thumbnail) {
              try {
                thumbnail = await generateThumbnailForFile(file);
              } catch (error) {
                console.warn(`Failed to generate thumbnail for ${file.name}:`, error);
                thumbnail = undefined; // Use placeholder
              }
            }
            
            const convertedFile = {
              id: `file-${Date.now()}-${Math.random()}`,
              name: file.name,
              pageCount: processedFile?.totalPages || Math.floor(Math.random() * 20) + 1,
              thumbnail,
              size: file.size,
              file,
            };
            
            convertedFiles.push(convertedFile);
            
            // Update progress
            setConversionProgress(((i + 1) / activeFiles.length) * 100);
            
            // Yield to main thread between files
            if (i < activeFiles.length - 1) {
              await new Promise(resolve => requestAnimationFrame(resolve));
            }
          }
              
          
          setFiles(convertedFiles);
        } catch (err) {
          console.error('Error converting active files:', err);
        } finally {
          setLocalLoading(false);
          setConversionProgress(0);
        }
      } else {
        setFiles([]);
        setLocalLoading(false);
        setConversionProgress(0);
      }
    };

    convertActiveFiles();
  }, [activeFiles, processedFiles]);


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
                
                // Record ZIP extraction operation
                const operationId = `zip-extract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const operation: FileOperation = {
                id: operationId,
                type: 'convert',
                timestamp: Date.now(),
                fileIds: extractionResult.extractedFiles.map(f => f.name),
                status: 'pending',
                metadata: {
                  originalFileName: file.name,
                  outputFileNames: extractionResult.extractedFiles.map(f => f.name),
                  fileSize: file.size,
                  parameters: {
                    extractionType: 'zip',
                    extractedCount: extractionResult.extractedCount,
                    totalFiles: extractionResult.totalFiles
                  }
                }
              };
              
              recordOperation(file.name, operation);
              markOperationApplied(file.name, operationId);
              
              if (extractionResult.errors.length > 0) {
                errors.push(...extractionResult.errors);
              }
              } else {
                errors.push(`Failed to extract ZIP file "${file.name}": ${extractionResult.errors.join(', ')}`);
              }
            } else {
              // ZIP doesn't contain PDFs or is invalid - treat as regular file
              console.log(`Adding ZIP file as regular file: ${file.name} (no PDFs found)`);
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
          console.log(`Adding none PDF file: ${file.name} (${file.type})`);
          allExtractedFiles.push(file);
        }
      }

      // Show any errors
      if (errors.length > 0) {
        setError(errors.join('\n'));
      }

      // Process all extracted files
      if (allExtractedFiles.length > 0) {
        // Record upload operations for PDF files
        for (const file of allExtractedFiles) {
          const operationId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const operation: FileOperation = {
            id: operationId,
            type: 'upload',
            timestamp: Date.now(),
            fileIds: [file.name],
            status: 'pending',
            metadata: {
              originalFileName: file.name,
              fileSize: file.size,
              parameters: {
                uploadMethod: 'drag-drop'
              }
            }
          };
          
          recordOperation(file.name, operation);
          markOperationApplied(file.name, operationId);
        }

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
  }, [addFiles, recordOperation, markOperationApplied]);

  const selectAll = useCallback(() => {
    setContextSelectedFiles(files.map(f => (f.file as any).id || f.name));
  }, [files, setContextSelectedFiles]);

  const deselectAll = useCallback(() => setContextSelectedFiles([]), [setContextSelectedFiles]);

  const closeAllFiles = useCallback(() => {
    if (activeFiles.length === 0) return;
    
    // Record close all operation for each file
    activeFiles.forEach(file => {
      const operationId = `close-all-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const operation: FileOperation = {
        id: operationId,
        type: 'remove',
        timestamp: Date.now(),
        fileIds: [file.name],
        status: 'pending',
        metadata: {
          originalFileName: file.name,
          fileSize: file.size,
          parameters: {
            action: 'close_all',
            reason: 'user_request'
          }
        }
      };
      
      recordOperation(file.name, operation);
      markOperationApplied(file.name, operationId);
    });
    
    // Remove all files from context but keep in storage
    removeFiles(activeFiles.map(f => (f as any).id || f.name), false);
    
    // Clear selections
    setContextSelectedFiles([]);
  }, [activeFiles, removeFiles, setContextSelectedFiles, recordOperation, markOperationApplied]);

  const toggleFile = useCallback((fileId: string) => {
    const targetFile = files.find(f => f.id === fileId);
    if (!targetFile) return;
    
    const contextFileId = (targetFile.file as any).id || targetFile.name;
    const isSelected = contextSelectedIds.includes(contextFileId);
    
    let newSelection: string[];
    
    if (isSelected) {
      // Remove file from selection
      newSelection = contextSelectedIds.filter(id => id !== contextFileId);
    } else {
      // Add file to selection
      if (maxFiles === 1) {
        newSelection = [contextFileId];
      } else {
        // Check if we've hit the selection limit
        if (maxFiles > 1 && contextSelectedIds.length >= maxFiles) {
          setStatus(`Maximum ${maxFiles} files can be selected`);
          return;
        }
        newSelection = [...contextSelectedIds, contextFileId];
      }
    }
    
    // Update context
    setContextSelectedFiles(newSelection);
    
    // Update tool selection context if in tool mode
    if (isToolMode || toolMode) {
      const selectedFiles = files
        .filter(f => {
          const fId = (f.file as any).id || f.name;
          return newSelection.includes(fId);
        })
        .map(f => f.file);
      setToolSelectedFiles(selectedFiles);
    }
  }, [files, setContextSelectedFiles, maxFiles, contextSelectedIds, setStatus, isToolMode, toolMode, setToolSelectedFiles]);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      const newMode = !prev;
      if (!newMode) {
        setContextSelectedFiles([]);
      }
      return newMode;
    });
  }, [setContextSelectedFiles]);


  // Drag and drop handlers
  const handleDragStart = useCallback((fileId: string) => {
    setDraggedFile(fileId);

    if (selectionMode && localSelectedIds.includes(fileId) && localSelectedIds.length > 1) {
      setMultiFileDrag({
        fileIds: localSelectedIds,
        count: localSelectedIds.length
      });
    } else {
      setMultiFileDrag(null);
    }
  }, [selectionMode, localSelectedIds]);

  const handleDragEnd = useCallback(() => {
    setDraggedFile(null);
    setDropTarget(null);
    setMultiFileDrag(null);
    setDragPosition(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();

    if (!draggedFile) return;

    if (multiFileDrag) {
      setDragPosition({ x: e.clientX, y: e.clientY });
    }

    const elementUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
    if (!elementUnderCursor) return;

    const fileContainer = elementUnderCursor.closest('[data-file-id]');
    if (fileContainer) {
      const fileId = fileContainer.getAttribute('data-file-id');
      if (fileId && fileId !== draggedFile) {
        setDropTarget(fileId);
        return;
      }
    }

    const endZone = elementUnderCursor.closest('[data-drop-zone="end"]');
    if (endZone) {
      setDropTarget('end');
      return;
    }

    setDropTarget(null);
  }, [draggedFile, multiFileDrag]);

  const handleDragEnter = useCallback((fileId: string) => {
    if (draggedFile && fileId !== draggedFile) {
      setDropTarget(fileId);
    }
  }, [draggedFile]);

  const handleDragLeave = useCallback(() => {
    // Let dragover handle this
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetFileId: string | 'end') => {
    e.preventDefault();
    if (!draggedFile || draggedFile === targetFileId) return;

    let targetIndex: number;
    if (targetFileId === 'end') {
      targetIndex = files.length;
    } else {
      targetIndex = files.findIndex(f => f.id === targetFileId);
      if (targetIndex === -1) return;
    }

    const filesToMove = selectionMode && localSelectedIds.includes(draggedFile)
      ? localSelectedIds
      : [draggedFile];

    // Update the local files state and sync with activeFiles
    setFiles(prev => {
      const newFiles = [...prev];
      const movedFiles = filesToMove.map(id => newFiles.find(f => f.id === id)!).filter(Boolean);

      // Remove moved files
      filesToMove.forEach(id => {
        const index = newFiles.findIndex(f => f.id === id);
        if (index !== -1) newFiles.splice(index, 1);
      });

      // Insert at target position
      newFiles.splice(targetIndex, 0, ...movedFiles);

      // TODO: Update context with reordered files (need to implement file reordering in context)
      // For now, just return the reordered local state
      return newFiles;
    });

    const moveCount = multiFileDrag ? multiFileDrag.count : 1;
    setStatus(`${moveCount > 1 ? `${moveCount} files` : 'File'} reordered`);

  }, [draggedFile, files, selectionMode, localSelectedIds, multiFileDrag]);

  const handleEndZoneDragEnter = useCallback(() => {
    if (draggedFile) {
      setDropTarget('end');
    }
  }, [draggedFile]);

  // File operations using context
  const handleDeleteFile = useCallback((fileId: string) => {
    console.log('handleDeleteFile called with fileId:', fileId);
    const file = files.find(f => f.id === fileId);
    console.log('Found file:', file);
    
    if (file) {
      console.log('Attempting to remove file:', file.name);
      console.log('Actual file object:', file.file);
      console.log('Actual file.file.name:', file.file.name);
      
      // Record close operation
      const fileName = file.file.name;
      const fileId = (file.file as any).id || fileName;
      const operationId = `close-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const operation: FileOperation = {
        id: operationId,
        type: 'remove',
        timestamp: Date.now(),
        fileIds: [fileName],
        status: 'pending',
        metadata: {
          originalFileName: fileName,
          fileSize: file.size,
          parameters: {
            action: 'close',
            reason: 'user_request'
          }
        }
      };
      
      recordOperation(fileName, operation);
      
      // Remove file from context but keep in storage (close, don't delete)
      console.log('Calling removeFiles with:', [fileId]);
      removeFiles([fileId], false);
      
      // Remove from context selections
      setContextSelectedFiles(prev => {
        const safePrev = Array.isArray(prev) ? prev : [];
        return safePrev.filter(id => id !== fileId);
      });
      
      // Mark operation as applied
      markOperationApplied(fileName, operationId);
    } else {
      console.log('File not found for fileId:', fileId);
    }
  }, [files, removeFiles, setContextSelectedFiles, recordOperation, markOperationApplied]);

  const handleViewFile = useCallback((fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file) {
      // Set the file as selected in context and switch to page editor view
      const contextFileId = (file.file as any).id || file.name;
      setContextSelectedFiles([contextFileId]);
      setCurrentView('pageEditor');
      onOpenPageEditor?.(file.file);
    }
  }, [files, setContextSelectedFiles, setCurrentView, onOpenPageEditor]);

  const handleMergeFromHere = useCallback((fileId: string) => {
    const startIndex = files.findIndex(f => f.id === fileId);
    if (startIndex === -1) return;

    const filesToMerge = files.slice(startIndex).map(f => f.file);
    if (onMergeFiles) {
      onMergeFiles(filesToMerge);
    }
  }, [files, onMergeFiles]);

  const handleSplitFile = useCallback((fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file && onOpenPageEditor) {
      onOpenPageEditor(file.file);
    }
  }, [files, onOpenPageEditor]);

  const handleLoadFromStorage = useCallback(async (selectedFiles: any[]) => {
    if (selectedFiles.length === 0) return;

    setLocalLoading(true);
    try {
      const convertedFiles = await Promise.all(
        selectedFiles.map(convertToFileItem)
      );
      setFiles(prev => [...prev, ...convertedFiles]);
      setStatus(`Loaded ${selectedFiles.length} files from storage`);
    } catch (err) {
      console.error('Error loading files from storage:', err);
      setError('Failed to load some files from storage');
    } finally {
      setLocalLoading(false);
    }
  }, [convertToFileItem]);


  return (
    <Box pos="relative" h="100vh" style={{ overflow: 'auto' }}>
      <LoadingOverlay visible={false} />

      <Box p="md" pt="xl">
        <Group mb="md">
          {showBulkActions && !toolMode && (
            <>
              <Button onClick={selectAll} variant="light">Select All</Button>
              <Button onClick={deselectAll} variant="light">Deselect All</Button>
              <Button onClick={closeAllFiles} variant="light" color="orange">
                Close All
              </Button>
            </>
          )}

          {/* Load from storage and upload buttons */}
          {showUpload && (
            <>
              <Button
                variant="outline"
                color="blue"
                onClick={() => setShowFilePickerModal(true)}
              >
                Load from Storage
              </Button>

              <Dropzone
                onDrop={handleFileUpload}
                accept={["*/*"]}
                multiple={true}
                maxSize={2 * 1024 * 1024 * 1024}
                style={{ display: 'contents' }}
              >
                <Button variant="outline" color="green">
                  Upload Files
                </Button>
              </Dropzone>
            </>
          )}
        </Group>


        {files.length === 0 && !localLoading && !zipExtractionProgress.isExtracting ? (
          <Center h="60vh">
            <Stack align="center" gap="md">
              <Text size="lg" c="dimmed">📁</Text>
              <Text c="dimmed">No files loaded</Text>
              <Text size="sm" c="dimmed">Upload PDF files, ZIP archives, or load from storage to get started</Text>
            </Stack>
          </Center>
        ) : files.length === 0 && (localLoading || zipExtractionProgress.isExtracting) ? (
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
            
            {/* Processing indicator */}
            {localLoading && (
              <Box mb="md" p="sm" style={{ backgroundColor: 'var(--mantine-color-blue-0)', borderRadius: 8 }}>
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={500}>Loading files...</Text>
                  <Text size="sm" c="dimmed">{Math.round(conversionProgress)}%</Text>
                </Group>
                <div style={{ 
                  width: '100%', 
                  height: '4px', 
                  backgroundColor: 'var(--mantine-color-gray-2)', 
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${Math.round(conversionProgress)}%`,
                    height: '100%',
                    backgroundColor: 'var(--mantine-color-blue-6)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </Box>
            )}
            
            <SkeletonLoader type="fileGrid" count={6} />
          </Box>
        ) : (
          <DragDropGrid
            items={files}
            selectedItems={localSelectedIds}
            selectionMode={selectionMode}
            isAnimating={isAnimating}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onEndZoneDragEnter={handleEndZoneDragEnter}
          draggedItem={draggedFile}
          dropTarget={dropTarget}
          multiItemDrag={multiFileDrag}
          dragPosition={dragPosition}
          renderItem={(file, index, refs) => (
            <FileThumbnail
              file={file}
              index={index}
              totalFiles={files.length}
              selectedFiles={localSelectedIds}
              selectionMode={selectionMode}
              draggedFile={draggedFile}
              dropTarget={dropTarget}
              isAnimating={isAnimating}
              fileRefs={refs}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onToggleFile={toggleFile}
              onDeleteFile={handleDeleteFile}
              onViewFile={handleViewFile}
              onMergeFromHere={handleMergeFromHere}
              onSplitFile={handleSplitFile}
              onSetStatus={setStatus}
              toolMode={toolMode}
            />
          )}
          renderSplitMarker={(file, index) => (
            <div
              style={{
                width: '2px',
                height: '24rem',
                borderLeft: '2px dashed #3b82f6',
                backgroundColor: 'transparent',
                marginLeft: '-0.75rem',
                marginRight: '-0.75rem',
                flexShrink: 0
              }}
            />
          )}
        />
        )}
      </Box>

      {/* File Picker Modal */}
      <FilePickerModal
        opened={showFilePickerModal}
        onClose={() => setShowFilePickerModal(false)}
        storedFiles={[]} // FileEditor doesn't have access to stored files, needs to be passed from parent
        onSelectFiles={handleLoadFromStorage}
        allowMultiple={true}
      />

      {status && (
        <Notification
          color="blue"
          mt="md"
          onClose={() => setStatus(null)}
          style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1000 }}
        >
          {status}
        </Notification>
      )}

      {error && (
        <Notification
          color="red"
          mt="md"
          onClose={() => setError(null)}
          style={{ position: 'fixed', bottom: 80, right: 20, zIndex: 1000 }}
        >
          {error}
        </Notification>
      )}
    </Box>
  );
};

export default FileEditor;
