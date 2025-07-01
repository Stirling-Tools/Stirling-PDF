import React, { useState, useEffect } from "react";
import { Box, Flex, Text, Notification, Button, Group } from "@mantine/core";
import { Dropzone, MIME_TYPES } from "@mantine/dropzone";
import { useTranslation } from "react-i18next";

import { GlobalWorkerOptions } from "pdfjs-dist";
import { StorageStats } from "../../services/fileStorage";
import { FileWithUrl, defaultStorageConfig, initializeStorageConfig, StorageConfig } from "../../types/file";

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
  onOpenPageEditor?: (selectedFiles?: FileWithUrl[]) => void;
  onLoadFileToActive?: (file: File) => void;
}

const FileManager = ({
  files = [],
  setFiles,
  allowMultiple = true,
  setCurrentView,
  onOpenFileEditor,
  onOpenPageEditor,
  onLoadFileToActive,
}: FileManagerProps) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [storageConfig, setStorageConfig] = useState<StorageConfig>(defaultStorageConfig);

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

  // Initialize storage configuration on mount
  useEffect(() => {
    const initStorage = async () => {
      try {
        const config = await initializeStorageConfig();
        setStorageConfig(config);
        console.log('Initialized storage config:', config);
      } catch (error) {
        console.warn('Failed to initialize storage config, using defaults:', error);
      }
    };

    initStorage();
  }, []);

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
        setNotification(t("fileManager.storageCleared", "Browser cleared storage. Files have been removed. Please re-upload."));
        const reloadedFiles = await forceReloadFiles();
        setFiles(reloadedFiles);
        setFilesLoaded(true);
      }
    } catch (error) {
      console.error('Error checking for purge:', error);
    }
  };

  const validateStorageLimits = (filesToUpload: File[]): { valid: boolean; error?: string } => {
    // Check individual file sizes
    for (const file of filesToUpload) {
      if (file.size > storageConfig.maxFileSize) {
        const maxSizeMB = Math.round(storageConfig.maxFileSize / (1024 * 1024));
        return {
          valid: false,
          error: `${t("storage.fileTooLarge", "File too large. Maximum size per file is")} ${maxSizeMB}MB`
        };
      }
    }

    // Check total storage capacity
    if (storageStats) {
      const totalNewSize = filesToUpload.reduce((sum, file) => sum + file.size, 0);
      const projectedUsage = storageStats.totalSize + totalNewSize;

      if (projectedUsage > storageConfig.maxTotalStorage) {
        return {
          valid: false,
          error: t("storage.storageQuotaExceeded", "Storage quota exceeded. Please remove some files before uploading more.")
        };
      }
    }

    return { valid: true };
  };

  const handleDrop = async (uploadedFiles: File[]) => {
    setLoading(true);

    try {
      // Validate storage limits before uploading
      const validation = validateStorageLimits(uploadedFiles);
      if (!validation.valid) {
        setNotification(validation.error);
        setLoading(false);
        return;
      }

      const newFiles = await uploadFiles(uploadedFiles, storageConfig.useIndexedDB);

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
      // Reconstruct File object from storage and add to active files
      if (onLoadFileToActive) {
        const reconstructedFile = await reconstructFileFromStorage(file);
        onLoadFileToActive(reconstructedFile);
        setCurrentView && setCurrentView("viewer");
      }
    } catch (error) {
      console.error('Failed to load file to active set:', error);
      setNotification(t("fileManager.failedToOpen", "Failed to open file. It may have been removed from storage."));
    }
  };

  const handleFileView = async (file: FileWithUrl) => {
    try {
      // Reconstruct File object from storage and add to active files
      if (onLoadFileToActive) {
        const reconstructedFile = await reconstructFileFromStorage(file);
        onLoadFileToActive(reconstructedFile);
        setCurrentView && setCurrentView("viewer");
      }
    } catch (error) {
      console.error('Failed to load file to active set:', error);
      setNotification(t("fileManager.failedToOpen", "Failed to open file. It may have been removed from storage."));
    }
  };

  const reconstructFileFromStorage = async (fileWithUrl: FileWithUrl): Promise<File> => {
    // If it's already a regular file, return it
    if (fileWithUrl instanceof File) {
      return fileWithUrl;
    }

    // Reconstruct from IndexedDB
    const arrayBuffer = await createBlobUrlForFile(fileWithUrl);
    if (typeof arrayBuffer === 'string') {
      // createBlobUrlForFile returned a blob URL, we need the actual data
      const response = await fetch(arrayBuffer);
      const data = await response.arrayBuffer();
      return new File([data], fileWithUrl.name, {
        type: fileWithUrl.type || 'application/pdf',
        lastModified: fileWithUrl.lastModified || Date.now()
      });
    } else {
      return new File([arrayBuffer], fileWithUrl.name, {
        type: fileWithUrl.type || 'application/pdf',
        lastModified: fileWithUrl.lastModified || Date.now()
      });
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

  const handleOpenSelectedInPageEditor = () => {
    if (onOpenPageEditor && selectedFiles.length > 0) {
      const selected = files.filter(f => selectedFiles.includes(f.id || f.name));
      onOpenPageEditor(selected);
    }
  };

  return (
    <div style={{
      width: "100%",
      justifyContent: "center",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      paddingTop: "3rem"
    }}>

      {/* File upload is now handled by FileUploadSelector when no files exist */}

      {/* Storage Stats Card */}
      <StorageStatsCard
        storageStats={storageStats}
        filesCount={files.length}
        onClearAll={handleClearAll}
        onReloadFiles={handleReloadFiles}
        storageConfig={storageConfig}
      />

      {/* Multi-selection controls */}
      {selectedFiles.length > 0 && (
        <Box mb="md" p="md" style={{ backgroundColor: 'var(--mantine-color-blue-0)', borderRadius: 8 }}>
          <Group justify="space-between">
            <Text size="sm">
              {selectedFiles.length} {t("fileManager.filesSelected", "files selected")}
            </Text>
            <Group>
              <Button
                size="xs"
                variant="light"
                onClick={() => setSelectedFiles([])}
              >
                {t("fileManager.clearSelection", "Clear Selection")}
              </Button>
              <Button
                size="xs"
                color="orange"
                onClick={handleOpenSelectedInEditor}
                disabled={selectedFiles.length === 0}
              >
                {t("fileManager.openInFileEditor", "Open in File Editor")}
              </Button>
              <Button
                size="xs"
                color="blue"
                onClick={handleOpenSelectedInPageEditor}
                disabled={selectedFiles.length === 0}
              >
                {t("fileManager.openInPageEditor", "Open in Page Editor")}
              </Button>
            </Group>
          </Group>
        </Box>
      )}


          <Flex
            wrap="wrap"
            gap="lg"
            justify="flex-start"
            style={{ width: "90%", marginTop: "1rem"}}
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
