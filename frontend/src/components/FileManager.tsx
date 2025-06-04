import React, { useState, useEffect } from "react";
import { Box, Flex, Text, Notification } from "@mantine/core";
import { Dropzone, MIME_TYPES } from "@mantine/dropzone";
import { useTranslation } from "react-i18next";

import { GlobalWorkerOptions } from "pdfjs-dist";
import { StorageStats } from "../services/fileStorage";
import { FileWithUrl, defaultStorageConfig } from "../types/file";

// Refactored imports
import { fileOperationsService } from "../services/fileOperationsService";
import { checkStorageWarnings } from "../utils/storageUtils";
import StorageStatsCard from "./StorageStatsCard";
import FileCard from "./FileCard.standalone";

GlobalWorkerOptions.workerSrc = "/pdf.worker.js";

interface FileManagerProps {
  files: FileWithUrl[];
  setFiles: React.Dispatch<React.SetStateAction<FileWithUrl[]>>;
  allowMultiple?: boolean;
  setPdfFile?: (fileObj: { file: File; url: string }) => void;
  setCurrentView?: (view: string) => void;
}

const FileManager: React.FC<FileManagerProps> = ({
  files = [],
  setFiles,
  allowMultiple = true,
  setPdfFile,
  setCurrentView,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [filesLoaded, setFilesLoaded] = useState(false);

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
    if (setPdfFile) {
      try {
        const url = await createBlobUrlForFile(file);
        setPdfFile({ file: file, url: url });
        setCurrentView && setCurrentView("viewer");
      } catch (error) {
        console.error('Failed to create blob URL for file:', error);
        setNotification('Failed to open file. It may have been removed from storage.');
      }
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

      {/* File Upload Dropzone */}
      <Dropzone
        onDrop={handleDrop}
        accept={[MIME_TYPES.pdf]}
        multiple={allowMultiple}
        maxSize={2 * 1024 * 1024 * 1024} // 2GB limit
        loading={loading}
        style={{
          marginTop: 16,
          marginBottom: 16,
          border: "2px dashed rgb(202, 202, 202)",
          borderRadius: 8,
          minHeight: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "90%"
        }}
      >
        <Text size="md">
          {t("fileChooser.dragAndDropPDF", "Drag PDF files here or click to select")}
        </Text>
      </Dropzone>

      {/* Storage Stats Card */}
      <StorageStatsCard
        storageStats={storageStats}
        filesCount={files.length}
        onClearAll={handleClearAll}
        onReloadFiles={handleReloadFiles}
      />

      {/* Files Display */}
      {files.length === 0 ? (
        <Text c="dimmed" ta="center">
          {t("noFileSelected", "No files uploaded yet.")}
        </Text>
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
 as FileWithUrl              />
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
