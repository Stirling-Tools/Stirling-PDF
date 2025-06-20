import React, { useState, useCallback } from 'react';
import { Stack, Button, Text, Center } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useTranslation } from 'react-i18next';
import FilePickerModal from './FilePickerModal';

interface FileUploadSelectorProps {
  // Appearance
  title?: string;
  subtitle?: string;
  showDropzone?: boolean;

  // File handling
  sharedFiles?: any[];
  onFileSelect: (file: File) => void;
  onFilesSelect?: (files: File[]) => void;
  allowMultiple?: boolean;
  accept?: string[];

  // Loading state
  loading?: boolean;
  disabled?: boolean;
}

const FileUploadSelector = ({
  title = "Select a file",
  subtitle = "Choose from storage or upload a new file",
  showDropzone = true,
  sharedFiles = [],
  onFileSelect,
  onFilesSelect,
  allowMultiple = false,
  accept = ["application/pdf"],
  loading = false,
  disabled = false,
}: FileUploadSelectorProps) => {
  const { t } = useTranslation();
  const [showFilePickerModal, setShowFilePickerModal] = useState(false);

  const handleFileUpload = useCallback((uploadedFiles: File[]) => {
    if (uploadedFiles.length === 0) return;

    if (allowMultiple && onFilesSelect) {
      onFilesSelect(uploadedFiles);
    } else {
      onFileSelect(uploadedFiles[0]);
    }
  }, [allowMultiple, onFileSelect, onFilesSelect]);

  const handleStorageSelection = useCallback((selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;

    if (allowMultiple && onFilesSelect) {
      onFilesSelect(selectedFiles);
    } else {
      onFileSelect(selectedFiles[0]);
    }
  }, [allowMultiple, onFileSelect, onFilesSelect]);

  return (
    <>
      <Stack align="center" gap="xl">
        {/* Title and description */}
        <Stack align="center" gap="md">
          <UploadFileIcon style={{ fontSize: 64 }} />
          <Text size="xl" fw={500}>
            {title}
          </Text>
          <Text size="md" c="dimmed">
            {subtitle}
          </Text>
        </Stack>

        {/* Action buttons */}
        <Stack align="center" gap="md" w="100%">
          <Button
            variant="filled"
            size="lg"
            onClick={() => setShowFilePickerModal(true)}
            disabled={disabled || sharedFiles.length === 0}
            loading={loading}
          >
            {loading ? "Loading..." : `Load from Storage (${sharedFiles.length} files available)`}
          </Button>

          <Text size="md" c="dimmed">
            or
          </Text>

          {showDropzone ? (
            <Dropzone
              onDrop={handleFileUpload}
              accept={accept}
              multiple={allowMultiple}
              disabled={disabled || loading}
              style={{ width: '100%', minHeight: 120 }}
            >
              <Center>
                <Stack align="center" gap="sm">
                  <Text size="md" fw={500}>
                    {allowMultiple ? 'Drop files here or click to upload' : 'Drop file here or click to upload'}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {accept.includes('application/pdf') ? 'PDF files only' : 'Supported file types'}
                  </Text>
                </Stack>
              </Center>
            </Dropzone>
          ) : (
            <Dropzone
              onDrop={handleFileUpload}
              accept={accept}
              multiple={allowMultiple}
              disabled={disabled || loading}
              style={{ display: 'contents' }}
            >
              <Button
                variant="outline"
                size="lg"
                disabled={disabled}
                loading={loading}
              >
                Upload {allowMultiple ? 'Files' : 'File'}
              </Button>
            </Dropzone>
          )}
        </Stack>
      </Stack>

      {/* File Picker Modal */}
      <FilePickerModal
        opened={showFilePickerModal}
        onClose={() => setShowFilePickerModal(false)}
        sharedFiles={sharedFiles}
        onSelectFiles={handleStorageSelection}
      />
    </>
  );
};

export default FileUploadSelector;
