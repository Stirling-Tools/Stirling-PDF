import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  forwardRef,
} from "react";
import { Loader, Tooltip } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { NavSurface } from "@app/ui/NavSurface";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";
import { useFileState, useFileActions } from "@app/contexts/file/fileHooks";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useGoogleDrivePicker } from "@app/hooks/useGoogleDrivePicker";
import {
  useNavigationState,
  useNavigationActions,
  useNavigationGuard,
} from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { openFilesFromDisk } from "@app/services/openFilesFromDisk";
import { useAccountIdentity } from "@app/hooks/useAccountIdentity";
import { useFreeCreditsSummary } from "@app/hooks/useFreeCreditsSummary";
import { useOpenPlan } from "@app/hooks/useOpenPlan";
import { NavFooter } from "@app/components/shared/navFooter/NavFooter";
import {
  useIndexedDB,
  useIndexedDBRevision,
} from "@app/contexts/IndexedDBContext";
import { SidebarHeader } from "@app/components/shared/SidebarHeader";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import { FileItem } from "@app/components/shared/FileSidebarFileItem";
import { useLabelName } from "@app/data/labelDisplay";
import { useClassificationEnabled } from "@app/hooks/useClassificationEnabled";
import {
  FileSidebarGroupControls,
  useFileSidebarGroups,
} from "@app/components/shared/fileSidebarGrouping";
import BulkUploadToServerModal from "@app/components/shared/BulkUploadToServerModal";
import { getFileOrigin } from "@app/components/filesPage/fileOrigin";
import { VersionHistoryModal } from "@app/components/filesPage/VersionHistoryModal";
import { DeleteFilesDialog } from "@app/components/filesPage/DeleteFilesDialog";
import { RenameFileDialog } from "@app/components/shared/RenameFileDialog";
import { duplicateStoredFile } from "@app/utils/duplicateFile";
import { SidebarChecklistSlot } from "@app/components/shared/SidebarChecklistSlot";
import { SidebarProcessingSlot } from "@app/components/shared/SidebarProcessingSlot";
import {
  deleteServerFile,
  type DeleteScope,
} from "@app/services/serverStorageDelete";
import { fileStorage, onRecordUnreadable } from "@app/services/fileStorage";
import { downloadFileWithPolicy } from "@app/services/exportWithPolicy";
import { useOpenInNewWindow } from "@app/extensions/openInNewWindow";
import { openSuperSearch } from "@app/components/shared/superSearch/openSuperSearch";
import { alert } from "@app/components/toast";
import { useBulkAddProgress } from "@app/services/bulkAddProgress";
import { useIsScrolled } from "@app/hooks/useIsScrolled";
import { usePolicyFileBadges } from "@app/hooks/usePolicyFileBadges";
import { FolderTreeSidebar } from "@app/components/filesPage/FolderTreeSidebar";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import type { FolderId, FolderRecord } from "@app/types/folder";
import { useToolEligibleFileIds } from "@app/contexts/ToolFileEligibilityContext";
import "@app/components/shared/FileSidebar.css";

// Shared with the processor sidebar via tokens, so the two cannot drift.
const SIDEBAR_WIDTH = "var(--sidebar-w)";

// Stable empty props for rows without policies, so the memoized
// FileItem isn't re-rendered by a fresh `?? []` identity on every list render.
const NO_POLICIES: never[] = [];

/** Show pre-dispatch progress only for large drops; small imports finish before it paints. */
const BULK_ADD_INDICATOR_MIN = 8;

export interface FileSidebarProps {
  onOpenSettings?: () => void;
  /** The quick nav rail owns the account control, so the footer drops its own row. */
  accountHoisted?: boolean;
  /** Override the Open-from-computer handler (e.g. upload to /files folder). */
  onUploadFiles?: (files: File[]) => void | Promise<void>;
  /** Publishes the sidebar's picker so the quick navigation rail can reuse it. */
  onRegisterOpenFromComputer?: (open: (() => void) | null) => void;
  /** Override the Google Drive handler. */
  onPickGoogleDriveFiles?: (files: File[]) => void | Promise<void>;
  /** Action rows inserted under Open-from-computer (New folder, Refresh). A
   *  control with more than one destination renders itself instead. */
  extraActions?: Array<{
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    disabledTooltip?: string;
    testId?: string;
    render?: () => React.ReactNode;
  }>;
}

/** Isolates per-file progress updates from the sidebar's file-list renders. */
function BulkAddProgressRow() {
  const { t } = useTranslation();
  const bulkAdd = useBulkAddProgress();
  if (bulkAdd.total < BULK_ADD_INDICATOR_MIN || bulkAdd.done >= bulkAdd.total) {
    return null;
  }
  return (
    <div className="file-sidebar-bulk-add" role="status" aria-live="polite">
      <div className="file-sidebar-bulk-add-label">
        <span>{t("fileSidebar.addingFiles", "Adding files…")}</span>
        <span className="file-sidebar-bulk-add-count">
          {bulkAdd.done}/{bulkAdd.total}
        </span>
      </div>
      <div className="file-sidebar-bulk-add-track">
        <div
          className="file-sidebar-bulk-add-bar"
          style={{
            width: `${Math.round((bulkAdd.done / bulkAdd.total) * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}

/** Isolates library-state subscriptions from the sidebar used by every workspace. */
function FolderTreeSection() {
  const filesPage = useFilesPage();
  return (
    <div className="file-sidebar-folders-section sidebar-content-fade">
      <FolderTreeSidebar
        fileCounts={filesPage.fileCountsByFolder}
        onRequestNewFolder={filesPage.openNewFolderDialog}
        onRenameFolder={(folder: FolderRecord) =>
          filesPage.openRenameFolderDialog(folder)
        }
        onDeleteFolder={filesPage.promptDeleteFolder}
        onMoveFilesIntoFolder={async (
          targetId: FolderId | null,
          fileIds: FileId[],
        ) => {
          if (fileIds.length === 0) return;
          await filesPage.moveFilesTo(fileIds, targetId);
        }}
      />
    </div>
  );
}

const FileSidebar = forwardRef<HTMLDivElement, FileSidebarProps>(
  function FileSidebar(
    {
      onOpenSettings,
      accountHoisted = false,
      onUploadFiles,
      onRegisterOpenFromComputer,
      onPickGoogleDriveFiles,
      extraActions,
    },
    ref,
  ) {
    const { t } = useTranslation();
    const labelName = useLabelName();
    // Classification off (non-SaaS / AI-off) → never show the per-row label chip,
    // even if a stub carries labels from an imported PDF; keeps the row plain.
    const classificationEnabled = useClassificationEnabled();
    const nativeFileInputRef = useRef<HTMLInputElement>(null);
    // State schedules the viewer transition after the file enters the workspace.
    const [pendingViewFileId, setPendingViewFileId] = useState<string | null>(
      null,
    );
    const { scrolled: fileListScrolled, scrollRef: fileListScrollRef } =
      useIsScrolled();

    const { config } = useAppConfig();
    const {
      isEnabled: isGoogleDriveEnabled,
      openPicker: openGoogleDrivePicker,
    } = useGoogleDrivePicker();
    const { state } = useFileState();
    const { actions: fileActions } = useFileActions();
    const { actions: navActions } = useNavigationActions();
    const { workbench: currentWorkbench, selectedTool } = useNavigationState();
    const policyFileBadges = usePolicyFileBadges();
    const isMultiTool =
      currentWorkbench === "pageEditor" && selectedTool === "multiTool";
    const { requestNavigation } = useNavigationGuard();
    const { activeFileId, setActiveFileId } = useViewer();
    const { addFiles } = useFileHandler();
    const indexedDB = useIndexedDB();

    const { displayName, profilePictureUrl, isAnonymous } =
      useAccountIdentity();
    const credits = useFreeCreditsSummary();
    const openPlan = useOpenPlan();

    const [allFileStubs, setAllFileStubs] = useState<StirlingFileStub[]>([]);
    // Keep unreadable records so a reload can retry their bytes.
    const [lostFileIds, setLostFileIds] = useState<ReadonlySet<string>>(
      () => new Set(),
    );
    useEffect(
      () =>
        onRecordUnreadable((fileId) =>
          setLostFileIds((prev) => new Set(prev).add(fileId)),
        ),
      [],
    );
    const [stubsLoaded, setStubsLoaded] = useState(false);
    const [saveToServerTarget, setSaveToServerTarget] = useState<
      StirlingFileStub[] | null
    >(null);
    const [versionHistoryTarget, setVersionHistoryTarget] =
      useState<StirlingFileStub | null>(null);
    // Kebab "Delete" target when the file is on the cloud; drives the
    // local/cloud/both choice dialog. Local-only files delete immediately.
    const [deleteTarget, setDeleteTarget] = useState<StirlingFileStub | null>(
      null,
    );
    const [renameTarget, setRenameTarget] = useState<StirlingFileStub | null>(
      null,
    );
    // Storage gate: only offer Save-to-cloud when the server allows it and
    // the user is signed in (guests have no cloud library).
    const storageEnabled = config?.storageEnabled === true && !isAnonymous;

    const refreshStubs = useCallback(async () => {
      // `stubsLoaded` gates the spinner, so the `finally` below must set it on
      // every path - callers never await this, so a rejection goes nowhere.
      let stubs: StirlingFileStub[] = [];
      try {
        stubs = await indexedDB.loadLeafMetadata();
      } catch (error) {
        // Carry on with the in-memory workbench files: an unreadable library
        // should cost the user their history, not the file they're working on.
        console.error("Failed to read the file library from storage:", error);
      }

      try {
        const idbIds = new Set(stubs.map((s) => s.id as string));

        const pendingStubs = state.files.ids
          .map((id) => state.files.byId[id])
          .filter(
            (stub): stub is NonNullable<typeof stub> =>
              !!stub && stub.isLeaf !== false && !idbIds.has(stub.id as string),
          );

        const allStubs = [...stubs, ...pendingStubs];
        // During a version swap, drop the superseded IDB leaf to avoid duplicate lineage keys.
        const superseded = new Set(
          allStubs.map((s) => s.parentFileId as string | undefined),
        );
        const currentStubs = allStubs.filter(
          (s) => !superseded.has(s.id as string),
        );
        setAllFileStubs(
          currentStubs.sort(
            (a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0),
          ),
        );
      } finally {
        setStubsLoaded(true);
      }
    }, [indexedDB, state.files.ids, state.files.byId]);

    // Coalesce per-file updates to avoid quadratic IDB scans during imports and processing.
    const indexedDBRevision = useIndexedDBRevision();
    const lastRefreshAt = useRef(0);
    useEffect(() => {
      const REFRESH_COALESCE_MS = 300;
      const wait = Math.max(
        0,
        lastRefreshAt.current + REFRESH_COALESCE_MS - Date.now(),
      );
      const timer = window.setTimeout(() => {
        lastRefreshAt.current = Date.now();
        void refreshStubs();
      }, wait);
      return () => window.clearTimeout(timer);
    }, [refreshStubs, indexedDBRevision]);

    // Server copies require a deletion-scope choice; local-only files delete immediately.
    const handleSidebarDelete = useCallback(
      async (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        const hasCloud =
          !!stub &&
          typeof stub.remoteStorageId === "number" &&
          stub.remoteOwnedByCurrentUser === true;
        if (hasCloud && stub) {
          setDeleteTarget(stub);
          return;
        }
        // Its superseded versions go too - see orphanedAncestorIds.
        const orphans = await fileStorage.orphanedAncestorIds([fileId]);
        await fileActions.removeFiles([fileId, ...orphans], true);
        await refreshStubs();
      },
      [allFileStubs, fileActions, refreshStubs],
    );

    const handleConfirmSidebarDelete = useCallback(
      async (scope: DeleteScope) => {
        const stub = deleteTarget;
        if (!stub) return;
        if (
          (scope === "cloud" || scope === "everywhere") &&
          typeof stub.remoteStorageId === "number" &&
          stub.remoteOwnedByCurrentUser === true
        ) {
          await deleteServerFile(stub.remoteStorageId);
        }
        if (scope === "device" || scope === "everywhere") {
          const orphans = await fileStorage.orphanedAncestorIds([stub.id]);
          await fileActions.removeFiles([stub.id, ...orphans], true);
        } else if (scope === "cloud") {
          // Local copy kept - drop the dead remote pointer so the cloud badge
          // clears (the sidebar doesn't reconcile with the server itself).
          const cleared = {
            remoteStorageId: undefined,
            remoteStorageUpdatedAt: undefined,
            remoteOwnedByCurrentUser: undefined,
            remoteSharedViaLink: false,
            remoteHasShareLinks: undefined,
          };
          fileActions.updateStirlingFileStub(stub.id, cleared);
          await fileStorage.updateFileMetadata(stub.id, cleared);
        }
        setDeleteTarget(null);
        await refreshStubs();
      },
      [deleteTarget, fileActions, refreshStubs],
    );

    const handleSaveToCloud = useCallback(
      (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        if (stub) setSaveToServerTarget([stub]);
      },
      [allFileStubs],
    );

    const handleVersionHistory = useCallback(
      (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        if (stub) setVersionHistoryTarget(stub);
      },
      [allFileStubs],
    );

    const warnDataUnavailable = useCallback(() => {
      alert({
        alertType: "warning",
        title: t("fileSidebar.dataLostTitle", "File data is unavailable"),
        body: t(
          "fileSidebar.dataLostBody",
          "This browser lost this file's contents. Upload it again to keep working with it.",
        ),
        expandable: false,
        durationMs: 6000,
      });
    }, [t]);

    // Kebab: download a copy (desktop saves via the native dialog). Routed
    // through the policy wrapper so export policies enforce here too.
    const handleDownload = useCallback(
      async (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        const file = await fileStorage.getStirlingFile(fileId);
        if (!file) {
          warnDataUnavailable();
          return;
        }
        try {
          await downloadFileWithPolicy({
            data: file,
            filename: stub?.name ?? file.name,
            fileId: fileId,
          });
        } catch (error) {
          console.error("[FileSidebar] Download failed:", error);
          alert({
            alertType: "error",
            title: t("fileSidebar.downloadFailed", "Download failed"),
            body: error instanceof Error ? error.message : String(error),
            expandable: false,
          });
        }
      },
      [allFileStubs, warnDataUnavailable, t],
    );

    const handleDuplicate = useCallback(
      async (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        if (!stub) return;
        try {
          const copyId = await duplicateStoredFile(
            stub,
            allFileStubs.map((s) => s.name),
            addFiles,
          );
          if (!copyId) {
            warnDataUnavailable();
            return;
          }
          await refreshStubs();
        } catch (error) {
          console.error("[FileSidebar] Duplicate failed:", error);
          alert({
            alertType: "error",
            title: t("fileSidebar.duplicateFailed", "Could not duplicate file"),
            body: error instanceof Error ? error.message : String(error),
            expandable: false,
          });
        }
      },
      [allFileStubs, addFiles, refreshStubs, warnDataUnavailable, t],
    );

    const handleRename = useCallback(
      (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        if (stub) setRenameTarget(stub);
      },
      [allFileStubs],
    );

    // Persist the rename before updating the open workspace copy.
    const handleConfirmRename = useCallback(
      async (name: string) => {
        const stub = renameTarget;
        if (!stub) return;
        // quickKey is name|size|lastModified; a stale one would make a re-upload
        // of the original look like a duplicate of the renamed file.
        const quickKey = `${name}|${stub.size}|${stub.lastModified}`;
        const saved = await fileStorage.updateFileMetadata(stub.id, {
          name,
          quickKey,
        });
        if (!saved) {
          throw new Error(
            t("fileSidebar.rename.error", "Could not rename the file."),
          );
        }
        fileActions.updateStirlingFileStub(stub.id, { name, quickKey });
        setRenameTarget(null);
        await refreshStubs();
      },
      [renameTarget, fileActions, refreshStubs, t],
    );

    // Desktop-only; a no-op stub on web, where this stays hidden.
    const { canOpenInNewWindow, openInNewWindow } = useOpenInNewWindow();
    const handleOpenInNewWindow = useCallback(
      (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        if (stub) openInNewWindow(stub);
      },
      [allFileStubs, openInNewWindow],
    );

    useEffect(() => {
      if (!pendingViewFileId) return;
      const isInWorkbench = state.files.ids.some(
        (id) => (id as string) === pendingViewFileId,
      );
      if (isInWorkbench) {
        setPendingViewFileId(null);
        setActiveFileId(pendingViewFileId);
        navActions.setWorkbench("viewer");
      }
    }, [pendingViewFileId, state.files.ids, setActiveFileId, navActions]);

    // SaaS groups by classification label; core returns null → one flat, recency-sorted list.
    const fileGroups = useFileSidebarGroups(allFileStubs);
    const workbenchIds = useMemo(
      () => new Set(state.files.ids.map((id) => id as string)),
      [state.files.ids],
    );
    // How many rendered stubs share each lineage — >1 means split siblings, which
    // must key by their unique leaf id rather than the shared lineage (see renderFileRow).
    const lineageCounts = useMemo(() => {
      const counts = new Map<string, number>();
      for (const s of allFileStubs) {
        const k = s.originalFileId ?? s.id;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return counts;
    }, [allFileStubs]);
    const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
    const setGroupOpenState = useCallback(
      (id: string, open: boolean) =>
        setGroupOpen((prev) => ({ ...prev, [id]: open })),
      [],
    );

    const handleGoogleDriveClick = useCallback(async () => {
      if (!isGoogleDriveEnabled) return;
      const files = await openGoogleDrivePicker({ multiple: true });
      if (files.length === 0) return;
      if (onPickGoogleDriveFiles) {
        await onPickGoogleDriveFiles(files);
        return;
      }
      await addFiles(files);
      if (!isMultiTool) {
        navActions.setWorkbench(files.length === 1 ? "viewer" : "fileEditor");
      }
    }, [
      isGoogleDriveEnabled,
      openGoogleDrivePicker,
      addFiles,
      navActions,
      isMultiTool,
      onPickGoogleDriveFiles,
    ]);

    const handleFileClick = useCallback(
      async (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        if (!stub) return;

        // Its bytes are gone; opening it can only fail. Say so instead of a
        // click that goes nowhere.
        if (stub.dataUnavailable || lostFileIds.has(fileId)) {
          alert({
            alertType: "warning",
            title: t("fileSidebar.dataLostTitle", "File data is unavailable"),
            body: t(
              "fileSidebar.dataLostBody",
              "This browser lost this file's contents. Upload it again to keep working with it.",
            ),
            expandable: false,
            durationMs: 6000,
          });
          return;
        }

        const workbenchFileId = state.files.ids.find(
          (id) => (id as string) === (stub.id as string),
        );

        if (workbenchFileId) {
          // If this is the file currently open in the viewer, route through the
          // navigation guard so the save modal fires when there are unsaved changes.
          const isCurrentlyViewed = workbenchFileId === viewedWorkbenchId;
          if (isCurrentlyViewed) {
            requestNavigation(() => {
              void fileActions.removeFiles([workbenchFileId], false);
            });
            return;
          }
          await fileActions.removeFiles([workbenchFileId], false);
        } else {
          // Re-add by stub to preserve its ID - addFiles() would create a new UUID + IDB entry.
          const workbenchCount = state.files.ids.length;

          if (workbenchCount > 0 && currentWorkbench === "viewer") {
            navActions.setWorkbench("fileEditor");
          }

          await fileActions.addStirlingFileStubs([stub]);

          if (isMultiTool) {
            fileActions.setSelectedFiles([
              ...state.ui.selectedFileIds,
              stub.id,
            ]);
          } else {
            if (workbenchCount === 0) {
              navActions.setWorkbench("viewer");
            } else {
              navActions.setWorkbench("fileEditor");
            }
          }
        }
      },
      [
        allFileStubs,
        lostFileIds,
        t,
        state.files.ids,
        state.ui.selectedFileIds,
        fileActions,
        navActions,
        currentWorkbench,
        activeFileId,
        requestNavigation,
        isMultiTool,
      ],
    );

    // Which file is currently open in the viewer - stable ID, never index-derived.
    const viewedWorkbenchId =
      currentWorkbench === "viewer" ? activeFileId : null;

    const handleEyeClick = useCallback(
      async (fileId: FileId, _e: React.MouseEvent) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        if (!stub) return;

        const isCurrentlyViewed = !!(
          viewedWorkbenchId && viewedWorkbenchId === (stub.id as string)
        );

        if (isCurrentlyViewed) {
          // Closing the currently-viewed file - guard against unsaved changes.
          navActions.setWorkbench("fileEditor");
          return;
        }

        // Switching to a different file while viewer is open - guard against unsaved changes.
        const performSwitch = async () => {
          const alreadyInWorkbench = state.files.ids.some(
            (id) => (id as string) === (stub.id as string),
          );

          if (!alreadyInWorkbench) {
            // Leave viewer before mutating workbench (prevents PSPDFKit crash).
            if (state.files.ids.length > 0 && currentWorkbench === "viewer") {
              navActions.setWorkbench("fileEditor");
            }
            await fileActions.addStirlingFileStubs([stub]);
          }

          // Route through pendingViewFileId so both setActiveFileIndex + setWorkbench fire together.
          setPendingViewFileId(stub.id);
        };

        if (currentWorkbench === "viewer" && viewedWorkbenchId) {
          requestNavigation(() => {
            void performSwitch();
          });
        } else {
          await performSwitch();
        }
      },
      [
        allFileStubs,
        viewedWorkbenchId,
        state.files.ids,
        fileActions,
        navActions,
        currentWorkbench,
        setPendingViewFileId,
        requestNavigation,
      ],
    );

    // Shared ingest path for both the native picker and drag-and-drop.
    // Per-tool validation happens downstream.
    const ingestFiles = useCallback(
      async (files: File[]) => {
        if (files.length === 0) return;
        if (onUploadFiles) {
          await onUploadFiles(files);
        } else {
          await addFiles(files);
          // A tool that pinned its own workbench surface owns it - switching to
          // the viewer here strands the upload outside the tool being used.
          if (!isMultiTool && !currentWorkbench.startsWith("custom:")) {
            navActions.setWorkbench(
              files.length === 1 ? "viewer" : "fileEditor",
            );
          }
        }
      },
      [addFiles, navActions, isMultiTool, onUploadFiles, currentWorkbench],
    );

    const handleNativeFilePick = useCallback(
      async (e: React.ChangeEvent<HTMLInputElement>) => {
        await ingestFiles(Array.from(e.target.files ?? []));
        e.target.value = "";
      },
      [ingestFiles],
    );

    const openNativeFilePicker = useCallback(() => {
      void openFilesFromDisk({
        onFallbackOpen: () => nativeFileInputRef.current?.click(),
      })
        .then(ingestFiles)
        .catch((err) => {
          console.error("[FileSidebar] Native file pick failed", err);
          alert({
            alertType: "error",
            title: t("fileSidebar.uploadFailedTitle", "Upload failed"),
            body:
              err instanceof Error
                ? err.message
                : t(
                    "fileSidebar.uploadFailedBody",
                    "Could not add the selected files.",
                  ),
            isPersistentPopup: false,
          });
        });
    }, [ingestFiles, t]);

    useEffect(() => {
      if (!onRegisterOpenFromComputer) return;
      onRegisterOpenFromComputer(openNativeFilePicker);
      return () => onRegisterOpenFromComputer(null);
    }, [onRegisterOpenFromComputer, openNativeFilePicker]);

    // Internal folder drags have their own payloads and must bypass file ingestion.
    const [isFileDragOver, setIsFileDragOver] = useState(false);
    const dragDepth = useRef(0);

    const isNativeFileDrag = (e: React.DragEvent) =>
      Array.from(e.dataTransfer.types).includes("Files");

    const handleDragEnter = useCallback((e: React.DragEvent) => {
      if (!isNativeFileDrag(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setIsFileDragOver(true);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      if (!isNativeFileDrag(e)) return;
      // Required so the browser fires `drop` rather than opening the file.
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      if (!isNativeFileDrag(e)) return;
      // dragenter/leave fire per child element; the counter keeps the overlay
      // stable until the cursor genuinely leaves the sidebar.
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) {
        dragDepth.current = 0;
        setIsFileDragOver(false);
      }
    }, []);

    const handleDrop = useCallback(
      async (e: React.DragEvent) => {
        if (!isNativeFileDrag(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setIsFileDragOver(false);
        await ingestFiles(Array.from(e.dataTransfer.files ?? []));
      },
      [ingestFiles],
    );

    const eligibleFileIds = useToolEligibleFileIds();

    const renderFileRow = (stub: StirlingFileStub) => {
      const isInWorkbench = workbenchIds.has(stub.id);
      const workbenchFileId = isInWorkbench ? stub.id : undefined;
      const isViewedInViewer = !!(
        viewedWorkbenchId && viewedWorkbenchId === (stub.id as string)
      );
      const isActive = isViewedInViewer;
      const isEncryptedFile = stub.processedFile?.isEncrypted === true;
      const thumbnailUrl = isEncryptedFile
        ? undefined
        : (workbenchFileId
            ? state.files.byId[workbenchFileId]?.thumbnailUrl
            : undefined) || stub.thumbnailUrl;
      const fileOrigin = getFileOrigin(stub);
      const dataUnavailable =
        stub.dataUnavailable === true || lostFileIds.has(stub.id);
      // Lineage keys preserve rows across version changes; split siblings need unique leaf IDs.
      const lineageKey = stub.originalFileId ?? stub.id;
      const rowKey =
        (lineageCounts.get(lineageKey) ?? 0) > 1
          ? (stub.id as string)
          : lineageKey;
      return (
        <FileItem
          isToolSkipped={
            isInWorkbench &&
            eligibleFileIds !== null &&
            !eligibleFileIds.has(stub.id)
          }
          key={rowKey}
          fileId={stub.id}
          name={stub.name}
          size={stub.size}
          lastModified={stub.lastModified}
          isSelected={isInWorkbench}
          isActive={isActive}
          isViewedInViewer={isViewedInViewer}
          thumbnailUrl={thumbnailUrl}
          onClick={handleFileClick}
          onEyeClick={handleEyeClick}
          dataUnavailable={dataUnavailable}
          policies={policyFileBadges.get(stub.id) ?? NO_POLICIES}
          onDelete={handleSidebarDelete}
          onDownload={handleDownload}
          onRename={handleRename}
          onDuplicate={handleDuplicate}
          onOpenInNewWindow={
            canOpenInNewWindow(stub) ? handleOpenInNewWindow : undefined
          }
          onSaveToCloud={handleSaveToCloud}
          canSaveToCloud={storageEnabled && fileOrigin !== "shared-with-me"}
          isUploadedToCloud={fileOrigin === "cloud"}
          onVersionHistory={handleVersionHistory}
          hasVersionHistory={(stub.versionNumber ?? 1) > 1}
          primaryLabel={
            classificationEnabled && stub.classificationLabels?.[0]
              ? labelName(stub.classificationLabels[0])
              : undefined
          }
        />
      );
    };

    const sidebarActions: NonNullable<FileSidebarProps["extraActions"]> = [
      ...(currentWorkbench === "myFiles"
        ? [
            {
              icon: <Icon name="plus" />,
              label: t("fileSidebar.addFiles", "Add files"),
              onClick: openNativeFilePicker,
              testId: "pdf-library-add-files",
            },
            ...(isGoogleDriveEnabled
              ? [
                  {
                    icon: <Icon name="googledrive" />,
                    label: t(
                      "fileSidebar.googleDrive",
                      "Open from Google Drive",
                    ),
                    onClick: () => void handleGoogleDriveClick(),
                    testId: "google-drive-button",
                  },
                ]
              : []),
          ]
        : []),
      ...(extraActions ?? []),
    ];

    const importActions = (
      <>
        {isGoogleDriveEnabled && (
          <ActionIcon
            variant="quiet"
            className="file-sidebar-section-btn file-sidebar-section-btn-drive"
            onClick={handleGoogleDriveClick}
            title={t("fileSidebar.googleDrive", "Open from Google Drive")}
            aria-label={t("fileSidebar.googleDrive", "Open from Google Drive")}
            data-testid="google-drive-button"
          >
            <Icon name="googledrive" size={16} />
          </ActionIcon>
        )}
        <ActionIcon
          variant="quiet"
          className="file-sidebar-section-btn file-sidebar-section-btn-add"
          data-testid="pdf-library-add-files"
          onClick={openNativeFilePicker}
          title={t("fileSidebar.addFiles", "Add files")}
          aria-label={t("fileSidebar.addFiles", "Add files")}
        >
          <Icon name="plus" size={"1rem"} />
        </ActionIcon>
      </>
    );

    return (
      <div
        ref={ref}
        className="file-sidebar"
        style={{
          width: SIDEBAR_WIDTH,
          minWidth: SIDEBAR_WIDTH,
          maxWidth: SIDEBAR_WIDTH,
        }}
        data-sidebar="file-sidebar"
        data-tour="quick-access-bar"
        data-file-drag-over={isFileDragOver || undefined}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isFileDragOver && (
          <div className="file-sidebar-drop-overlay" aria-hidden="true">
            <Icon name="file-up" className="file-sidebar-drop-overlay-icon" />
            <span className="file-sidebar-drop-overlay-text">
              {t("fileSidebar.dropToAdd", "Drop files to add")}
            </span>
          </div>
        )}
        <div className="file-sidebar-inner">
          <SidebarHeader />

          <input
            ref={nativeFileInputRef}
            type="file"
            multiple
            // The global workspace accepts all formats for conversion, merging and extraction.
            style={{ display: "none" }}
            onChange={handleNativeFilePick}
            data-testid="file-input"
          />

          <NavSurface
            className="file-sidebar-controls"
            hidden={sidebarActions.length === 0}
          >
            {sidebarActions.map((action) => (
              <React.Fragment key={action.label}>
                {action.render ? (
                  action.render()
                ) : (
                  <Tooltip
                    label={action.disabledTooltip ?? action.label}
                    position="right"
                    withinPortal
                    multiline={Boolean(
                      action.disabled && action.disabledTooltip,
                    )}
                    w={
                      action.disabled && action.disabledTooltip
                        ? 220
                        : undefined
                    }
                    // The tooltip explains why an already-labelled action is disabled.
                    disabled={!(action.disabled && action.disabledTooltip)}
                  >
                    <div
                      className={`file-sidebar-action-row${action.disabled ? " disabled" : ""}`}
                      data-testid={action.testId}
                      onClick={() => {
                        if (action.disabled) return;
                        action.onClick();
                      }}
                      role="button"
                      tabIndex={action.disabled ? -1 : 0}
                      aria-disabled={action.disabled}
                      aria-label={action.label}
                      onKeyDown={(e) => {
                        if (action.disabled) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          action.onClick();
                        }
                      }}
                    >
                      <span className="file-sidebar-action-icon">
                        {action.icon}
                      </span>
                      <span className="file-sidebar-action-label sidebar-content-fade">
                        {action.label}
                      </span>
                    </div>
                  </Tooltip>
                )}
              </React.Fragment>
            ))}
          </NavSurface>

          <NavSurface className="file-sidebar-files-box">
            <div className="file-sidebar-scroll">
              {currentWorkbench === "myFiles" && <FolderTreeSection />}

              {currentWorkbench !== "myFiles" && (
                <div className="file-sidebar-files-section sidebar-content-fade">
                  <div
                    className="file-sidebar-section-header"
                    data-scrolled={fileListScrolled || undefined}
                  >
                    <span className="file-sidebar-section-label">
                      {t("fileSidebar.library", "PDF Library")}
                    </span>
                    <FileSidebarGroupControls stubs={allFileStubs} />
                    <ActionIcon
                      variant="quiet"
                      className="file-sidebar-section-btn file-sidebar-section-btn-external"
                      onClick={() => navActions.setWorkbench("myFiles")}
                      title={t(
                        "fileSidebar.openFileManager",
                        "Browse all files & folders",
                      )}
                      aria-label={t(
                        "fileSidebar.openFileManager",
                        "Browse all files & folders",
                      )}
                      data-testid="open-files-page"
                    >
                      <Icon name="maximize-2" size={"1rem"} />
                    </ActionIcon>
                    <ActionIcon
                      variant="quiet"
                      className="file-sidebar-section-btn file-sidebar-section-btn-search"
                      onClick={() => openSuperSearch(["files"])}
                      title={t("fileSidebar.searchFiles", "Search files")}
                      aria-label={t("fileSidebar.searchFiles", "Search files")}
                      data-testid="file-sidebar-search"
                    >
                      <Icon name="search" size={"1rem"} />
                    </ActionIcon>
                    {importActions}
                  </div>

                  <BulkAddProgressRow />

                  {!stubsLoaded ? (
                    <div className="file-sidebar-loading">
                      <Loader size="sm" color="var(--c-text-subtle)" />
                    </div>
                  ) : allFileStubs.length > 0 ? (
                    <div
                      className="file-sidebar-file-list"
                      ref={fileListScrollRef}
                    >
                      {fileGroups ? (
                        <>
                          {fileGroups.map((group) => {
                            const isOpen =
                              groupOpen[group.id] ?? group.defaultExpanded;
                            return (
                              <div
                                className="file-sidebar-group"
                                key={group.id}
                              >
                                <Button
                                  variant="quiet"
                                  fullWidth
                                  justify="between"
                                  className="file-sidebar-group-header"
                                  onClick={() =>
                                    setGroupOpenState(group.id, !isOpen)
                                  }
                                  aria-expanded={isOpen}
                                  leftSection={
                                    <span
                                      className="file-sidebar-group-symbol"
                                      data-has-icon={!!group.icon}
                                      aria-hidden="true"
                                    >
                                      {group.icon && (
                                        <Icon
                                          name={group.icon}
                                          size="1.05rem"
                                          className="file-sidebar-group-icon"
                                          style={
                                            group.color
                                              ? { color: group.color }
                                              : undefined
                                          }
                                        />
                                      )}
                                      <Icon
                                        name={
                                          isOpen
                                            ? "chevron-down"
                                            : "chevron-right"
                                        }
                                        size="1.1rem"
                                        className="file-sidebar-group-disclosure"
                                      />
                                    </span>
                                  }
                                  rightSection={
                                    <span className="file-sidebar-group-count">
                                      {group.stubs.length}
                                    </span>
                                  }
                                >
                                  <span className="file-sidebar-group-label">
                                    {group.label}
                                  </span>
                                </Button>
                                <div className="file-sidebar-group-items">
                                  {isOpen && group.stubs.map(renderFileRow)}
                                </div>
                              </div>
                            );
                          })}
                          <Button
                            variant="quiet"
                            fullWidth
                            justify="between"
                            className="file-sidebar-view-all"
                            onClick={() => navActions.setWorkbench("myFiles")}
                            rightSection={
                              <Icon name="chevron-right" size={"1rem"} />
                            }
                          >
                            {t(
                              "fileSidebar.viewAll",
                              "View all {{count}} files",
                              {
                                count: allFileStubs.length,
                              },
                            )}
                          </Button>
                        </>
                      ) : (
                        allFileStubs.map(renderFileRow)
                      )}
                    </div>
                  ) : (
                    <div className="file-sidebar-empty">
                      <p className="file-sidebar-empty-text">
                        {t("fileSidebar.noFiles", "No files yet")}
                      </p>
                      <p className="file-sidebar-empty-hint">
                        {t("fileSidebar.dropHint", "Open files to get started")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </NavSurface>

          <SidebarProcessingSlot />
        </div>

        <BulkUploadToServerModal
          opened={Boolean(saveToServerTarget && saveToServerTarget.length > 0)}
          onClose={() => setSaveToServerTarget(null)}
          files={saveToServerTarget ?? []}
          onUploaded={refreshStubs}
        />

        <VersionHistoryModal
          opened={Boolean(versionHistoryTarget)}
          onClose={() => setVersionHistoryTarget(null)}
          file={versionHistoryTarget}
          onChanged={refreshStubs}
        />

        <RenameFileDialog
          opened={Boolean(renameTarget)}
          fileName={renameTarget?.name ?? ""}
          onClose={() => setRenameTarget(null)}
          onSubmit={handleConfirmRename}
        />

        <DeleteFilesDialog
          opened={Boolean(deleteTarget)}
          files={deleteTarget ? [deleteTarget] : []}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmSidebarDelete}
        />

        {/* Getting-started checklist, floating above the footer (SaaS only). */}
        <SidebarChecklistSlot />

        <NavFooter
          className="file-sidebar-footer-box"
          displayName={displayName}
          profilePictureUrl={profilePictureUrl}
          onOpenSettings={onOpenSettings}
          showAccount={!accountHoisted}
          credits={credits}
          onOpenPlan={openPlan ?? undefined}
        />
      </div>
    );
  },
);

export default FileSidebar;
