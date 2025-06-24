import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Button, Text, Center, Box, Notification, TextInput, LoadingOverlay, Modal, Alert, Container,
  Stack, Group
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { useTranslation } from 'react-i18next';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { fileStorage } from '../../services/fileStorage';
import { generateThumbnailForFile } from '../../utils/thumbnailUtils';
import styles from './PageEditor.module.css';
import FileThumbnail from './FileThumbnail';
import BulkSelectionPanel from './BulkSelectionPanel';
import DragDropGrid from './shared/DragDropGrid';
import FilePickerModal from '../shared/FilePickerModal';

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
  sharedFiles?: { file: File; url: string }[];
  setSharedFiles?: (files: { file: File; url: string }[]) => void;
  preSelectedFiles?: { file: File; url: string }[];
  onClearPreSelection?: () => void;
}

const FileEditor = ({
  onOpenPageEditor,
  onMergeFiles,
  sharedFiles = [],
  setSharedFiles,
  preSelectedFiles = [],
  onClearPreSelection
}: FileEditorProps) => {
  const { t } = useTranslation();

  const files = sharedFiles; // Use sharedFiles as the source of truth

  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvInput, setCsvInput] = useState<string>('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [draggedFile, setDraggedFile] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [multiFileDrag, setMultiFileDrag] = useState<{fileIds: string[], count: number} | null>(null);
  const [dragPosition, setDragPosition] = useState<{x: number, y: number} | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showFilePickerModal, setShowFilePickerModal] = useState(false);
  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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

  // Only load shared files when explicitly passed (not on mount)
  useEffect(() => {
    const loadSharedFiles = async () => {
      // Only load if we have pre-selected files (coming from FileManager)
      if (preSelectedFiles.length > 0) {
        setLoading(true);
        try {
          const convertedFiles = await Promise.all(
            preSelectedFiles.map(convertToFileItem)
          );
          setFiles(convertedFiles);
        } catch (err) {
          console.error('Error converting pre-selected files:', err);
        } finally {
          setLoading(false);
        }
      }
    };

    loadSharedFiles();
  }, [preSelectedFiles, convertToFileItem]);

  // Handle pre-selected files
  useEffect(() => {
    if (preSelectedFiles.length > 0) {
      const preSelectedIds = preSelectedFiles.map(f => f.id || f.name);
      setSelectedFiles(preSelectedIds);
      onClearPreSelection?.();
    }
  }, [preSelectedFiles, onClearPreSelection]);

  // Process uploaded files
  const handleFileUpload = useCallback(async (uploadedFiles: File[]) => {
    setLoading(true);
    setError(null);

    try {
      const newFiles: FileItem[] = [];

      for (const file of uploadedFiles) {
        if (file.type !== 'application/pdf') {
          setError('Please upload only PDF files');
          continue;
        }

        // Generate thumbnail and get page count
        const thumbnail = await generateThumbnailForFile(file);

        const fileItem: FileItem = {
          id: `file-${Date.now()}-${Math.random()}`,
          name: file.name.replace(/\.pdf$/i, ''),
          pageCount: Math.floor(Math.random() * 20) + 1, // Mock page count
          thumbnail,
          size: file.size,
          file,
        };

        newFiles.push(fileItem);

        // Store in IndexedDB
        await fileStorage.storeFile(file, thumbnail);
      }

      if (setSharedFiles) {
        setSharedFiles(prev => [...prev, ...newFiles]);
      }

      setStatus(`Added ${newFiles.length} files`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process files';
      setError(errorMessage);
      console.error('File processing error:', err);
    } finally {
      setLoading(false);
    }
  }, [setSharedFiles]);

  const selectAll = useCallback(() => {
    setSelectedFiles(files.map(f => f.id));
  }, [files]);

  const deselectAll = useCallback(() => setSelectedFiles([]), []);

  const toggleFile = useCallback((fileId: string) => {
    setSelectedFiles(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      const newMode = !prev;
      if (!newMode) {
        setSelectedFiles([]);
        setCsvInput('');
      }
      return newMode;
    });
  }, []);

  const parseCSVInput = useCallback((csv: string) => {
    const fileIds: string[] = [];
    const ranges = csv.split(',').map(s => s.trim()).filter(Boolean);

    ranges.forEach(range => {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(n => parseInt(n.trim()));
        for (let i = start; i <= end && i <= files.length; i++) {
          if (i > 0) {
            const file = files[i - 1];
            if (file) fileIds.push(file.id);
          }
        }
      } else {
        const fileIndex = parseInt(range);
        if (fileIndex > 0 && fileIndex <= files.length) {
          const file = files[fileIndex - 1];
          if (file) fileIds.push(file.id);
        }
      }
    });

    return fileIds;
  }, [files]);

  const updateFilesFromCSV = useCallback(() => {
    const fileIds = parseCSVInput(csvInput);
    setSelectedFiles(fileIds);
  }, [csvInput, parseCSVInput]);

  // Drag and drop handlers
  const handleDragStart = useCallback((fileId: string) => {
    setDraggedFile(fileId);

    if (selectionMode && selectedFiles.includes(fileId) && selectedFiles.length > 1) {
      setMultiFileDrag({
        fileIds: selectedFiles,
        count: selectedFiles.length
      });
    } else {
      setMultiFileDrag(null);
    }
  }, [selectionMode, selectedFiles]);

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

    const filesToMove = selectionMode && selectedFiles.includes(draggedFile)
      ? selectedFiles
      : [draggedFile];

    if (setSharedFiles) {
      setSharedFiles(prev => {
        const newFiles = [...prev];
        const movedFiles = filesToMove.map(id => newFiles.find(f => f.id === id)!).filter(Boolean);

        // Remove moved files
        filesToMove.forEach(id => {
          const index = newFiles.findIndex(f => f.id === id);
          if (index !== -1) newFiles.splice(index, 1);
        });

        // Insert at target position
        newFiles.splice(targetIndex, 0, ...movedFiles);
        return newFiles;
      });
    }

    const moveCount = multiFileDrag ? multiFileDrag.count : 1;
    setStatus(`${moveCount > 1 ? `${moveCount} files` : 'File'} reordered`);

    handleDragEnd();
  }, [draggedFile, files, selectionMode, selectedFiles, multiFileDrag, handleDragEnd, setSharedFiles]);

  const handleEndZoneDragEnter = useCallback(() => {
    if (draggedFile) {
      setDropTarget('end');
    }
  }, [draggedFile]);

  // File operations
  const handleDeleteFile = useCallback((fileId: string) => {
    if (setSharedFiles) {
      setSharedFiles(prev => prev.filter(f => f.id !== fileId));
    }
    setSelectedFiles(prev => prev.filter(id => id !== fileId));
  }, [setSharedFiles]);

  const handleViewFile = useCallback((fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file && onOpenPageEditor) {
      onOpenPageEditor(file.file);
    }
  }, [files, onOpenPageEditor]);

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

    setLoading(true);
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
      setLoading(false);
    }
  }, [convertToFileItem]);


  return (
    <Box pos="relative" h="100vh" style={{ overflow: 'auto' }}>
      <LoadingOverlay visible={loading} />

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
            selectedPages={selectedFiles}
            onUpdatePagesFromCSV={updateFilesFromCSV}
          />
        )}

        <DragDropGrid
          items={files}
          selectedItems={selectedFiles}
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
              selectedFiles={selectedFiles}
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
      </Box>

      {/* File Picker Modal */}
      <FilePickerModal
        opened={showFilePickerModal}
        onClose={() => setShowFilePickerModal(false)}
        sharedFiles={sharedFiles || []}
        onSelectFiles={handleLoadFromStorage}
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
