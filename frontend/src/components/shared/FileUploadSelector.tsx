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
  title,
  subtitle,
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

  // Get default title and subtitle from translations if not provided
  const displayTitle = title || t(allowMultiple ? "fileUpload.selectFiles" : "fileUpload.selectFile",
    allowMultiple ? "Select files" : "Select a file");
  const displaySubtitle = subtitle || t(allowMultiple ? "fileUpload.chooseFromStorageMultiple" : "fileUpload.chooseFromStorage",
    allowMultiple ? "Choose files from storage or upload new PDFs" : "Choose a file from storage or upload a new PDF");

  return (
    <>
      <Stack align="center" gap="xl">
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
            {t("fileUpload.or", "or")}
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
                    {t(allowMultiple ? "fileUpload.dropFilesHere" : "fileUpload.dropFileHere",
                      allowMultiple ? "Drop files here or click to upload" : "Drop file here or click to upload")}
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
                {t(allowMultiple ? "fileUpload.uploadFiles" : "fileUpload.uploadFile",
                  allowMultiple ? "Upload Files" : "Upload File")}
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
