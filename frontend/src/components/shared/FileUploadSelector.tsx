import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Stack, Button, Text, Center, Box, Divider } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useTranslation } from 'react-i18next';
import { fileStorage } from '../../services/fileStorage';
import { FileWithUrl } from '../../types/file';
import FileGrid from './FileGrid';
import MultiSelectControls from './MultiSelectControls';

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
  accept = ["application/pdf"],
  loading = false,
  disabled = false,
  showRecentFiles = true,
  maxRecentFiles = 8,
}: FileUploadSelectorProps) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Recent files state
  const [recentFiles, setRecentFiles] = useState<FileWithUrl[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [showingAllRecent, setShowingAllRecent] = useState(false);
  const [recentFilesLoading, setRecentFilesLoading] = useState(false);

  const handleFileUpload = useCallback(async (uploadedFiles: File[]) => {
    if (uploadedFiles.length === 0) return;

    // Auto-save uploaded files to recent files
    if (showRecentFiles) {
      try {
        for (const file of uploadedFiles) {
          await fileStorage.storeFile(file);
        }
        // Refresh recent files list
        loadRecentFiles();
      } catch (error) {
        console.error('Failed to save files to recent:', error);
      }
    }

    if (onFilesSelect) {
      onFilesSelect(uploadedFiles);
    } else if (onFileSelect) {
      onFileSelect(uploadedFiles[0]);
    }
  }, [onFileSelect, onFilesSelect, showRecentFiles]);

  const handleFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      console.log('File input change:', fileArray.length, 'files');
      handleFileUpload(fileArray);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFileUpload]);

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Load recent files from storage
  const loadRecentFiles = useCallback(async () => {
    if (!showRecentFiles) return;

    setRecentFilesLoading(true);
    try {
      const files = await fileStorage.getAllFiles();
      // Sort by last modified date (newest first)
      const sortedFiles = files.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
      setRecentFiles(sortedFiles);
    } catch (error) {
      console.error('Failed to load recent files:', error);
      setRecentFiles([]);
    } finally {
      setRecentFilesLoading(false);
    }
  }, [showRecentFiles]);

  // Convert FileWithUrl to File for upload
  const convertToFile = async (fileWithUrl: FileWithUrl): Promise<File> => {
    if (fileWithUrl.url && fileWithUrl.url.startsWith('blob:')) {
      const response = await fetch(fileWithUrl.url);
      const data = await response.arrayBuffer();
      return new File([data], fileWithUrl.name, {
        type: fileWithUrl.type || 'application/pdf',
        lastModified: fileWithUrl.lastModified || Date.now()
      });
    }

    // Load from IndexedDB
    const storedFile = await fileStorage.getFile(fileWithUrl.id || fileWithUrl.name);
    if (storedFile) {
      return new File([storedFile.data], storedFile.name, {
        type: storedFile.type,
        lastModified: storedFile.lastModified
      });
    }

    throw new Error('File not found in storage');
  };

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
  }, [onFileSelect, onFilesSelect]);

  const handleSelectedRecentFiles = useCallback(async () => {
    if (selectedFiles.length === 0) return;

    try {
      const selectedFileObjects = recentFiles.filter(f => selectedFiles.includes(f.id || f.name));
      const filePromises = selectedFileObjects.map(convertToFile);
      const files = await Promise.all(filePromises);

      if (onFilesSelect) {
        onFilesSelect(files);
      }

      setSelectedFiles([]);
    } catch (error) {
      console.error('Failed to load selected files:', error);
    }
  }, [selectedFiles, recentFiles, onFilesSelect]);

  const toggleFileSelection = useCallback((fileId: string) => {
    setSelectedFiles(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  }, []);

  // Load recent files on mount
  useEffect(() => {
    loadRecentFiles();
  }, [loadRecentFiles]);

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
              onDrop={handleFileUpload}
              accept={accept}
              multiple={true}
              disabled={disabled || loading}
              style={{ width: '100%', height: "5rem" }}
              activateOnClick={true}
            >
              <Center>
                <Stack align="center" gap="sm">
                  <Text size="md" fw={500}>
                    {t("fileUpload.dropFilesHere", "Drop files here or click to upload")}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {accept.includes('application/pdf')
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
            onClearSelection={() => setSelectedFiles([])}
            onAddToUpload={handleSelectedRecentFiles}
          />

          <FileGrid
            files={recentFiles}
            onDoubleClick={handleRecentFileSelection}
            onSelect={toggleFileSelection}
            selectedFiles={selectedFiles}
            maxDisplay={showingAllRecent ? undefined : maxRecentFiles}
            onShowAll={() => setShowingAllRecent(true)}
            showingAll={showingAllRecent}
            showSearch={showingAllRecent}
            showSort={showingAllRecent}
          />

          {showingAllRecent && (
            <Center mt="md">
              <Button
                variant="light"
                onClick={() => setShowingAllRecent(false)}
              >
                {t("fileUpload.showLess", "Show Less")}
              </Button>
            </Center>
          )}
        </Box>
      )}
            </Stack>
    </>
  );
};

export default FileUploadSelector;
