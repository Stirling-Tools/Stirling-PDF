import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Button, Text, Center, Box, Notification, TextInput, LoadingOverlay, Modal, Alert, Container,
  Stack, Group
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { useTranslation } from 'react-i18next';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useFileContext } from '../../contexts/FileContext';
import { fileStorage } from '../../services/fileStorage';
import { generateThumbnailForFile } from '../../utils/thumbnailUtils';
import styles from '../pageEditor/PageEditor.module.css';
import FileThumbnail from '../pageEditor/FileThumbnail';
import BulkSelectionPanel from '../pageEditor/BulkSelectionPanel';
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
}

const FileEditor = ({
  onOpenPageEditor,
  onMergeFiles
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
    setCurrentView
  } = fileContext;

  const [files, setFiles] = useState<FileItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [csvInput, setCsvInput] = useState<string>('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [draggedFile, setDraggedFile] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [multiFileDrag, setMultiFileDrag] = useState<{fileIds: string[], count: number} | null>(null);
  const [dragPosition, setDragPosition] = useState<{x: number, y: number} | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showFilePickerModal, setShowFilePickerModal] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Map context selected file names to local file IDs
  const localSelectedFiles = files
    .filter(file => selectedFileIds.includes(file.name))
    .map(file => file.id);

  // Convert shared files to FileEditor format
  const convertToFileItem = useCallback(async (sharedFile: any): Promise<FileItem> => {
    // Generate thumbnail if not already available
    const thumbnail = sharedFile.thumbnail || await generateThumbnailForFile(sharedFile.file || sharedFile);

    return {
      id: sharedFile.id || `file-${Date.now()}-${Math.random()}`,
      name: (sharedFile.file?.name || sharedFile.name || 'unknown').replace(/\.pdf$/i, ''),
      pageCount: sharedFile.pageCount || Math.floor(Math.random() * 20) + 1, // Mock for now
      thumbnail,
      size: sharedFile.file?.size || sharedFile.size || 0,
      file: sharedFile.file || sharedFile,
    };
  }, []);

  // Convert activeFiles to FileItem format using context (async to avoid blocking)
  useEffect(() => {
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
              name: file.name.replace(/\.pdf$/i, ''),
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
      const validFiles = uploadedFiles.filter(file => {
        if (file.type !== 'application/pdf') {
          setError('Please upload only PDF files');
          return false;
        }
        return true;
      });

      if (validFiles.length > 0) {
        // Add files to context (they will be processed automatically)
        await addFiles(validFiles);
        setStatus(`Added ${validFiles.length} files`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process files';
      setError(errorMessage);
      console.error('File processing error:', err);
    }
  }, [addFiles]);

  const selectAll = useCallback(() => {
    setContextSelectedFiles(files.map(f => f.name)); // Use file name as ID for context
  }, [files, setContextSelectedFiles]);

  const deselectAll = useCallback(() => setContextSelectedFiles([]), [setContextSelectedFiles]);

  const toggleFile = useCallback((fileId: string) => {
    const fileName = files.find(f => f.id === fileId)?.name || fileId;
    setContextSelectedFiles(prev =>
      prev.includes(fileName)
        ? prev.filter(id => id !== fileName)
        : [...prev, fileName]
    );
  }, [files, setContextSelectedFiles]);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      const newMode = !prev;
      if (!newMode) {
        setContextSelectedFiles([]);
        setCsvInput('');
      }
      return newMode;
    });
  }, [setContextSelectedFiles]);

  const parseCSVInput = useCallback((csv: string) => {
    const fileNames: string[] = [];
    const ranges = csv.split(',').map(s => s.trim()).filter(Boolean);

    ranges.forEach(range => {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(n => parseInt(n.trim()));
        for (let i = start; i <= end && i <= files.length; i++) {
          if (i > 0) {
            const file = files[i - 1];
            if (file) fileNames.push(file.name);
          }
        }
      } else {
        const fileIndex = parseInt(range);
        if (fileIndex > 0 && fileIndex <= files.length) {
          const file = files[fileIndex - 1];
          if (file) fileNames.push(file.name);
        }
      }
    });

    return fileNames;
  }, [files]);

  const updateFilesFromCSV = useCallback(() => {
    const fileNames = parseCSVInput(csvInput);
    setContextSelectedFiles(fileNames);
  }, [csvInput, parseCSVInput, setContextSelectedFiles]);

  // Drag and drop handlers
  const handleDragStart = useCallback((fileId: string) => {
    setDraggedFile(fileId);

    if (selectionMode && localSelectedFiles.includes(fileId) && localSelectedFiles.length > 1) {
      setMultiFileDrag({
        fileIds: localSelectedFiles,
        count: localSelectedFiles.length
      });
    } else {
      setMultiFileDrag(null);
    }
  }, [selectionMode, localSelectedFiles]);

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

    const filesToMove = selectionMode && localSelectedFiles.includes(draggedFile)
      ? localSelectedFiles
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

  }, [draggedFile, files, selectionMode, localSelectedFiles, multiFileDrag]);

  const handleEndZoneDragEnter = useCallback(() => {
    if (draggedFile) {
      setDropTarget('end');
    }
  }, [draggedFile]);

  // File operations using context
  const handleDeleteFile = useCallback((fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file) {
      // Remove from context
      removeFiles([file.name]);
      // Remove from context selections
      setContextSelectedFiles(prev => prev.filter(id => id !== file.name));
    }
  }, [files, removeFiles, setContextSelectedFiles]);

  const handleViewFile = useCallback((fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file) {
      // Set the file as selected in context and switch to page editor view
      setContextSelectedFiles([file.name]);
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
          <Button
            onClick={toggleSelectionMode}
            variant={selectionMode ? "filled" : "outline"}
            color={selectionMode ? "blue" : "gray"}
            styles={{
              root: {
                transition: 'all 0.2s ease',
                ...(selectionMode && {
                  boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
                })
              }
            }}
          >
            {selectionMode ? "Exit Selection" : "Select Files"}
          </Button>
          {selectionMode && (
            <>
              <Button onClick={selectAll} variant="light">Select All</Button>
              <Button onClick={deselectAll} variant="light">Deselect All</Button>
            </>
          )}

          {/* Load from storage and upload buttons */}
          <Button
            variant="outline"
            color="blue"
            onClick={() => setShowFilePickerModal(true)}
          >
            Load from Storage
          </Button>

          <Dropzone
            onDrop={handleFileUpload}
            accept={["application/pdf"]}
            multiple={true}
            maxSize={2 * 1024 * 1024 * 1024}
            style={{ display: 'contents' }}
          >
            <Button variant="outline" color="green">
              Upload Files
            </Button>
          </Dropzone>
        </Group>

        {selectionMode && (
          <BulkSelectionPanel
            csvInput={csvInput}
            setCsvInput={setCsvInput}
            selectedPages={localSelectedFiles}
            onUpdatePagesFromCSV={updateFilesFromCSV}
          />
        )}

        {files.length === 0 && !localLoading ? (
          <Center h="60vh">
            <Stack align="center" gap="md">
              <Text size="lg" c="dimmed">📁</Text>
              <Text c="dimmed">No files loaded</Text>
              <Text size="sm" c="dimmed">Upload files or load from storage to get started</Text>
            </Stack>
          </Center>
        ) : files.length === 0 && localLoading ? (
          <Box>
            <SkeletonLoader type="controls" />
            
            {/* Processing indicator */}
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
            
            <SkeletonLoader type="fileGrid" count={6} />
          </Box>
        ) : (
          <DragDropGrid
            items={files}
            selectedItems={localSelectedFiles}
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
              selectedFiles={localSelectedFiles}
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
