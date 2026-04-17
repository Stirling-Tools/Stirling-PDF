import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Modal } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import { useFileManager } from "@app/hooks/useFileManager";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { Tool } from "@app/types/tool";
import MobileLayout from "@app/components/fileManager/MobileLayout";
import DesktopLayout from "@app/components/fileManager/DesktopLayout";
import DragOverlay from "@app/components/fileManager/DragOverlay";
import { FileManagerProvider } from "@app/contexts/FileManagerContext";
import { Z_INDEX_FILE_MANAGER_MODAL } from "@app/styles/zIndex";
import { isGoogleDriveConfigured, extractGoogleDriveBackendConfig } from "@app/services/googleDrivePickerService";
import { loadScript } from "@app/utils/scriptLoader";
import { useAllFiles } from "@app/contexts/FileContext";
import { useFileActions } from "@app/contexts/file/fileHooks";

interface FileManagerProps {
  selectedTool?: Tool | null;
}

const FileManager: React.FC<FileManagerProps> = ({ selectedTool }) => {
  const { isFilesModalOpen, closeFilesModal, onFileUpload, onRecentFileSelect, maxSelectable } = useFilesModalContext();
  const { config } = useAppConfig();
  const [recentFiles, setRecentFiles] = useState<StirlingFileStub[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const { loadRecentFiles, handleRemoveFile, loading } = useFileManager();
  const { actions: fileActions } = useFileActions();

  // Get active file IDs from FileContext to show which files are already loaded
  const { fileIds: activeFileIds } = useAllFiles();

  // File management handlers
  const isFileSupported = useCallback(
    (fileName: string) => {
      if (!selectedTool?.supportedFormats) return true;
      const extension = fileName.split(".").pop()?.toLowerCase();
      return selectedTool.supportedFormats.includes(extension || "");
    },
    [selectedTool?.supportedFormats],
  );

  const refreshRecentFiles = useCallback(async () => {
    const files = await loadRecentFiles();
    setRecentFiles(files);
  }, [loadRecentFiles]);

  const handleRecentFilesSelected = useCallback(
    async (files: StirlingFileStub[]) => {
      try {
        // Use StirlingFileStubs directly - preserves all metadata!
        onRecentFileSelect(files);
      } catch (error) {
        console.error("Failed to process selected files:", error);
      }
    },
    [onRecentFileSelect],
  );

  const handleNewFileUpload = useCallback(
    async (files: File[]) => {
      if (files.length > 0) {
        try {
          // Files will get IDs assigned through onFilesSelect -> FileContext addFiles
          onFileUpload(files);
          await refreshRecentFiles();
        } catch (error) {
          console.error("Failed to process dropped files:", error);
        }
      }
    },
    [onFileUpload, refreshRecentFiles],
  );

  const handleRemoveFileByIndex = useCallback(
    async (index: number) => {
      await handleRemoveFile(
        index,
        recentFiles,
        setRecentFiles,
        (fileId) => {
          fileActions.removeFiles([fileId], false);
        },
        refreshRecentFiles,
      );
    },
    [handleRemoveFile, recentFiles, fileActions, refreshRecentFiles],
  );

  const handleBulkRemove = useCallback((fileIds: FileId[]) => {
    const idSet = new Set(fileIds as string[]);
    setRecentFiles((prev) => prev.filter((f) => !idSet.has(f.id as string)));
  }, []);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1030);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (isFilesModalOpen) {
      refreshRecentFiles();
    } else {
      // Reset state when modal is closed
      setIsDragging(false);
    }
  }, [isFilesModalOpen, refreshRecentFiles]);

  // Cleanup any blob URLs when component unmounts
  useEffect(() => {
    return () => {
      // StoredFileMetadata doesn't have blob URLs, so no cleanup needed
      // Blob URLs are managed by FileContext and tool operations
      console.log("FileManager unmounting - FileContext handles blob URL cleanup");
    };
  }, []);

  // Preload Google Drive scripts if configured
  // Use useMemo to only track Google Drive config changes, not all config updates
  const googleDriveBackendConfig = useMemo(
    () => extractGoogleDriveBackendConfig(config),
    [config?.googleDriveEnabled, config?.googleDriveClientId, config?.googleDriveApiKey, config?.googleDriveAppId],
  );

  useEffect(() => {
    if (isGoogleDriveConfigured(googleDriveBackendConfig)) {
      // Load scripts in parallel without blocking
      Promise.all([
        loadScript({
          src: "https://apis.google.com/js/api.js",
          id: "gapi-script",
          async: true,
          defer: true,
        }),
        loadScript({
          src: "https://accounts.google.com/gsi/client",
          id: "gis-script",
          async: true,
          defer: true,
        }),
      ]).catch((error) => {
        console.warn("Failed to preload Google Drive scripts:", error);
      });
    }
  }, [googleDriveBackendConfig]);

  // Modal size constants for consistent scaling
  const modalHeight = "80vh";
  const modalWidth = isMobile ? "100%" : "80vw";
  const modalMaxWidth = isMobile ? "100%" : "1200px";
  const modalMaxHeight = "1200px";
  const modalMinWidth = isMobile ? "320px" : "800px";

  return (
    <Modal
      opened={isFilesModalOpen}
      onClose={closeFilesModal}
      size={isMobile ? "100%" : "auto"}
      centered
      radius="md"
      className="overflow-hidden p-0"
      withCloseButton={false}
      zIndex={Z_INDEX_FILE_MANAGER_MODAL}
      styles={{
        content: {
          position: "relative",
          margin: isMobile ? "1rem" : "2rem",
        },
        body: { padding: 0 },
        header: { display: "none" },
      }}
    >
      <div
        style={{
          position: "relative",
          height: modalHeight,
          width: modalWidth,
          maxWidth: modalMaxWidth,
          maxHeight: modalMaxHeight,
          minWidth: modalMinWidth,
          margin: "0 auto",
          overflow: "hidden",
        }}
      >
        <Dropzone
          onDrop={handleNewFileUpload}
          onDragEnter={() => setIsDragging(true)}
          onDragLeave={() => setIsDragging(false)}
          multiple={true}
          activateOnClick={false}
          style={{
            height: "100%",
            width: "100%",
            border: "none",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--bg-file-manager)",
          }}
          styles={{
            inner: { pointerEvents: "all" },
          }}
        >
          <FileManagerProvider
            recentFiles={recentFiles}
            onRecentFilesSelected={handleRecentFilesSelected}
            onNewFilesSelect={handleNewFileUpload}
            onClose={closeFilesModal}
            isFileSupported={isFileSupported}
            isOpen={isFilesModalOpen}
            maxSelectable={maxSelectable}
            onFileRemove={handleRemoveFileByIndex}
            onBulkRemove={handleBulkRemove}
            modalHeight={modalHeight}
            refreshRecentFiles={refreshRecentFiles}
            isLoading={loading}
            activeFileIds={activeFileIds}
          >
            {isMobile ? <MobileLayout /> : <DesktopLayout />}
          </FileManagerProvider>
        </Dropzone>

        <DragOverlay isVisible={isDragging} />
      </div>
    </Modal>
  );
};

export default FileManager;
