import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { Center, Box, LoadingOverlay } from "@mantine/core";
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
import { downloadFileWithPolicy as downloadFile } from "@app/services/exportWithPolicy";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { usePolicyFileBadges } from "@app/hooks/usePolicyFileBadges";
import { useDropzoneFiles } from "@app/hooks/useDropzoneFiles";
import type { FileItemPolicyRef } from "@app/components/shared/PolicyBadges";

const EMPTY_POLICIES: FileItemPolicyRef[] = [];

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
  const policyFileBadges = usePolicyFileBadges();

  const isFileSupported = useCallback(
    (fileName: string): boolean => {
      const extension = detectFileExtension(fileName);
      return extension ? supportedExtensions.includes(extension) : false;
    },
    [supportedExtensions],
  );

  const { state, selectors } = useFileState();
  const { addFiles, removeFiles, reorderFiles } = useFileManagement();
  const { actions: fileActions } = useFileActions();
  const { selectedFileIds, setSelectedFiles } = useFileSelection();

  const activeStirlingFileStubs = useMemo(
    () => selectors.getStirlingFileStubs(),
    [state.files.byId, state.files.ids],
  );

  // Stable callbacks read current stubs and selection without invalidating memoized thumbnails.
  const stubsRef = useRef(activeStirlingFileStubs);
  stubsRef.current = activeStirlingFileStubs;
  const selectedFileIdsRef = useRef(selectedFileIds);
  selectedFileIdsRef.current = selectedFileIds;

  const { actions: navActions } = useNavigationActions();

  const { setActiveFileIndex, setActiveFileId } = useViewer();

  const [_status, _setStatus] = useState<string | null>(null);
  const [_error, _setError] = useState<string | null>(null);

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

  const { selectedTool } = useToolWorkflow();

  const maxAllowed = useMemo<number>(() => {
    const rawMax = selectedTool?.maxFiles;
    return !toolMode || rawMax == null || rawMax < 0 ? Infinity : rawMax;
  }, [selectedTool?.maxFiles, toolMode]);

  const getDropzoneFiles = useDropzoneFiles();
  const [showFilePickerModal, setShowFilePickerModal] = useState(false);

  const handleFileUpload = useCallback(
    async (uploadedFiles: File[]) => {
      _setError(null);

      try {
        if (uploadedFiles.length > 0) {
          await addFiles(uploadedFiles, { selectFiles: true });
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

  useEffect(() => {
    if (Number.isFinite(maxAllowed) && selectedFileIds.length > maxAllowed) {
      setSelectedFiles(selectedFileIds.slice(-maxAllowed));
    }
  }, [maxAllowed, selectedFileIds, setSelectedFiles]);

  const handleReorderFiles = useCallback(
    (sourceFileId: FileId, targetFileId: FileId, selectedFileIds: FileId[]) => {
      const currentIds = stubsRef.current.map((r) => r.id);

      const sourceIndex = currentIds.findIndex((id) => id === sourceFileId);
      const targetIndex = currentIds.findIndex((id) => id === targetFileId);

      if (sourceIndex === -1 || targetIndex === -1) {
        console.warn("Could not find source or target file for reordering");
        return;
      }

      const filesToMove =
        selectedFileIds.length > 1
          ? selectedFileIds.filter((id) => currentIds.includes(id))
          : [sourceFileId];

      const newOrder = [...currentIds];

      // Remove files to move from their current positions (in reverse order to maintain indices)
      const sourceIndices = filesToMove
        .map((id) => newOrder.findIndex((nId) => nId === id))
        .sort((a, b) => b - a); // Sort descending

      sourceIndices.forEach((index) => {
        newOrder.splice(index, 1);
      });

      let insertIndex = newOrder.findIndex((id) => id === targetFileId);
      if (insertIndex !== -1) {
        const isMovingForward = sourceIndex < targetIndex;
        if (isMovingForward) {
          insertIndex += 1;
        }
      } else {
        insertIndex = newOrder.length;
      }

      newOrder.splice(insertIndex, 0, ...filesToMove);

      // flushSync commits the reorder inside the view transition so its snapshots capture both layouts.
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

      const moveCount = filesToMove.length;
      showStatus(`${moveCount > 1 ? `${moveCount} files` : "File"} reordered`);
    },
    [reorderFiles, showStatus],
  );

  const handleCloseFile = useCallback(
    (fileId: FileId) => {
      const record = stubsRef.current.find((r) => r.id === fileId);
      const file = record ? selectors.getFile(record.id) : null;
      if (record && file) {
        removeFiles([record.id], false);
        setSelectedFiles(
          selectedFileIdsRef.current.filter((id) => id !== record.id),
        );
      }
    },
    [selectors, removeFiles, setSelectedFiles],
  );

  const handleDownloadFile = useCallback(
    async (fileId: FileId) => {
      const record = stubsRef.current.find((r) => r.id === fileId);
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
          fileId,
        });
        console.log("[FileEditor] Download complete, checking dirty state:", {
          localFilePath: record.localFilePath,
          isDirty: record.isDirty,
          savedPath: result.savedPath,
        });
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
    [selectors, fileActions],
  );

  const handleUnzipFile = useCallback(
    async (fileId: FileId) => {
      const record = stubsRef.current.find((r) => r.id === fileId);
      const file = record ? selectors.getFile(record.id) : null;
      if (record && file) {
        try {
          const result = await zipFileService.extractAndStoreFilesWithHistory(
            file,
            record,
          );

          if (result.success && result.extractedStubs.length > 0) {
            await fileActions.addStirlingFileStubs(result.extractedStubs);

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
    [selectors, fileActions, removeFiles],
  );

  const handleViewFile = useCallback(
    (fileId: FileId) => {
      const index = stubsRef.current.findIndex((r) => r.id === fileId);
      if (index !== -1) {
        setActiveFileId(fileId);
        setActiveFileIndex(index);
        navActions.setWorkbench("viewer");
      }
    },
    [setActiveFileId, setActiveFileIndex, navActions.setWorkbench],
  );

  const handleLoadFromStorage = useCallback(async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;

    try {
      showStatus(`Loaded ${selectedFiles.length} files from storage`);
    } catch (err) {
      console.error("Error loading files from storage:", err);
      showError("Failed to load some files from storage");
    }
  }, []);

  return (
    <Dropzone
      onDrop={handleFileUpload}
      useFsAccessApi={false}
      getFilesFromEvent={getDropzoneFiles}
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
              <AddFileCard />
            </Center>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(276px, 1fr))",
                rowGap: "1.5rem",
                padding: "1rem",
                pointerEvents: "auto",
              }}
            >
              {activeStirlingFileStubs.length > 0 && (
                <AddFileCard key="add-file-card" />
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
                    policies={policyFileBadges.get(record.id) ?? EMPTY_POLICIES}
                  />
                );
              })}
            </div>
          )}
        </Box>

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
