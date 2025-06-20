import React, { useState, useEffect } from "react";
import { Box, Flex, Text, Notification, Button, Group } from "@mantine/core";
import { Dropzone, MIME_TYPES } from "@mantine/dropzone";
import { useTranslation } from "react-i18next";

import { GlobalWorkerOptions } from "pdfjs-dist";
import { StorageStats } from "../../services/fileStorage";
import { FileWithUrl, defaultStorageConfig } from "../../types/file";

// Refactored imports
import { fileOperationsService } from "../../services/fileOperationsService";
import { checkStorageWarnings } from "../../utils/storageUtils";
import StorageStatsCard from "./StorageStatsCard";
import FileCard from "./FileCard";
import FileUploadSelector from "../shared/FileUploadSelector";

GlobalWorkerOptions.workerSrc = "/pdf.worker.js";

interface FileManagerProps {
  files: FileWithUrl[];
  setFiles: React.Dispatch<React.SetStateAction<FileWithUrl[]>>;
  allowMultiple?: boolean;
  setCurrentView?: (view: string) => void;
  onOpenFileEditor?: (selectedFiles?: FileWithUrl[]) => void;
}

const FileManager = ({
  files = [],
  setFiles,
  allowMultiple = true,
  setCurrentView,
  onOpenFileEditor,
}: FileManagerProps) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  // Extract operations from service for cleaner code
  const {
    loadStorageStats,
    forceReloadFiles,
    loadExistingFiles,
    uploadFiles,
    removeFile,
    clearAllFiles,
    createBlobUrlForFile,
    checkForPurge,
    updateStorageStatsIncremental
  } = fileOperationsService;

  // Add CSS for spinner animation
  useEffect(() => {
    if (!document.querySelector('#spinner-animation')) {
      const style = document.createElement('style');
      style.id = 'spinner-animation';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Load existing files from IndexedDB on mount
  useEffect(() => {
    if (!filesLoaded) {
      handleLoadExistingFiles();
    }
  }, [filesLoaded]);

  // Load storage stats and set up periodic updates
  useEffect(() => {
    handleLoadStorageStats();

    const interval = setInterval(async () => {
      await handleLoadStorageStats();
      await handleCheckForPurge();
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, []);

  // Sync UI with IndexedDB whenever storage stats change
  useEffect(() => {
    const syncWithStorage = async () => {
      if (storageStats && filesLoaded) {
        // If file counts don't match, force reload
        if (storageStats.fileCount !== files.length) {
          console.warn('File count mismatch: storage has', storageStats.fileCount, 'but UI shows', files.length, '- forcing reload');
          const reloadedFiles = await forceReloadFiles();
          setFiles(reloadedFiles);
        }
      }
    };

    syncWithStorage();
  }, [storageStats, filesLoaded, files.length]);

  // Handlers using extracted operations
  const handleLoadStorageStats = async () => {
    const stats = await loadStorageStats();
    if (stats) {
      setStorageStats(stats);

      // Check for storage warnings
      const warning = checkStorageWarnings(stats);
      if (warning) {
        setNotification(warning);
      }
    }
  };

  const handleLoadExistingFiles = async () => {
    try {
      const loadedFiles = await loadExistingFiles(filesLoaded, files);
      setFiles(loadedFiles);
      setFilesLoaded(true);
    } catch (error) {
      console.error('Failed to load existing files:', error);
      setFilesLoaded(true);
    }
  };

  const handleCheckForPurge = async () => {
    try {
      const isPurged = await checkForPurge(files);
      if (isPurged) {
        console.warn('IndexedDB purge detected - forcing UI reload');
        setNotification('Browser cleared storage. Files have been removed. Please re-upload.');
        const reloadedFiles = await forceReloadFiles();
        setFiles(reloadedFiles);
        setFilesLoaded(true);
      }
    } catch (error) {
      console.error('Error checking for purge:', error);
    }
  };

  const handleDrop = async (uploadedFiles: File[]) => {
    setLoading(true);

    try {
      const newFiles = await uploadFiles(uploadedFiles, defaultStorageConfig.useIndexedDB);

      // Update files state
      setFiles((prevFiles) => (allowMultiple ? [...prevFiles, ...newFiles] : newFiles));

      // Update storage stats incrementally
      if (storageStats) {
        const updatedStats = updateStorageStatsIncremental(storageStats, 'add', newFiles);
        setStorageStats(updatedStats);

        // Check for storage warnings
        const warning = checkStorageWarnings(updatedStats);
        if (warning) {
          setNotification(warning);
        }
      }
    } catch (error) {
      console.error('Error handling file drop:', error);
      setNotification(t("fileManager.uploadError", "Failed to upload some files."));
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFile = async (index: number) => {
    const file = files[index];

    try {
      await removeFile(file);

      // Update storage stats incrementally
      if (storageStats) {
        const updatedStats = updateStorageStatsIncremental(storageStats, 'remove', [file]);
        setStorageStats(updatedStats);
      }

      setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
    } catch (error) {
      console.error('Failed to remove file:', error);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearAllFiles(files);

      // Reset storage stats
      if (storageStats) {
        const clearedStats = updateStorageStatsIncremental(storageStats, 'clear');
        setStorageStats(clearedStats);
      }

      setFiles([]);
    } catch (error) {
      console.error('Failed to clear all files:', error);
    }
  };

  const handleReloadFiles = () => {
    setFilesLoaded(false);
    setFiles([]);
  };

  const handleFileDoubleClick = async (file: FileWithUrl) => {
    try {
      const url = await createBlobUrlForFile(file);
      // Add file to the beginning of files array and switch to viewer
      setFiles(prev => [{ file: file, url: url }, ...prev.filter(f => f.id !== file.id)]);
      setCurrentView && setCurrentView("viewer");
    } catch (error) {
      console.error('Failed to create blob URL for file:', error);
      setNotification('Failed to open file. It may have been removed from storage.');
    }
  };

  const handleFileView = async (file: FileWithUrl) => {
    try {
      const url = await createBlobUrlForFile(file);
      // Add file to the beginning of files array and switch to viewer
      setFiles(prev => [{ file: file, url: url }, ...prev.filter(f => f.id !== file.id)]);
      setCurrentView && setCurrentView("viewer");
    } catch (error) {
      console.error('Failed to create blob URL for file:', error);
      setNotification('Failed to open file. It may have been removed from storage.');
    }
  };

  const handleFileEdit = (file: FileWithUrl) => {
    if (onOpenFileEditor) {
      onOpenFileEditor([file]);
    }
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => 
      prev.includes(fileId) 
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleOpenSelectedInEditor = () => {
    if (onOpenFileEditor && selectedFiles.length > 0) {
      const selected = files.filter(f => selectedFiles.includes(f.id || f.name));
      onOpenFileEditor(selected);
    }
  };

  return (
    <div style={{
      width: "100%",
      margin: "0 auto",
      justifyContent: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "20px"
    }}>

      {/* File upload is now handled by FileUploadSelector when no files exist */}

      {/* Storage Stats Card */}
      <StorageStatsCard
        storageStats={storageStats}
        filesCount={files.length}
        onClearAll={handleClearAll}
        onReloadFiles={handleReloadFiles}
      />

      {/* Multi-selection controls */}
      {selectedFiles.length > 0 && (
        <Box mb="md" p="md" style={{ backgroundColor: 'var(--mantine-color-blue-0)', borderRadius: 8 }}>
          <Group justify="space-between">
            <Text size="sm">
              {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
            </Text>
            <Group>
              <Button 
                size="xs" 
                variant="light" 
                onClick={() => setSelectedFiles([])}
              >
                Clear Selection
              </Button>
              <Button 
                size="xs" 
                color="orange" 
                onClick={handleOpenSelectedInEditor}
                disabled={selectedFiles.length === 0}
              >
                Open in File Editor
              </Button>
            </Group>
          </Group>
        </Box>
      )}

      {/* Files Display */}
      {files.length === 0 ? (
        <FileUploadSelector
          title="Upload PDF Files"
          subtitle="Add files to your storage for easy access across tools"
          sharedFiles={[]} // FileManager is the source, so no shared files
          onFilesSelect={(uploadedFiles) => {
            // Handle multiple files
            handleDrop(uploadedFiles);
          }}
          allowMultiple={allowMultiple}
          accept={["application/pdf"]}
          loading={loading}
          showDropzone={true}
        />
      ) : (
        <Box>
          <Flex
            wrap="wrap"
            gap="lg"
            justify="flex-start"
            style={{ width: "fit-content", margin: "0 auto" }}
          >
            {files.map((file, idx) => (
              <FileCard
                key={file.id || file.name + idx}
                file={file}
                onRemove={() => handleRemoveFile(idx)}
                onDoubleClick={() => handleFileDoubleClick(file)}
                onView={() => handleFileView(file)}
                onEdit={() => handleFileEdit(file)}
                isSelected={selectedFiles.includes(file.id || file.name)}
                onSelect={() => toggleFileSelection(file.id || file.name)}
              />
            ))}
          </Flex>
        </Box>
      )}

      {/* Notifications */}
      {notification && (
        <Notification
          color="blue"
          onClose={() => setNotification(null)}
          style={{ position: "fixed", bottom: 20, right: 20, zIndex: 1000 }}
        >
          {notification}
        </Notification>
      )}
    </div>
  );
};

export default FileManager;
