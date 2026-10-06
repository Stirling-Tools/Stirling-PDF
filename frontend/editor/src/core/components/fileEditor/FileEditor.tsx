import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { Center, Box, LoadingOverlay } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { useTranslation } from "react-i18next";
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
import { reorderFileIds } from "@app/components/fileEditor/reorderFileIds";
import { FileId, StirlingFile } from "@app/types/fileContext";
import { alert } from "@app/components/toast";
import { downloadFileWithPolicy as downloadFile } from "@app/services/exportWithPolicy";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { usePolicyFileBadges } from "@app/hooks/usePolicyFileBadges";
import { useDropzoneFiles } from "@app/hooks/useDropzoneFiles";
import {
  useVirtualFileRows,
  rowHeightPx,
} from "@app/components/filesPage/useVirtualFileRows";
import type { FileItemPolicyRef } from "@app/components/shared/PolicyBadges";
import styles from "@app/components/fileEditor/FileEditor.module.css";

const EMPTY_POLICIES: FileItemPolicyRef[] = [];
const DEFAULT_SUPPORTED_EXTENSIONS = ["pdf"];

function normalizeMaxFiles(
  toolMode: boolean,
  rawMax: number | null | undefined,
): number {
  if (!toolMode || rawMax == null || rawMax < 0) return Infinity;
  if (!Number.isFinite(rawMax)) return Infinity;
  return Math.floor(rawMax);
}

function limitSelection(ids: FileId[], maxFiles: number): FileId[] {
  if (!Number.isFinite(maxFiles) || ids.length <= maxFiles) return ids;
  return maxFiles === 0 ? [] : ids.slice(-maxFiles);
}

interface FileEditorProps {
  onOpenPageEditor?: () => void;
  onMergeFiles?: (files: StirlingFile[]) => void;
  toolMode?: boolean;
  supportedExtensions?: string[];
}

const FileEditor = ({
  toolMode = false,
  supportedExtensions = DEFAULT_SUPPORTED_EXTENSIONS,
}: FileEditorProps) => {
  const { t } = useTranslation();
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
    [selectors, state.files.byId, state.files.ids],
  );

  // Keep latest state available for async and reorder callbacks without invalidating memos.
  const stubsRef = useRef(activeStirlingFileStubs);
  const selectedFileIdsRef = useRef(selectedFileIds);
  useEffect(() => {
    stubsRef.current = activeStirlingFileStubs;
  }, [activeStirlingFileStubs]);
  useEffect(() => {
    selectedFileIdsRef.current = selectedFileIds;
  }, [selectedFileIds]);

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
  const showError = useCallback(
    (message: string) => {
      alert({
        alertType: "error",
        title: t("common.error", "Error"),
        body: message,
        expandable: true,
      });
    },
    [t],
  );

  const { selectedTool } = useToolWorkflow();

  const maxAllowed = useMemo<number>(
    () => normalizeMaxFiles(toolMode, selectedTool?.maxFiles),
    [selectedTool?.maxFiles, toolMode],
  );

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
            const limited = limitSelection(nowSelectedIds, maxAllowed);
            if (limited.length !== nowSelectedIds.length) {
              setSelectedFiles(limited);
            }
          }
          showStatus(
            t("fileEditor.filesAdded", {
              count: uploadedFiles.length,
              defaultValue_one: "Added {{count}} file",
              defaultValue_other: "Added {{count}} files",
            }),
            "success",
          );
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : t("fileEditor.processFilesFailed", "Failed to process files");
        showError(errorMessage);
        console.error("File processing error:", err);
      }
    },
    [
      addFiles,
      showStatus,
      showError,
      selectors,
      maxAllowed,
      setSelectedFiles,
      t,
    ],
  );

  useEffect(() => {
    if (Number.isFinite(maxAllowed)) {
      const limited = limitSelection(selectedFileIds, maxAllowed);
      if (limited.length !== selectedFileIds.length) {
        setSelectedFiles(limited);
      }
    }
  }, [maxAllowed, selectedFileIds, setSelectedFiles]);

  const handleReorderFiles = useCallback(
    (
      sourceFileId: FileId,
      targetFileId: FileId,
      fileSelectionIds: FileId[],
    ) => {
      const currentIds = stubsRef.current.map((r) => r.id);
      const nextOrder = reorderFileIds(
        currentIds,
        sourceFileId,
        targetFileId,
        fileSelectionIds,
      );

      if (nextOrder === currentIds) {
        return;
      }

      // flushSync commits the reorder inside the view transition so its snapshots capture both layouts.
      const applyReorder = () => reorderFiles(nextOrder);
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

      const isGroup =
        fileSelectionIds.includes(sourceFileId) && fileSelectionIds.length > 1;
      const moveCount = isGroup ? fileSelectionIds.length : 1;
      showStatus(
        t("fileEditor.filesReordered", {
          count: moveCount,
          defaultValue_one: "File reordered",
          defaultValue_other: "{{count}} files reordered",
        }),
      );
    },
    [reorderFiles, showStatus, t],
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
              title: t("fileEditor.unzip.extracted", {
                count: result.extractedStubs.length,
                name: file.name,
                defaultValue_one: "Extracted {{count}} file from {{name}}",
                defaultValue_other: "Extracted {{count}} files from {{name}}",
              }),
              expandable: false,
              durationMs: 3500,
            });
          } else {
            alert({
              alertType: "error",
              title: t(
                "fileEditor.unzip.failed",
                "Failed to extract files from {{name}}",
                { name: file.name },
              ),
              body: result.errors.join("\n"),
              expandable: true,
              durationMs: 3500,
            });
          }
        } catch (error) {
          console.error("Failed to unzip file:", error);
          alert({
            alertType: "error",
            title: t("fileEditor.unzip.error", "Error unzipping {{name}}", {
              name: file.name,
            }),
            expandable: false,
            durationMs: 3500,
          });
        }
      }
    },
    [selectors, fileActions, removeFiles, t],
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

  const handleLoadFromStorage = useCallback(
    async (selectedFiles: File[]) => {
      if (selectedFiles.length === 0) return;

      try {
        showStatus(
          t("fileEditor.loadedFromStorage", {
            count: selectedFiles.length,
            defaultValue_one: "Loaded {{count}} file from storage",
            defaultValue_other: "Loaded {{count}} files from storage",
          }),
        );
      } catch (err) {
        console.error("Error loading files from storage:", err);
        showError(
          t(
            "fileEditor.loadFromStorageFailed",
            "Failed to load some files from storage",
          ),
        );
      }
    },
    [showStatus, showError, t],
  );

  const totalItems =
    activeStirlingFileStubs.length > 0 ? activeStirlingFileStubs.length + 1 : 0;

  const { range, padTop, padBottom, setContainer } = useVirtualFileRows(
    totalItems,
    rowHeightPx(true),
    true,
  );

  // Before virtualization measures its scroll container (padTop === 0 && padBottom === 0 && range.end === totalItems),
  // avoid mounting the entire dataset on the initial render pass.
  const isVirtualMeasured = padTop > 0 || padBottom > 0;
  const effectiveEnd =
    !isVirtualMeasured && range.end === totalItems && totalItems > 13
      ? 13
      : range.end;

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
      <Box
        className="file-editor-content"
        pos="relative"
        style={{ overflow: "auto", height: "100%", width: "100%" }}
      >
        <LoadingOverlay visible={state.ui.isProcessing} />

        <Box p="md">
          {activeStirlingFileStubs.length === 0 ? (
            <Center h="60vh">
              <AddFileCard />
            </Center>
          ) : (
            <div
              ref={setContainer}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(276px, 1fr))",
                rowGap: "1.5rem",
                padding: "1rem",
                pointerEvents: "auto",
              }}
            >
              {padTop > 0 && (
                <div
                  aria-hidden="true"
                  className={styles.virtualPad}
                  style={{ height: padTop }}
                />
              )}

              {/* Index 0 is AddFileCard when range covers it */}
              {range.start === 0 && <AddFileCard key="add-file-card" />}

              {activeStirlingFileStubs
                .slice(
                  Math.max(0, range.start - 1),
                  Math.max(0, effectiveEnd - 1),
                )
                .map((record, sliceIdx) => {
                  const index = Math.max(0, range.start - 1) + sliceIdx;
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
                      policies={
                        policyFileBadges.get(record.id) ?? EMPTY_POLICIES
                      }
                    />
                  );
                })}

              {padBottom > 0 && (
                <div
                  aria-hidden="true"
                  className={styles.virtualPad}
                  style={{ height: padBottom }}
                />
              )}
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
