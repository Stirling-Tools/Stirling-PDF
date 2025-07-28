import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Stack, Button, Text, Center, Box, Divider } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useTranslation } from 'react-i18next';
import { fileStorage } from '../../services/fileStorage';
import { FileWithUrl } from '../../types/file';
import FileGrid from './FileGrid';
import MultiSelectControls from './MultiSelectControls';
import { useFileManager } from '../../hooks/useFileManager';

interface FileUploadSelectorProps {
  // Appearance
  title?: string;
  subtitle?: string;
  showDropzone?: boolean;

  // File handling
  sharedFiles?: any[];
  onFileSelect?: (file: File) => void;
  onFilesSelect: (files: File[]) => void;
  accept?: string[];

  // Loading state
  loading?: boolean;
  disabled?: boolean;

  // Recent files
  showRecentFiles?: boolean;
  maxRecentFiles?: number;
}

const FileUploadSelector = ({
  title,
  subtitle,
  showDropzone = true,
  sharedFiles = [],
  onFileSelect,
  onFilesSelect,
  accept = ["application/pdf", "application/zip", "application/x-zip-compressed"],
  loading = false,
  disabled = false,
  showRecentFiles = true,
  maxRecentFiles = 8,
}: FileUploadSelectorProps) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [recentFiles, setRecentFiles] = useState<FileWithUrl[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  const { loadRecentFiles, handleRemoveFile, storeFile, convertToFile, createFileSelectionHandlers } = useFileManager();

  const refreshRecentFiles = useCallback(async () => {
    const files = await loadRecentFiles();
    setRecentFiles(files);
  }, [loadRecentFiles]);

  const handleNewFileUpload = useCallback(async (uploadedFiles: File[]) => {
    if (uploadedFiles.length === 0) return;

    if (showRecentFiles) {
      try {
        for (const file of uploadedFiles) {
          await storeFile(file);
        }
        refreshRecentFiles();
      } catch (error) {
        console.error('Failed to save files to recent:', error);
      }
    }

    if (onFilesSelect) {
      onFilesSelect(uploadedFiles);
    } else if (onFileSelect) {
      onFileSelect(uploadedFiles[0]);
    }
  }, [onFileSelect, onFilesSelect, showRecentFiles, storeFile, refreshRecentFiles]);

  const handleFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      console.log('File input change:', fileArray.length, 'files');
      handleNewFileUpload(fileArray);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleNewFileUpload]);

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleRecentFileSelection = useCallback(async (file: FileWithUrl) => {
    try {
      const fileObj = await convertToFile(file);
      if (onFilesSelect) {
        onFilesSelect([fileObj]);
      } else if (onFileSelect) {
        onFileSelect(fileObj);
      }
    } catch (error) {
      console.error('Failed to load file from recent:', error);
    }
  }, [onFileSelect, onFilesSelect, convertToFile]);

  const selectionHandlers = createFileSelectionHandlers(selectedFiles, setSelectedFiles);

  const handleSelectedRecentFiles = useCallback(async () => {
    if (onFilesSelect) {
      await selectionHandlers.selectMultipleFiles(recentFiles, onFilesSelect);
    }
  }, [recentFiles, onFilesSelect, selectionHandlers]);

  const handleRemoveFileByIndex = useCallback(async (index: number) => {
    await handleRemoveFile(index, recentFiles, setRecentFiles);
    const file = recentFiles[index];
    setSelectedFiles(prev => prev.filter(id => id !== (file.id || file.name)));
  }, [handleRemoveFile, recentFiles]);

  useEffect(() => {
    if (showRecentFiles) {
      refreshRecentFiles();
    }
  }, [showRecentFiles, refreshRecentFiles]);

  // Get default title and subtitle from translations if not provided
  const displayTitle = title || t("fileUpload.selectFiles", "Select files");
  const displaySubtitle = subtitle || t("fileUpload.chooseFromStorageMultiple", "Choose files from storage or upload new PDFs");

  return (
    <>
      <Stack align="center" gap="sm">
        {/* Title and description */}
        <Stack align="center" gap="md">
          <UploadFileIcon style={{ fontSize: 64 }} />
          <Text size="xl" fw={500}>
            {displayTitle}
          </Text>
          <Text size="md" c="dimmed">
            {displaySubtitle}
          </Text>
        </Stack>

        {/* Action buttons */}
        <Stack align="center" gap="md" w="100%">

          {showDropzone ? (
            <Dropzone
              onDrop={handleNewFileUpload}
              accept={accept}
              multiple={true}
              disabled={disabled || loading}
              style={{ width: '100%', height: "5rem" }}
              activateOnClick={true}
              data-testid="file-dropzone"
            >
              <Center>
                <Stack align="center" gap="sm">
                  <Text size="md" fw={500}>
                    {t("fileUpload.dropFilesHere", "Drop files here or click to upload")}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {accept.includes('application/pdf') && accept.includes('application/zip')
                      ? t("fileUpload.pdfAndZipFiles", "PDF and ZIP files")
                      : accept.includes('application/pdf')
                      ? t("fileUpload.pdfFilesOnly", "PDF files only")
                      : t("fileUpload.supportedFileTypes", "Supported file types")
                    }
                  </Text>
                </Stack>
              </Center>
            </Dropzone>
          ) : (
            <Stack align="center" gap="sm">
              <Button
                variant="outline"
                size="lg"
                disabled={disabled}
                loading={loading}
                onClick={openFileDialog}
              >
                {t("fileUpload.uploadFiles", "Upload Files")}
              </Button>

              {/* Manual file input as backup */}
              <input
                ref={fileInputRef}
                type="file"
                multiple={true}
                accept={accept.join(',')}
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
                data-testid="file-input"
              />
            </Stack>
          )}
        </Stack>

      {/* Recent Files Section */}
      {showRecentFiles && recentFiles.length > 0 && (
        <Box w="100%" >
          <Divider my="md" />
          <Text size="lg" fw={500} mb="md">
            {t("fileUpload.recentFiles", "Recent Files")}
          </Text>
          <MultiSelectControls
            selectedCount={selectedFiles.length}
            onClearSelection={selectionHandlers.clearSelection}
            onAddToUpload={handleSelectedRecentFiles}
            onDeleteAll={async () => {
              await Promise.all(recentFiles.map(async (file) => {
                await fileStorage.deleteFile(file.id || file.name);
              }));
              setRecentFiles([]);
              setSelectedFiles([]);
            }}
          />

          <FileGrid
            files={recentFiles}
            onDoubleClick={handleRecentFileSelection}
            onSelect={selectionHandlers.toggleSelection}
            onRemove={handleRemoveFileByIndex}
            selectedFiles={selectedFiles}
            showSearch={true}
            showSort={true}
            onDeleteAll={async () => {
              await Promise.all(recentFiles.map(async (file) => {
                await fileStorage.deleteFile(file.id || file.name);
              }));
              setRecentFiles([]);
              setSelectedFiles([]);
            }}
          />
        </Box>
      )}
            </Stack>
    </>
  );
};

export default FileUploadSelector;
