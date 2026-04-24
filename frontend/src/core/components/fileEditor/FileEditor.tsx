import { useState, useCallback, useMemo, useEffect } from "react";
import { flushSync } from "react-dom";
import { Text, Center, Box, LoadingOverlay, Stack } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import {
  useFileSelection,
  useFileState,
  useFileManagement,
  useFileActions,
} from "@app/contexts/FileContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { zipFileService } from "@app/services/zipFileService";
import { detectFileExtension } from "@app/utils/fileUtils";
import FileEditorThumbnail from "@app/components/fileEditor/FileEditorThumbnail";
import AddFileCard from "@app/components/fileEditor/AddFileCard";
import FilePickerModal from "@app/components/shared/FilePickerModal";
import { FileId, StirlingFile } from "@app/types/fileContext";
import { alert } from "@app/components/toast";
import { downloadFile } from "@app/services/downloadService";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";

interface FileEditorProps {
  onOpenPageEditor?: () => void;
  onMergeFiles?: (files: StirlingFile[]) => void;
  toolMode?: boolean;
  supportedExtensions?: string[];
}

const FileEditor = ({
  toolMode = false,
  supportedExtensions = ["pdf"],
}: FileEditorProps) => {
  // Utility function to check if a file extension is supported
  const isFileSupported = useCallback(
    (fileName: string): boolean => {
      const extension = detectFileExtension(fileName);
      return extension ? supportedExtensions.includes(extension) : false;
    },
    [supportedExtensions],
  );

  // Use optimized FileContext hooks
  const { state, selectors } = useFileState();
  const { addFiles, removeFiles, reorderFiles } = useFileManagement();
  const { actions: fileActions } = useFileActions();
  const { selectedFileIds, setSelectedFiles } = useFileSelection();

  // Extract needed values from state (memoized to prevent infinite loops)
  const activeStirlingFileStubs = useMemo(
    () => selectors.getStirlingFileStubs(),
    [state.files.byId, state.files.ids],
  );

  // Get navigation actions
  const { actions: navActions } = useNavigationActions();

  // Get viewer context for setting active file index and ID
  const { setActiveFileIndex, setActiveFileId } = useViewer();

  const [_status, _setStatus] = useState<string | null>(null);
  const [_error, _setError] = useState<string | null>(null);

  // Toast helpers
  const showStatus = useCallback(
    (
      message: string,
      type: "neutral" | "success" | "warning" | "error" = "neutral",
    ) => {
      alert({
        alertType: type,
        title: message,
        expandable: false,
        durationMs: 4000,
      });
    },
    [],
  );
  const showError = useCallback((message: string) => {
    alert({
      alertType: "error",
      title: "Error",
      body: message,
      expandable: true,
    });
  }, []);

  // Current tool (for enforcing maxFiles limits)
  const { selectedTool } = useToolWorkflow();

  // Compute effective max allowed files based on the active tool and mode
  const maxAllowed = useMemo<number>(() => {
    const rawMax = selectedTool?.maxFiles;
    return !toolMode || rawMax == null || rawMax < 0 ? Infinity : rawMax;
  }, [selectedTool?.maxFiles, toolMode]);

  const [showFilePickerModal, setShowFilePickerModal] = useState(false);

  // Process uploaded files using context
  // ZIP extraction is now handled automatically in FileContext based on user preferences
  const handleFileUpload = useCallback(
    async (uploadedFiles: File[]) => {
      _setError(null);

      try {
        if (uploadedFiles.length > 0) {
          // FileContext will automatically handle ZIP extraction based on user preferences
          // - Respects autoUnzip setting
          // - Respects autoUnzipFileLimit
          // - HTML ZIPs stay intact
          // - Non-ZIP files pass through unchanged
          await addFiles(uploadedFiles, { selectFiles: true });
          // After auto-selection, enforce maxAllowed if needed
          if (Number.isFinite(maxAllowed)) {
            const nowSelectedIds = selectors
              .getSelectedStirlingFileStubs()
              .map((r) => r.id);
            if (nowSelectedIds.length > maxAllowed) {
              setSelectedFiles(nowSelectedIds.slice(-maxAllowed));
            }
          }
          showStatus(`Added ${uploadedFiles.length} file(s)`, "success");
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to process files";
        showError(errorMessage);
        console.error("File processing error:", err);
      }
    },
    [addFiles, showStatus, showError, selectors, maxAllowed, setSelectedFiles],
  );

  // Enforce maxAllowed when tool changes or when an external action sets too many selected files
  useEffect(() => {
    if (Number.isFinite(maxAllowed) && selectedFileIds.length > maxAllowed) {
      setSelectedFiles(selectedFileIds.slice(-maxAllowed));
    }
  }, [maxAllowed, selectedFileIds, setSelectedFiles]);

  // File reordering handler for drag and drop
  const handleReorderFiles = useCallback(
    (sourceFileId: FileId, targetFileId: FileId, selectedFileIds: FileId[]) => {
      const currentIds = activeStirlingFileStubs.map((r) => r.id);

      // Find indices
      const sourceIndex = currentIds.findIndex((id) => id === sourceFileId);
      const targetIndex = currentIds.findIndex((id) => id === targetFileId);

      if (sourceIndex === -1 || targetIndex === -1) {
        console.warn("Could not find source or target file for reordering");
        return;
      }

      // Handle multi-file selection reordering
      const filesToMove =
        selectedFileIds.length > 1
          ? selectedFileIds.filter((id) => currentIds.includes(id))
          : [sourceFileId];

      // Create new order
      const newOrder = [...currentIds];

      // Remove files to move from their current positions (in reverse order to maintain indices)
      const sourceIndices = filesToMove
        .map((id) => newOrder.findIndex((nId) => nId === id))
        .sort((a, b) => b - a); // Sort descending

      sourceIndices.forEach((index) => {
        newOrder.splice(index, 1);
      });

      // Calculate insertion index after removals
      let insertIndex = newOrder.findIndex((id) => id === targetFileId);
      if (insertIndex !== -1) {
        // Determine if moving forward or backward
        const isMovingForward = sourceIndex < targetIndex;
        if (isMovingForward) {
          // Moving forward: insert after target
          insertIndex += 1;
        } else {
          // Moving backward: insert before target (insertIndex already correct)
        }
      } else {
        // Target was moved, insert at end
        insertIndex = newOrder.length;
      }

      // Insert files at the calculated position
      newOrder.splice(insertIndex, 0, ...filesToMove);

      // Animate the reorder using the View Transitions API where available.
      // Each FileEditorThumbnail carries a stable `view-transition-name`, so
      // the browser snapshots each card before and after the DOM reorder and
      // interpolates the positions automatically. `flushSync` forces React to
      // apply the reorderFiles dispatch synchronously inside the transition
      // callback so the BEFORE/AFTER snapshots capture the correct frames.
      const applyReorder = () => reorderFiles(newOrder);
      const docWithViewTransition = document as Document & {
        startViewTransition?: (cb: () => void) => unknown;
      };
      if (typeof docWithViewTransition.startViewTransition === "function") {
        docWithViewTransition.startViewTransition(() => {
          flushSync(applyReorder);
        });
      } else {
        applyReorder();
      }

      // Update status
      const moveCount = filesToMove.length;
      showStatus(`${moveCount > 1 ? `${moveCount} files` : "File"} reordered`);
    },
    [activeStirlingFileStubs, reorderFiles, _setStatus],
  );

  // File operations using context
  const handleCloseFile = useCallback(
    (fileId: FileId) => {
      const record = activeStirlingFileStubs.find((r) => r.id === fileId);
      const file = record ? selectors.getFile(record.id) : null;
      if (record && file) {
        // Remove file from context but keep in storage (close, don't delete)
        const contextFileId = record.id;
        removeFiles([contextFileId], false);

        // Remove from context selections
        const currentSelected = selectedFileIds.filter(
          (id) => id !== contextFileId,
        );
        setSelectedFiles(currentSelected);
      }
    },
    [
      activeStirlingFileStubs,
      selectors,
      removeFiles,
      setSelectedFiles,
      selectedFileIds,
    ],
  );

  const handleDownloadFile = useCallback(
    async (fileId: FileId) => {
      const record = activeStirlingFileStubs.find((r) => r.id === fileId);
      const file = record ? selectors.getFile(record.id) : null;
      console.log("[FileEditor] handleDownloadFile called:", {
        fileId,
        hasRecord: !!record,
        hasFile: !!file,
        localFilePath: record?.localFilePath,
        isDirty: record?.isDirty,
      });
      if (record && file) {
        const result = await downloadFile({
          data: file,
          filename: file.name,
          localPath: record.localFilePath,
        });
        console.log("[FileEditor] Download complete, checking dirty state:", {
          localFilePath: record.localFilePath,
          isDirty: record.isDirty,
          savedPath: result.savedPath,
        });
        // Mark file as clean after successful save to disk
        if (result.savedPath) {
          console.log("[FileEditor] Marking file as clean:", fileId);
          fileActions.updateStirlingFileStub(fileId, {
            localFilePath: record.localFilePath ?? result.savedPath,
            isDirty: false,
          });
        } else {
          console.log("[FileEditor] Skipping clean mark:", {
            savedPath: result.savedPath,
            isDirty: record.isDirty,
          });
        }
      }
    },
    [activeStirlingFileStubs, selectors, fileActions],
  );

  const handleUnzipFile = useCallback(
    async (fileId: FileId) => {
      const record = activeStirlingFileStubs.find((r) => r.id === fileId);
      const file = record ? selectors.getFile(record.id) : null;
      if (record && file) {
        try {
          // Extract and store files using shared service method
          const result = await zipFileService.extractAndStoreFilesWithHistory(
            file,
            record,
          );

          if (result.success && result.extractedStubs.length > 0) {
            // Add extracted file stubs to FileContext
            await fileActions.addStirlingFileStubs(result.extractedStubs);

            // Remove the original ZIP file
            removeFiles([fileId], false);

            alert({
              alertType: "success",
              title: `Extracted ${result.extractedStubs.length} file(s) from ${file.name}`,
              expandable: false,
              durationMs: 3500,
            });
          } else {
            alert({
              alertType: "error",
              title: `Failed to extract files from ${file.name}`,
              body: result.errors.join("\n"),
              expandable: true,
              durationMs: 3500,
            });
          }
        } catch (error) {
          console.error("Failed to unzip file:", error);
          alert({
            alertType: "error",
            title: `Error unzipping ${file.name}`,
            expandable: false,
            durationMs: 3500,
          });
        }
      }
    },
    [activeStirlingFileStubs, selectors, fileActions, removeFiles],
  );

  const handleViewFile = useCallback(
    (fileId: FileId) => {
      const index = activeStirlingFileStubs.findIndex((r) => r.id === fileId);
      if (index !== -1) {
        setActiveFileId(fileId as string);
        setActiveFileIndex(index);
        navActions.setWorkbench("viewer");
      }
    },
    [
      activeStirlingFileStubs,
      setActiveFileId,
      setActiveFileIndex,
      navActions.setWorkbench,
    ],
  );

  const handleLoadFromStorage = useCallback(async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;

    try {
      // Use FileContext to handle loading stored files
      // The files are already in FileContext, just need to add them to active files
      showStatus(`Loaded ${selectedFiles.length} files from storage`);
    } catch (err) {
      console.error("Error loading files from storage:", err);
      showError("Failed to load some files from storage");
    }
  }, []);

  return (
    <Dropzone
      onDrop={handleFileUpload}
      multiple={true}
      maxSize={2 * 1024 * 1024 * 1024}
      style={{
        border: "none",
        borderRadius: 0,
        backgroundColor: "transparent",
      }}
      activateOnClick={false}
      activateOnDrag={true}
    >
      <Box pos="relative" style={{ overflow: "auto" }}>
        <LoadingOverlay visible={state.ui.isProcessing} />

        <Box p="md">
          {activeStirlingFileStubs.length === 0 ? (
            <Center h="60vh">
              <Stack align="center" gap="md">
                <Text size="lg" c="dimmed">
                  📁
                </Text>
                <Text c="dimmed">No files loaded</Text>
                <Text size="sm" c="dimmed">
                  Upload PDF files, ZIP archives, or load from storage to get
                  started
                </Text>
              </Stack>
            </Center>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                rowGap: "1.5rem",
                padding: "1rem",
                pointerEvents: "auto",
              }}
            >
              {/* Add File Card - only show when files exist */}
              {activeStirlingFileStubs.length > 0 && (
                <AddFileCard
                  key="add-file-card"
                  onFileSelect={handleFileUpload}
                />
              )}

              {activeStirlingFileStubs.map((record, index) => {
                return (
                  <FileEditorThumbnail
                    key={record.id}
                    file={record}
                    index={index}
                    totalFiles={activeStirlingFileStubs.length}
                    onCloseFile={handleCloseFile}
                    onViewFile={handleViewFile}
                    onReorderFiles={handleReorderFiles}
                    onDownloadFile={handleDownloadFile}
                    onUnzipFile={handleUnzipFile}
                    toolMode={toolMode}
                    isSupported={isFileSupported(record.name)}
                  />
                );
              })}
            </div>
          )}
        </Box>

        {/* File Picker Modal */}
        <FilePickerModal
          opened={showFilePickerModal}
          onClose={() => setShowFilePickerModal(false)}
          storedFiles={[]} // FileEditor doesn't have access to stored files, needs to be passed from parent
          onSelectFiles={handleLoadFromStorage}
        />
      </Box>
    </Dropzone>
  );
};

export default FileEditor;
