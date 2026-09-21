import { Icon } from "@app/ui/Icon";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Drawer, Menu, Tooltip } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { useMediaQuery } from "@mantine/hooks";
import { FilesToolbarBulkMenu } from "@app/components/filesPage/FilesToolbarBulkMenu";
import { FilesToolbarCount } from "@app/components/filesPage/FilesToolbarCount";
import { FolderMenu } from "@app/components/filesPage/FolderMenu";
import { NewFolderButton } from "@app/components/filesPage/NewFolderButton";
import { useFileLibraryWorkbenchBarButtons } from "@app/components/filesPage/useFileLibraryWorkbenchBarButtons";

import { useAuth } from "@app/auth/UseSession";
import { useSharingEnabled } from "@app/hooks/useSharingEnabled";
import { useFolders } from "@app/contexts/FolderContext";
import { useOpenFolder } from "@app/components/filesPage/useOpenFolder";
import { useFileActions } from "@app/contexts/file/fileHooks";
import { useAllFiles } from "@app/contexts/FileContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useDropzoneFiles } from "@app/hooks/useDropzoneFiles";
import {
  useNavigationActions,
  useNavigationGuard,
} from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import { useLibraryFiles } from "@app/components/filesPage/useLibraryFiles";
import { useFolderFileStates } from "@app/components/filesPage/useFolderFileStates";
import { useDiskFolder } from "@app/components/filesPage/useDiskFolder";
import { LibraryToolbar } from "@app/components/filesPage/LibraryToolbar";
import { LibraryTabs } from "@app/components/filesPage/LibraryTabs";
import { useLibraryScrollPosition } from "@app/components/filesPage/useLibraryScrollPosition";

import { FileId } from "@app/types/file";
import { StirlingFileStub } from "@app/types/fileContext";
import {
  FolderId,
  FolderRecord,
  ROOT_FOLDER_ID,
  folderKind,
} from "@app/types/folder";

import {
  FileGrid,
  FilesPageEntry,
  type DiskFileState,
} from "@app/components/filesPage/FileGrid";
import { useProcessingFolders } from "@app/hooks/useProcessingFolders";
import { FolderProcessingSetup } from "@app/components/policies/FolderProcessingSetup";
import { useServerProcessingBlock } from "@app/hooks/useServerProcessingBlock";
import { FolderSweepWall } from "@app/components/policies/SweepRunWall";
import { RestoreOriginalsDialog } from "@app/components/filesPage/RestoreOriginalsDialog";
import { FileDetailsPanel } from "@app/components/filesPage/FileDetailsPanel";
import BulkUploadToServerModal from "@app/components/shared/BulkUploadToServerModal";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { canPickDirectory } from "@app/services/directoryPicker";
import { isDiskFolderId } from "@app/types/folder";
import { useNewFolderFlow } from "@app/hooks/useNewFolderFlow";
import { useLibraryRefresh } from "@app/hooks/useLibraryRefresh";
import { useLibraryUpload } from "@app/components/filesPage/useLibraryUpload";
import {
  readDiskFile,
  type DiskFileEntry,
} from "@app/services/localFolderContents";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { MoveToFolderDialog } from "@app/components/filesPage/MoveToFolderDialog";
import { FolderNameDialog } from "@app/components/filesPage/FolderNameDialog";
import { libraryEntries } from "@app/components/filesPage/libraryEntries";
import { DeleteFolderDialog } from "@app/components/filesPage/DeleteFolderDialog";
import { DeleteFilesDialog } from "@app/components/filesPage/DeleteFilesDialog";
import { VersionHistoryModal } from "@app/components/filesPage/VersionHistoryModal";
import { RenameFileDialog } from "@app/components/shared/RenameFileDialog";
import { duplicateStoredFile } from "@app/utils/duplicateFile";
import { downloadFileFromStorage } from "@app/utils/downloadUtils";
import { fileStorage } from "@app/services/fileStorage";
import { materializeServerStubs } from "@app/services/fileSyncService";
import {
  FILES_PAGE_DRAG_TYPE,
  parseFilesPageDragPayload,
} from "@app/components/filesPage/dragDrop";
import { clearFilesPageReturnRoute } from "@app/components/filesPage/filesPageReturnRoute";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import "@app/components/filesPage/FilesPage.css";

export default function FileManagerView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const openFolder = useOpenFolder();
  const folderDropHandlers = useFolderDropHandlers();

  const { sharingEnabled } = useSharingEnabled();

  const isCompactDetailsViewport = useMediaQuery("(max-width: 800px)") ?? false;

  const useFullScreenDrawer = useMediaQuery("(max-width: 640px)") ?? false;
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  // Saving existing files to the server targets its root, independent of the open folder.
  const [saveToServerTarget, setSaveToServerTarget] = useState<
    StirlingFileStub[] | null
  >(null);

  const [versionHistoryFile, setVersionHistoryFile] =
    useState<StirlingFileStub | null>(null);
  const folders = useFolders();
  const { actions: fileActions } = useFileActions();
  const { fileIds: activeWorkspaceFileIds } = useAllFiles();
  const activeWorkspaceFileIdSet = useMemo(
    () => new Set(activeWorkspaceFileIds.map((id) => id as string)),
    [activeWorkspaceFileIds],
  );
  const { addFiles } = useFileHandler();
  const { config: appConfig } = useAppConfig();
  const isMobile = useIsMobile();
  // Guests cannot use server storage; explain the disabled control before a request fails.
  const { isAnonymous } = useAuth();
  const signInRequiredReason = isAnonymous
    ? t("filesPage.signInRequired", "Sign in to use cloud storage.")
    : null;
  const uploadEnabled = appConfig?.storageEnabled === true;
  const saveToServerDisabledReason: string | null =
    signInRequiredReason ??
    (uploadEnabled
      ? null
      : t(
          "filesPage.saveToServerDisabledHint",
          "Saving to the server isn't enabled on this server. Ask your admin to enable it.",
        ));
  const { actions: navActions } = useNavigationActions();
  const { requestNavigation } = useNavigationGuard();
  const { setActiveFileId } = useViewer();

  const filesPage = useFilesPage();
  const {
    allFiles,
    fileMap,
    loading,
    refresh,
    selectedFileIds,
    setSelectedFileIds,
    clearSelection,
    viewMode,
    setViewMode,
    sortMode,
    setSortMode,
    search,
    setSearch,
    originFilter,
    setOriginFilter,
    typeFilter,
    setTypeFilter,
    currentTab,
    setCurrentTab,
    folderNameDialog,
    openNewFolderDialog,
    openRenameFolderDialog,
    closeFolderNameDialog,
    submitFolderName,
    moveDialog,
    promptMoveFiles,
    closeMoveDialog,
    moveFilesTo,
    moveFolderTo,
    removeFiles,
    deleteDialogFileIds,
    deleteDialogOpen,
    closeDeleteDialog,
    confirmRemoveFiles,
    promptDeleteFolder,
    deleteFolder,
    deleteFolderDialog,
    closeDeleteFolderDialog,
    setFolderAppearance,
  } = filesPage;

  const deleteDialogFiles = useMemo(
    () =>
      deleteDialogFileIds
        .map((id) => fileMap.get(id))
        .filter((s): s is StirlingFileStub => Boolean(s)),
    [deleteDialogFileIds, fileMap],
  );

  const setCurrentFolderId = folders.setCurrentFolderId;
  const resolveDiskFolder = folders.resolveDiskFolder;
  const foldersById = folders.foldersById;
  const currentFolderId = folders.currentFolderId;

  useEffect(() => {
    const match = location.pathname.match(/^\/files\/([^/]+)/);
    const param = match?.[1] ?? null;
    if (param === null) {
      setCurrentFolderId(ROOT_FOLDER_ID);
      return;
    }
    if (foldersById.has(param as FolderId)) {
      setCurrentFolderId(param as FolderId);
      return;
    }
    if (isDiskFolderId(param) && resolveDiskFolder(param as FolderId)) {
      // A mount subdirectory deep link: rebuilt from the id, mapped next render.
      setCurrentFolderId(param as FolderId);
      return;
    }
    // Wait for folder loading and mount discovery before rejecting an unknown folder ID.
    if (!folders.loading) {
      setCurrentFolderId(ROOT_FOLDER_ID);
    }
  }, [
    location.pathname,
    foldersById,
    setCurrentFolderId,
    resolveDiskFolder,
    folders.loading,
  ]);

  useEffect(() => {
    if (
      !sharingEnabled &&
      (currentTab === "shared" || currentTab === "sharedByMe")
    ) {
      setCurrentTab("all");
    }
  }, [sharingEnabled, currentTab, setCurrentTab]);

  const currentFolder = currentFolderId
    ? folders.foldersById.get(currentFolderId)
    : undefined;
  const currentLocalDirectory =
    currentFolder && folderKind(currentFolder) === "local"
      ? currentFolder.directory
      : undefined;
  const headerEditsDisabled = Boolean(
    currentFolder &&
    folderKind(currentFolder) === "server" &&
    !folders.serverReachable,
  );
  const { diskRevision } = filesPage;
  const { diskEntries, diskLoading } = useDiskFolder(
    currentLocalDirectory,
    currentFolderId,
    diskRevision,
    folders.setError,
  );

  const { visibleFolders, visibleFiles, availableTypes } = useLibraryFiles({
    allFiles,
    currentFolderId,
    currentTab,
    search,
    sortMode,
    originFilter,
    typeFilter,
    diskEntries: currentLocalDirectory ? diskEntries : undefined,
  });
  const openDiskFile = useCallback(
    async (entry: DiskFileEntry) => {
      try {
        const file = await readDiskFile(entry);
        if (!file) return;
        clearFilesPageReturnRoute();
        await addFiles([file], { selectFiles: true });
        navActions.setWorkbench("viewer");
        navigate("/");
      } catch (err) {
        folders.setError(
          err instanceof Error
            ? t("filesPage.error.openDiskFileFailedDetail", {
                name: entry.name,
                message: err.message,
                defaultValue: `Could not open ${entry.name}: ${err.message}`,
              })
            : t("filesPage.error.openDiskFileFailed", {
                name: entry.name,
                defaultValue: `Could not open ${entry.name}.`,
              }),
        );
      }
    },
    [addFiles, navActions, navigate, folders, t],
  );

  const processingApi = useProcessingFolders();
  const currentProcessing = currentFolder
    ? processingApi.stateFor(currentFolder)
    : undefined;
  const outputDirectory = currentLocalDirectory
    ? currentProcessing?.outputDirectory
    : undefined;
  const processingRecordId = currentProcessing?.id;
  const processingView = Boolean(
    processingRecordId && (outputDirectory || !currentLocalDirectory),
  );
  const { retryFile, revertFile } = processingApi;
  const { fileStates, setFileStates, revertables, setRevertables } =
    useFolderFileStates(processingRecordId, processingView);

  const [processingSetupFolder, setProcessingSetupFolder] =
    useState<FolderRecord | null>(null);
  // Restoring originals also pauses the folder, so it requires confirmation.
  const [revertConfirmName, setRevertConfirmName] = useState<string | null>(
    null,
  );
  const [revertAllTarget, setRevertAllTarget] = useState<FolderRecord | null>(
    null,
  );

  const [diskStateFilter, setDiskStateFilter] = useState<DiskFileState | "all">(
    "all",
  );
  const diskStateFor = useCallback(
    (name: string): DiskFileState | undefined => fileStates.get(name),
    [fileStates],
  );

  const stateCounts = useMemo(() => {
    const counts: Record<DiskFileState, number> = {
      done: 0,
      processing: 0,
      failed: 0,
      waiting: 0,
    };
    for (const state of fileStates.values()) counts[state] += 1;
    return counts;
  }, [fileStates]);
  const retryDiskFile = useCallback(
    (name: string) => {
      if (!processingRecordId) return;
      void retryFile(processingRecordId, name)
        .then(() =>
          setFileStates((prev) => {
            const next = new Map(prev);
            next.set(name, "processing");
            return next;
          }),
        )
        .catch((err) =>
          folders.setError(
            err instanceof Error
              ? t("filesPage.error.retryFailedDetail", {
                  name,
                  message: err.message,
                  defaultValue: `Could not retry ${name}: ${err.message}`,
                })
              : t("filesPage.error.retryFailed", {
                  name,
                  defaultValue: `Could not retry ${name}.`,
                }),
          ),
        );
    },
    [processingRecordId, retryFile, folders, t],
  );
  const revertFolderFile = useCallback(
    (name: string) => {
      if (!processingRecordId) return;
      void revertFile(processingRecordId, name)
        .then(() => {
          setFileStates((prev) => {
            const next = new Map(prev);
            next.set(name, "waiting");
            return next;
          });
          setRevertables((prev) => {
            const next = new Set(prev);
            next.delete(name);
            return next;
          });
        })
        .catch((err) =>
          folders.setError(
            err instanceof Error
              ? t("filesPage.error.revertFailedDetail", {
                  name,
                  message: err.message,
                  defaultValue: `Could not restore ${name}: ${err.message}`,
                })
              : t("filesPage.error.revertFailed", {
                  name,
                  defaultValue: `Could not restore ${name}.`,
                }),
          ),
        );
    },
    [processingRecordId, revertFile, folders, t],
  );
  const revertAllInFolder = useCallback(
    (folder: FolderRecord) => {
      void processingApi
        .revertAll(folder)
        .then((outcome) => {
          if (outcome && outcome.restored === 0 && outcome.skipped === 0) {
            folders.setError(
              t(
                "filesPage.processing.nothingToRestore",
                "No originals to restore - these files are already their originals.",
              ),
            );
          }
        })
        .catch((err) =>
          folders.setError(
            err instanceof Error
              ? t("filesPage.error.revertAllFailedDetail", {
                  message: err.message,
                  defaultValue: `Could not restore originals: ${err.message}`,
                })
              : t(
                  "filesPage.error.revertAllFailed",
                  "Could not restore originals.",
                ),
          ),
        );
    },
    [processingApi, folders, t],
  );

  const runFolderAction = useCallback(
    (action: (folder: FolderRecord) => Promise<void>, label: string) => {
      if (!currentFolder) return;
      void action(currentFolder).catch((err) =>
        folders.setError(
          err instanceof Error
            ? t("filesPage.error.actionFailedDetail", {
                action: label,
                message: err.message,
                defaultValue: `Could not ${label}: ${err.message}`,
              })
            : t("filesPage.error.actionFailed", {
                action: label,
                defaultValue: `Could not ${label}.`,
              }),
        ),
      );
    },
    [currentFolder, folders, t],
  );

  const entries = useMemo<FilesPageEntry[]>(
    () =>
      libraryEntries({
        visibleFolders,
        visibleFiles,
        currentFolderId,
        foldersById,
        fileCountsByFolder: filesPage.fileCountsByFolder,
        search,
        sortMode,
        originFilter,
        typeFilter,
        diskEntries: currentLocalDirectory ? diskEntries : undefined,
      })
        .map((entry) => {
          const name = entry.disk?.name ?? entry.file?.name;
          const stateVisible = entry.disk
            ? Boolean(outputDirectory)
            : processingView;
          return {
            ...entry,
            diskState: name && stateVisible ? diskStateFor(name) : undefined,
            hasOriginal:
              entry.disk && outputDirectory
                ? revertables.has(entry.disk.name)
                : undefined,
          };
        })
        .filter(
          (entry) =>
            diskStateFilter === "all" ||
            entry.diskState === undefined ||
            entry.diskState === diskStateFilter,
        ),
    [
      visibleFolders,
      visibleFiles,
      currentFolderId,
      foldersById,
      filesPage.fileCountsByFolder,
      search,
      sortMode,
      originFilter,
      typeFilter,
      currentLocalDirectory,
      diskEntries,
      outputDirectory,
      processingView,
      diskStateFor,
      revertables,
      diskStateFilter,
    ],
  );

  const lastClickedFileRef = useRef<FileId | null>(null);
  const handleSelectFile = useCallback(
    (fileId: FileId, shift: boolean, ctrl: boolean) => {
      setSelectedFileIds((prev) => {
        const next = new Set(prev);
        if (shift && lastClickedFileRef.current) {
          const idx = visibleFiles.findIndex((f) => f.id === fileId);
          const lastIdx = visibleFiles.findIndex(
            (f) => f.id === lastClickedFileRef.current,
          );
          if (idx >= 0 && lastIdx >= 0) {
            const [a, b] = idx < lastIdx ? [idx, lastIdx] : [lastIdx, idx];
            for (let i = a; i <= b; i += 1) {
              next.add(visibleFiles[i].id);
            }
            return next;
          }
        }
        const inMultiSelectMode = prev.size >= 2;
        if (ctrl || inMultiSelectMode) {
          if (next.has(fileId)) next.delete(fileId);
          else next.add(fileId);
        } else {
          const isSoleSelection = prev.size === 1 && prev.has(fileId);
          next.clear();
          if (!isSoleSelection) next.add(fileId);
        }
        return next;
      });
      lastClickedFileRef.current = fileId;
    },
    [visibleFiles, setSelectedFileIds],
  );

  const handleContentBackgroundClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        clearSelection();
      }
    },
    [clearSelection],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingExternal, setIsDraggingExternal] = useState(false);

  const handleNativeUpload = useLibraryUpload();
  const getDropzoneFiles = useDropzoneFiles();

  const onFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (list.length === 0) return;
      await handleNativeUpload(list);
    },
    [handleNativeUpload],
  );

  const openFilesInWorkbench = useCallback(
    async (fileIds: FileId[]) => {
      const stubs = fileIds
        .map((id) => fileMap.get(id))
        .filter((s): s is StirlingFileStub => Boolean(s));
      if (stubs.length === 0) return;

      const proceed = async () => {
        clearFilesPageReturnRoute();

        // Open workspace files directly; their bytes need no further materialization.
        const alreadyOpen = stubs.filter((stub) =>
          activeWorkspaceFileIdSet.has(stub.id as string),
        );
        const toOpen = stubs.filter(
          (stub) => !activeWorkspaceFileIdSet.has(stub.id as string),
        );

        // Server-only stubs have no bytes in IDB; download + ingest first.
        const materialized = await materializeServerStubs(toOpen, {
          addFiles: fileActions.addFilesWithOptions,
          updateStub: fileActions.updateStirlingFileStub,
        });
        if (materialized.length !== toOpen.length) {
          // Refresh successful imports even when another file fails.
          await refresh();
          return;
        }

        if (materialized.length > 0) {
          await fileActions.addStirlingFileStubs(materialized, {
            selectFiles: false,
          });
        }

        const opened = [...alreadyOpen, ...materialized];
        if (opened.length === 1) {
          setActiveFileId(opened[0].id);
          navActions.setWorkbench("viewer");
        } else if (opened.length > 1) {
          navActions.setWorkbench("fileEditor");
        }
        navigate(EDITOR_BASENAME);
      };

      requestNavigation(() => {
        void proceed();
      });
    },
    [
      fileMap,
      fileActions,
      setActiveFileId,
      navActions,
      navigate,
      requestNavigation,
      clearFilesPageReturnRoute,
      activeWorkspaceFileIdSet,
      refresh,
    ],
  );

  const handleAddToWorkspace = useCallback(
    (fileIds: FileId[]) => openFilesInWorkbench(fileIds),
    [openFilesInWorkbench],
  );

  const handleOpenFile = useCallback(
    (file: StirlingFileStub) => {
      void handleAddToWorkspace([file.id]);
    },
    [handleAddToWorkspace],
  );

  const handleOpenFolder = useCallback(
    (id: FolderId) => {
      openFolder(id);
      clearSelection();
    },
    [openFolder, clearSelection],
  );

  const dropZoneRef = useRef<HTMLDivElement>(null);
  const onScrollCapture = useLibraryScrollPosition(
    dropZoneRef,
    `${currentTab}:${currentFolderId}:${viewMode}`,
    loading || diskLoading,
    entries.length,
  );
  useEffect(() => {
    const node = dropZoneRef.current;
    if (!node) return;
    let counter = 0;
    const isExternalFileDrag = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");

    const onEnter = (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      counter += 1;
      setIsDraggingExternal(true);
    };
    const onOver = (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
    };
    const onLeave = () => {
      counter -= 1;
      if (counter <= 0) {
        counter = 0;
        setIsDraggingExternal(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      counter = 0;
      setIsDraggingExternal(false);
      getDropzoneFiles(e)
        .then((dropped) =>
          handleNativeUpload(dropped.filter((item) => item instanceof File)),
        )
        .catch((err) =>
          folders.setError(
            err instanceof Error
              ? t("filesPage.error.uploadFilesFailedDetail", {
                  message: err.message,
                  defaultValue: `Could not upload files: ${err.message}`,
                })
              : t(
                  "filesPage.error.uploadFilesFailed",
                  "Could not upload files.",
                ),
          ),
        );
    };
    node.addEventListener("dragenter", onEnter);
    node.addEventListener("dragover", onOver);
    node.addEventListener("dragleave", onLeave);
    node.addEventListener("drop", onDrop);
    return () => {
      node.removeEventListener("dragenter", onEnter);
      node.removeEventListener("dragover", onOver);
      node.removeEventListener("dragleave", onLeave);
      node.removeEventListener("drop", onDrop);
    };
  }, [getDropzoneFiles, handleNativeUpload, folders, t]);

  const handleClose = useCallback(() => {
    // Drop the return-route hint so the workbench doesn't show a stale back.
    clearFilesPageReturnRoute();
    navigate(EDITOR_BASENAME);
  }, [navigate]);

  const focusSearch = useCallback(() => {
    (
      document.getElementById("super-search-input") as HTMLInputElement | null
    )?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const inInput =
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !inInput) {
        e.preventDefault();
        setSelectedFileIds(new Set(visibleFiles.map((f) => f.id)));
        return;
      }

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !inInput &&
        selectedFileIds.size > 0
      ) {
        e.preventDefault();
        removeFiles(Array.from(selectedFileIds)).catch((err) =>
          folders.setError(
            err instanceof Error
              ? t("filesPage.error.removeFilesFailedDetail", {
                  message: err.message,
                  defaultValue: `Could not remove files: ${err.message}`,
                })
              : t(
                  "filesPage.error.removeFilesFailed",
                  "Could not remove files.",
                ),
          ),
        );
        return;
      }

      if (e.key === "/" && !inInput) {
        e.preventDefault();
        focusSearch();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    visibleFiles,
    selectedFileIds,
    removeFiles,
    setSelectedFileIds,
    focusSearch,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable)
      ) {
        return;
      }
      const overlays = document.querySelectorAll(".mantine-Modal-overlay");
      for (const overlay of overlays) {
        if ((overlay as HTMLElement).offsetWidth > 0) return;
      }

      if (selectedFileIds.size > 0) {
        clearSelection();
        return;
      }
      handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose, selectedFileIds, clearSelection]);

  const handleRemoveFiles = useCallback(
    async (fileIds: FileId[]) => {
      await removeFiles(fileIds);
    },
    [removeFiles],
  );

  /** Cloud-only rows hold no bytes; pull them local before acting on them. */
  const localCopyOf = useCallback(
    async (file: StirlingFileStub): Promise<StirlingFileStub | null> => {
      const [materialized] = await materializeServerStubs([file], {
        addFiles: fileActions.addFilesWithOptions,
        updateStub: fileActions.updateStirlingFileStub,
      });
      return materialized ?? null;
    },
    [fileActions],
  );

  const handleDownloadFile = useCallback(
    async (file: StirlingFileStub) => {
      try {
        const local = await localCopyOf(file);
        if (!local) return;
        await downloadFileFromStorage(local);
      } catch (err) {
        console.error("[FilesPage] Download failed", err);
        folders.setError(
          t("filesPage.error.downloadFailed", "Could not download the file."),
        );
      }
    },
    [localCopyOf, folders, t],
  );

  const handleDuplicateFile = useCallback(
    async (file: StirlingFileStub) => {
      try {
        const local = await localCopyOf(file);
        if (!local) return;
        const copyId = await duplicateStoredFile(
          local,
          allFiles.map((f) => f.name),
          addFiles,
        );
        if (!copyId) {
          throw new Error(`File "${local.name}" not found in storage`);
        }
        await refresh();
      } catch (err) {
        console.error("[FilesPage] Duplicate failed", err);
        folders.setError(
          t("filesPage.error.duplicateFailed", "Could not duplicate the file."),
        );
      }
    },
    [localCopyOf, allFiles, addFiles, refresh, folders, t],
  );

  const [renameTarget, setRenameTarget] = useState<StirlingFileStub | null>(
    null,
  );

  // The stub name is what the UI and exports read, so a rename is a metadata
  // write; the workbench copy (if any) is updated in the same breath.
  const handleConfirmRename = useCallback(
    async (name: string) => {
      const file = renameTarget;
      if (!file) return;
      const local = await localCopyOf(file);
      if (!local) return;
      // quickKey is name|size|lastModified; a stale one would make a re-upload
      // of the original look like a duplicate of the renamed file.
      const quickKey = `${name}|${local.size}|${local.lastModified}`;
      const saved = await fileStorage.updateFileMetadata(local.id, {
        name,
        quickKey,
      });
      if (!saved) {
        throw new Error(
          t("fileSidebar.rename.error", "Could not rename the file."),
        );
      }
      fileActions.updateStirlingFileStub(local.id, { name, quickKey });
      setRenameTarget(null);
      await refresh();
    },
    [renameTarget, localCopyOf, fileActions, refresh, t],
  );

  const totalCount = entries.length;
  const selectedFiles = useMemo(
    () => Array.from(selectedFileIds),
    [selectedFileIds],
  );
  // A phone with files selected shows a contextual selection bar instead of the
  // full toolbar - five bulk buttons plus filters cannot fit the width.
  const mobileSelection = isMobile && selectedFiles.length > 0;

  const localOnlySelectedStubs = useMemo(
    () =>
      selectedFiles
        .map((id) => fileMap.get(id))
        .filter(
          (s): s is StirlingFileStub =>
            Boolean(s) && s!.remoteStorageId == null,
        ),
    [selectedFiles, fileMap],
  );

  const processingBlock = useServerProcessingBlock();

  const {
    addLocalFolder,
    createFolderHereBlockedReason: newFolderDisabledReason,
    serverFolderBlock: serverFolderDisabledReason,
  } = useNewFolderFlow();

  const { refreshing, refresh: handleRefresh } = useLibraryRefresh();

  // The workbench bar re-registers changed values; stable identities prevent a render loop.
  const openFilePicker = useCallback(() => fileInputRef.current?.click(), []);

  const newFolderControl = useMemo(
    () => (
      <NewFolderButton
        trigger="icon"
        label={t("filesPage.newFolder", "New folder")}
        disabledReason={newFolderDisabledReason}
        serverDisabledReason={serverFolderDisabledReason}
        currentFolderId={folders.currentFolderId}
        canAddLocalFolder={canPickDirectory}
        onAddLocalFolder={() => void addLocalFolder()}
        onOpenDialog={openNewFolderDialog}
      />
    ),
    [
      t,
      newFolderDisabledReason,
      serverFolderDisabledReason,
      folders.currentFolderId,
      addLocalFolder,
      openNewFolderDialog,
    ],
  );
  const libraryActions = useMemo(
    () => (
      <>
        <Tooltip
          label={signInRequiredReason ?? t("filesPage.refresh", "Refresh")}
          withinPortal
        >
          <ActionIcon
            variant="tertiary"
            size="sm"
            loading={refreshing}
            disabled={refreshing || Boolean(signInRequiredReason)}
            aria-busy={refreshing}
            aria-label={t("filesPage.refresh", "Refresh")}
            onClick={handleRefresh}
          >
            <Icon name="refresh-cw" size={20} />
          </ActionIcon>
        </Tooltip>
        {newFolderControl}
        <Tooltip label={t("filesPage.upload", "Upload")} withinPortal>
          <ActionIcon
            variant="tertiary"
            size="sm"
            aria-label={t("filesPage.upload", "Upload")}
            onClick={openFilePicker}
          >
            <Icon name="file-up" size={20} />
          </ActionIcon>
        </Tooltip>
      </>
    ),
    [
      t,
      signInRequiredReason,
      refreshing,
      handleRefresh,
      newFolderControl,
      openFilePicker,
    ],
  );

  // Mobile has no sidebar, so its library actions live in the workbench bar.
  useFileLibraryWorkbenchBarButtons({
    path: null,
    actions: isMobile ? libraryActions : null,
  });

  const bulkActionsMenu =
    selectedFiles.length > 0 ? (
      <FilesToolbarBulkMenu
        selectedCount={selectedFiles.length}
        onAddToWorkspace={() => handleAddToWorkspace(selectedFiles)}
        onSaveToServer={
          localOnlySelectedStubs.length > 0
            ? () => setSaveToServerTarget(localOnlySelectedStubs)
            : undefined
        }
        saveToServerDisabledReason={saveToServerDisabledReason ?? undefined}
        onShowDetails={
          selectedFiles.length === 1 && isCompactDetailsViewport
            ? () => setMobileDetailsOpen(true)
            : undefined
        }
        onMove={() => promptMoveFiles(selectedFiles)}
        onRemove={() => handleRemoveFiles(selectedFiles)}
        onClearSelection={() => clearSelection()}
      />
    ) : null;

  return (
    <div
      className="files-page"
      ref={dropZoneRef}
      onScrollCapture={onScrollCapture}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={onFileInputChange}
      />

      {folders.error && (
        <div
          role="alert"
          className="files-page-error-banner"
          style={{
            padding: "0.6rem 1.25rem",
            background:
              "color-mix(in srgb, var(--mantine-color-red-6) 12%, transparent)",
            color: "var(--c-text)",
            borderBottom: "1px solid var(--c-border-subtle)",
            fontSize: "0.85rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>{folders.error}</span>
          <ActionIcon
            size="sm"
            variant="tertiary"
            aria-label={t("filesPage.dismissError", "Dismiss")}
            onClick={() => folders.setError(null)}
          >
            &times;
          </ActionIcon>
        </div>
      )}

      <div className="files-page-body">
        <main className="files-page-main">
          <LibraryTabs
            currentTab={currentTab}
            sharingEnabled={sharingEnabled}
            onChange={setCurrentTab}
            onOpenRoot={() => openFolder(ROOT_FOLDER_ID)}
            rootDropHandlers={folderDropHandlers(ROOT_FOLDER_ID)}
            breadcrumbs={<Breadcrumbs />}
          />

          <div className="files-page-toolbar">
            <FilesToolbarCount
              loading={loading}
              totalCount={totalCount}
              selectedCount={selectedFiles.length}
            />
            {bulkActionsMenu && (
              <div className="files-page-selection-actions">
                {bulkActionsMenu}
              </div>
            )}
            {currentFolder && !mobileSelection && (
              <div className="files-page-folder-actions">
                <FolderMenu
                  folder={currentFolder}
                  processing={currentProcessing}
                  continuous={folderKind(currentFolder) === "virtual"}
                  isMount={folderKind(currentFolder) === "local"}
                  canUnmount={currentFolder.parentFolderId === null}
                  editsDisabled={headerEditsDisabled}
                  processingBlock={processingBlock}
                  editsDisabledHint={t(
                    "filesPage.offlineNoFolderEdits",
                    "Offline - folder changes are disabled.",
                  )}
                  onStartProcessing={() =>
                    setProcessingSetupFolder(currentFolder)
                  }
                  onRunProcessing={() =>
                    runFolderAction(processingApi.sweep, "process folder now")
                  }
                  onStopProcessing={() =>
                    runFolderAction(
                      processingApi.disable,
                      "pause processing folder",
                    )
                  }
                  onResumeProcessing={() =>
                    runFolderAction(processingApi.enable, "resume processing")
                  }
                  onRemoveProcessing={() =>
                    runFolderAction(
                      processingApi.remove,
                      "remove processing folder",
                    )
                  }
                  onEditProcessing={() =>
                    setProcessingSetupFolder(currentFolder)
                  }
                  onRevertAll={
                    folderKind(currentFolder) === "local"
                      ? () => setRevertAllTarget(currentFolder)
                      : undefined
                  }
                  onRename={() => openRenameFolderDialog(currentFolder)}
                  onChangeAppearance={(appearance) => {
                    setFolderAppearance(currentFolder.id, appearance).catch(
                      (err) =>
                        folders.setError(
                          err instanceof Error
                            ? t(
                                "filesPage.error.folderAppearanceFailedDetail",
                                {
                                  message: err.message,
                                  defaultValue: `Could not update folder appearance: ${err.message}`,
                                },
                              )
                            : t(
                                "filesPage.error.folderAppearanceFailed",
                                "Could not update folder appearance.",
                              ),
                        ),
                    );
                  }}
                  onDelete={() => promptDeleteFolder(currentFolder)}
                />
              </div>
            )}
            <div className="files-page-toolbar-actions">
              {!mobileSelection && (
                <>
                  <LibraryToolbar
                    isMobile={isMobile}
                    availableTypes={availableTypes}
                    originFilter={originFilter}
                    setOriginFilter={setOriginFilter}
                    typeFilter={typeFilter}
                    setTypeFilter={setTypeFilter}
                    search={search}
                    setSearch={setSearch}
                    sortMode={sortMode}
                    setSortMode={setSortMode}
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                  />
                </>
              )}
            </div>
          </div>

          {processingView && (
            <div className="files-page-above-table">
              <div className="files-page-state-filters">
                {(
                  ["all", "done", "processing", "failed", "waiting"] as const
                ).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={diskStateFilter === value ? "is-active" : ""}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDiskStateFilter(value);
                    }}
                  >
                    {t(`filesPage.diskState.${value}`, value)}
                    {value !== "all" && stateCounts[value] > 0 && (
                      <span className="files-page-state-count">
                        {stateCounts[value]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div
            className="files-page-content"
            onClick={handleContentBackgroundClick}
          >
            <FolderSweepWall policyId={processingRecordId} />
            <FileGrid
              entries={entries}
              loading={loading || diskLoading}
              currentTab={currentTab}
              searchActive={search.trim().length > 0}
              serverReachable={folders.serverReachable}
              onActionError={folders.setError}
              selectedFileIds={selectedFileIds}
              activeWorkspaceFileIds={activeWorkspaceFileIdSet}
              viewMode={viewMode}
              sortMode={sortMode}
              onChangeSortMode={setSortMode}
              onSelectFile={handleSelectFile}
              onSetSelection={setSelectedFileIds}
              onOpenFolder={handleOpenFolder}
              onStartProcessing={setProcessingSetupFolder}
              onOpenDiskFile={(entry) => void openDiskFile(entry)}
              onRetryFile={retryDiskFile}
              onRevertFile={setRevertConfirmName}
              onRequestRevertAll={setRevertAllTarget}
              onOpenFile={handleOpenFile}
              onMoveFiles={moveFilesTo}
              onMoveFolder={moveFolderTo}
              onRenameFolder={openRenameFolderDialog}
              onDeleteFolder={promptDeleteFolder}
              onChangeFolderAppearance={(folderId, appearance) => {
                setFolderAppearance(folderId, appearance).catch((err) =>
                  folders.setError(
                    err instanceof Error
                      ? t("filesPage.error.folderAppearanceFailedDetail", {
                          message: err.message,
                          defaultValue: `Could not update folder appearance: ${err.message}`,
                        })
                      : t(
                          "filesPage.error.folderAppearanceFailed",
                          "Could not update folder appearance.",
                        ),
                  ),
                );
              }}
              onRemoveFiles={handleRemoveFiles}
              onPromptMoveFiles={promptMoveFiles}
              onSaveToServer={(file) => setSaveToServerTarget([file])}
              onVersionHistory={(file) => setVersionHistoryFile(file)}
              onDownloadFile={handleDownloadFile}
              onRenameFile={setRenameTarget}
              onDuplicateFile={handleDuplicateFile}
              saveToServerDisabledReason={saveToServerDisabledReason}

              onEmptyUpload={() => fileInputRef.current?.click()}
              emptyNewFolderControl={
                <NewFolderButton
                  label={t("filesPage.newFolder", "New folder")}
                  size="md"
                  disabledReason={newFolderDisabledReason}
                  serverDisabledReason={serverFolderDisabledReason}
                  currentFolderId={folders.currentFolderId}
                  canAddLocalFolder={canPickDirectory}
                  onAddLocalFolder={() => void addLocalFolder()}
                  onOpenDialog={openNewFolderDialog}
                />
              }
            />
            {isDraggingExternal && (
              <div className="files-page-drop-overlay" aria-live="polite">
                <span className="files-page-drop-overlay-icon">
                  <Icon name="file-up" />
                </span>
                <span>
                  {t("filesPage.dropOverlay", "Drop files to upload")}
                </span>
                <span className="files-page-drop-overlay-sub">
                  {(currentTab === "all" || currentTab === "cloud") &&
                  currentFolderId !== null
                    ? t(
                        "filesPage.dropOverlaySubFolder",
                        "They'll be added to this folder.",
                      )
                    : t(
                        "filesPage.dropOverlaySub",
                        "Files appear in Recents. Organize them into folders any time.",
                      )}
                </span>
              </div>
            )}
          </div>
        </main>

        {selectedFiles.length > 0 && !isCompactDetailsViewport && (
          <FileDetailsPanel
            selectedFileIds={selectedFiles}
            fileMap={fileMap}
            foldersById={foldersById}
            onClose={() => clearSelection()}
            onAddToWorkspace={handleAddToWorkspace}
            onMove={promptMoveFiles}
            onRemove={handleRemoveFiles}
            onSaveToServer={(files) => setSaveToServerTarget(files)}
            saveToServerDisabledReason={saveToServerDisabledReason}
          />
        )}
      </div>

      <RestoreOriginalsDialog
        opened={revertConfirmName !== null || revertAllTarget !== null}
        fileName={revertConfirmName ?? undefined}
        onClose={() => {
          setRevertConfirmName(null);
          setRevertAllTarget(null);
        }}
        onConfirm={() => {
          if (revertConfirmName) revertFolderFile(revertConfirmName);
          if (revertAllTarget) revertAllInFolder(revertAllTarget);
        }}
      />
      <FolderProcessingSetup
        folder={processingBlock ? null : processingSetupFolder}
        onClose={() => setProcessingSetupFolder(null)}
      />

      {isCompactDetailsViewport && (
        <Drawer
          opened={mobileDetailsOpen && selectedFiles.length === 1}
          onClose={() => setMobileDetailsOpen(false)}
          position="right"
          size={useFullScreenDrawer ? "100%" : "sm"}
          padding={0}
          withCloseButton={false}
          overlayProps={{ opacity: 0.45 }}
        >
          {mobileDetailsOpen && selectedFiles.length === 1 && (
            <FileDetailsPanel
              selectedFileIds={selectedFiles}
              fileMap={fileMap}
              foldersById={foldersById}
              onClose={() => setMobileDetailsOpen(false)}
              onAddToWorkspace={handleAddToWorkspace}
              onMove={promptMoveFiles}
              onRemove={handleRemoveFiles}
              onSaveToServer={(files) => setSaveToServerTarget(files)}
              saveToServerDisabledReason={saveToServerDisabledReason}
              compactVersions
              onOpenVersionHistory={() => {
                const f = fileMap.get(selectedFiles[0]);
                if (f) {
                  setMobileDetailsOpen(false);
                  setVersionHistoryFile(f);
                }
              }}
            />
          )}
        </Drawer>
      )}

      <MoveToFolderDialog
        opened={moveDialog.open}
        onClose={closeMoveDialog}
        // Files can go anywhere, but a folder moves only within its own kind and
        // never into a mount - a directory's subfolders are the filesystem's.
        folders={folders.folders.filter((candidate) => {
          if (!moveDialog.folderId) return true;
          if (folderKind(candidate) === "local") return false;
          const moving = folders.foldersById.get(moveDialog.folderId);
          return moving ? folderKind(candidate) === folderKind(moving) : true;
        })}
        initialFolderId={moveDialog.initial}
        disabledFolderId={moveDialog.folderId}
        onConfirm={async (target) => {
          if (moveDialog.fileIds && moveDialog.fileIds.length > 0) {
            await moveFilesTo(moveDialog.fileIds, target);
          } else if (moveDialog.folderId) {
            await moveFolderTo(moveDialog.folderId, target);
          }
        }}

        onCreateFolder={
          serverFolderDisabledReason === null
            ? (name, parentFolderId) =>
                folders.createFolder(name, parentFolderId)
            : undefined
        }
      />

      <FolderNameDialog
        opened={folderNameDialog.mode !== null}
        title={
          folderNameDialog.mode === "rename"
            ? t("filesPage.renameFolder", "Rename folder")
            : t("filesPage.newFolder", "New folder")
        }
        initialName={folderNameDialog.folder?.name ?? ""}
        submitLabel={
          folderNameDialog.mode === "rename"
            ? t("filesPage.save", "Save")
            : t("filesPage.create", "Create")
        }
        onClose={closeFolderNameDialog}
        onSubmit={submitFolderName}
      />

      <DeleteFolderDialog
        opened={deleteFolderDialog.folder !== null}
        folder={deleteFolderDialog.folder}
        fileCount={deleteFolderDialog.fileCount}
        onClose={closeDeleteFolderDialog}
        onConfirm={async (deleteContents) => {
          const target = deleteFolderDialog.folder;
          if (!target) return;
          try {
            await deleteFolder(target, deleteContents);
          } catch (err) {
            folders.setError(
              err instanceof Error
                ? t("filesPage.error.deleteFolderFailedDetail", {
                    message: err.message,
                    defaultValue: `Could not delete folder: ${err.message}`,
                  })
                : t(
                    "filesPage.error.deleteFolderFailed",
                    "Could not delete folder.",
                  ),
            );
            throw err;
          }
        }}
      />

      <DeleteFilesDialog
        opened={deleteDialogOpen}
        files={deleteDialogFiles}
        onClose={closeDeleteDialog}
        onConfirm={confirmRemoveFiles}
      />

      <RenameFileDialog
        opened={Boolean(renameTarget)}
        fileName={renameTarget?.name ?? ""}
        onClose={() => setRenameTarget(null)}
        onSubmit={handleConfirmRename}
      />

      <VersionHistoryModal
        opened={Boolean(versionHistoryFile)}
        onClose={() => setVersionHistoryFile(null)}
        file={versionHistoryFile}
        onChanged={refresh}
      />

      {/* Save-to-server modal; keyed on target so updates don't retarget. */}
      <BulkUploadToServerModal
        key={`save-${(saveToServerTarget ?? []).map((s) => s.id).join(",")}`}
        opened={Boolean(saveToServerTarget && saveToServerTarget.length > 0)}
        onClose={() => setSaveToServerTarget(null)}
        files={saveToServerTarget ?? []}
        onUploaded={refresh}
      />
    </div>
  );
}

function useFolderDropHandlers() {
  const { t } = useTranslation();
  const folders = useFolders();
  const filesPage = useFilesPage();

  const reportFailure = (err: unknown, detailKey: string, plainKey: string) => {
    folders.setError(
      err instanceof Error
        ? t(detailKey, {
            message: err.message,
            defaultValue: `Could not move: ${err.message}`,
          })
        : t(plainKey, "Could not move."),
    );
  };

  return (folderId: FolderId | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes(FILES_PAGE_DRAG_TYPE)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const payload = parseFilesPageDragPayload(e.dataTransfer);
      if (!payload) return;
      if (payload.kind === "files") {
        void filesPage.moveFilesTo(payload.fileIds, folderId).catch((err) => {
          console.error("[breadcrumb] drop failed", err);
          reportFailure(
            err,
            "filesPage.error.moveFilesFailedDetail",
            "filesPage.error.moveFilesFailed",
          );
        });
      } else if (payload.kind === "folder") {
        // Use the shared move action so ancestor drops report the cycle guard's reason.
        void filesPage.moveFolderTo(payload.folderId, folderId).catch((err) => {
          console.error("[breadcrumb] folder drop failed", err);
          reportFailure(
            err,
            "filesPage.error.moveFolderFailedDetail",
            "filesPage.error.moveFolderFailed",
          );
        });
      }
    },
  });
}

function Breadcrumbs() {
  const { t } = useTranslation();
  const folders = useFolders();
  const openFolder = useOpenFolder();
  const dropHandlers = useFolderDropHandlers();
  const trail = folders.breadcrumbs.filter(
    (entry) => entry.id !== ROOT_FOLDER_ID,
  );
  if (trail.length === 0) return null;

  // Collapse ancestors so the current folder stays visible in deep paths.
  const VISIBLE = 2;
  const split = Math.max(0, trail.length - VISIBLE);
  const hidden = trail.slice(0, split);
  const shown = trail.slice(split);

  return (
    <nav
      className="files-page-breadcrumbs"
      aria-label={t("filesPage.breadcrumbs", "Folder path")}
    >
      <Icon
        name="chevron-right"
        size={20}
        className="files-page-breadcrumb-sep"
        aria-hidden="true"
      />
      {hidden.length > 0 && (
        <>
          <Menu shadow="md" position="bottom-start" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="tertiary"
                size="sm"
                className="files-page-breadcrumb-overflow"
                aria-label={t(
                  "filesPage.breadcrumbsOverflow",
                  "Show parent folders",
                )}
              >
                <Icon name="ellipsis" size={20} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {hidden.map((entry) => (
                <Menu.Item
                  key={entry.id ?? "root"}
                  onClick={() => openFolder(entry.id)}
                >
                  {entry.name}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
          <Icon
            name="chevron-right"
            size={20}
            className="files-page-breadcrumb-sep"
            aria-hidden="true"
          />
        </>
      )}
      {shown.map((entry, idx) => {
        const isLast = idx === shown.length - 1;
        return (
          <React.Fragment key={entry.id ?? "root"}>
            <button
              type="button"
              className={`files-page-breadcrumb${isLast ? " is-current" : ""}`}
              title={entry.name}
              onClick={() => openFolder(entry.id)}
              {...dropHandlers(entry.id)}
            >
              {entry.name}
            </button>
            {!isLast && (
              <Icon
                name="chevron-right"
                size={20}
                className="files-page-breadcrumb-sep"
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
