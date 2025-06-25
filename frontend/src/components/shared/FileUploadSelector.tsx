import React, { useState, useCallback, useRef } from 'react';
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
  onFileSelect?: (file: File) => void;
  onFilesSelect: (files: File[]) => void;
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
  accept = ["application/pdf"],
  loading = false,
  disabled = false,
}: FileUploadSelectorProps) => {
  const { t } = useTranslation();
  const [showFilePickerModal, setShowFilePickerModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback((uploadedFiles: File[]) => {
    if (uploadedFiles.length === 0) return;

    if (onFilesSelect) {
      onFilesSelect(uploadedFiles);
    } else if (onFileSelect) {
      onFileSelect(uploadedFiles[0]);
    }
  }, [onFileSelect, onFilesSelect]);

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

  const handleStorageSelection = useCallback((selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;

    if (onFilesSelect) {
      onFilesSelect(selectedFiles);
    } else if (onFileSelect) {
      onFileSelect(selectedFiles[0]);
    }
  }, [onFileSelect, onFilesSelect]);

  // Get default title and subtitle from translations if not provided
  const displayTitle = title || t("fileUpload.selectFiles", "Select files");
  const displaySubtitle = subtitle || t("fileUpload.chooseFromStorageMultiple", "Choose files from storage or upload new PDFs");

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
              multiple={true}
              disabled={disabled || loading}
              style={{ width: '100%', minHeight: 120 }}
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
      </Stack>

      {/* File Picker Modal */}
      <FilePickerModal
        opened={showFilePickerModal}
        onClose={() => setShowFilePickerModal(false)}
        storedFiles={sharedFiles}
        onSelectFiles={handleStorageSelection}
      />
    </>
  );
};

export default FileUploadSelector;
