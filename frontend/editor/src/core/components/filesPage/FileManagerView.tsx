import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ActionIcon,
  Button,
  Drawer,
  Group,
  MultiSelect,
  SegmentedControl,
  Select,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import GridViewIcon from "@mui/icons-material/GridView";
import ViewListIcon from "@mui/icons-material/ViewList";
import DeleteIcon from "@mui/icons-material/Delete";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import RefreshIcon from "@mui/icons-material/Refresh";

import { stripBasePath } from "@app/constants/app";
import { useAuth } from "@app/auth/UseSession";
import { useSharingEnabled } from "@app/hooks/useSharingEnabled";
import { useFolders } from "@app/contexts/FolderContext";
import { useFileActions } from "@app/contexts/file/fileHooks";
import { useAllFiles } from "@app/contexts/FileContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import {
  useNavigationActions,
  useNavigationGuard,
} from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";
import {
  FILES_PAGE_VIEW_MODES,
  FilesPageOriginFilter,
  FilesPageSortMode,
  useFilesPage,
} from "@app/contexts/FilesPageContext";
import { getFileOrigin } from "@app/components/filesPage/fileOrigin";

import { FileId } from "@app/types/file";
import { StirlingFileStub } from "@app/types/fileContext";
import { FolderId, ROOT_FOLDER_ID } from "@app/types/folder";

import { FileGrid, FilesPageEntry } from "@app/components/filesPage/FileGrid";
import { FileDetailsPanel } from "@app/components/filesPage/FileDetailsPanel";
import BulkUploadToServerModal from "@app/components/shared/BulkUploadToServerModal";
import MobileUploadModal from "@app/components/shared/MobileUploadModal";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { MoveToFolderDialog } from "@app/components/filesPage/MoveToFolderDialog";
import { FolderNameDialog } from "@app/components/filesPage/FolderNameDialog";
import { DeleteFolderDialog } from "@app/components/filesPage/DeleteFolderDialog";
import { DeleteFilesDialog } from "@app/components/filesPage/DeleteFilesDialog";
import { VersionHistoryModal } from "@app/components/filesPage/VersionHistoryModal";
import { materializeServerStubs } from "@app/services/fileSyncService";
import {
  FILES_PAGE_DRAG_TYPE,
  parseFilesPageDragPayload,
} from "@app/components/filesPage/dragDrop";
import { clearFilesPageReturnRoute } from "@app/components/filesPage/filesPageReturnRoute";
import "@app/components/filesPage/FilesPage.css";

export default function FileManagerView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  // Hide Shared tab when storageSharingEnabled is false.
  const { sharingEnabled } = useSharingEnabled();

  // ≤800px hosts the details panel in a button-triggered Drawer.
  const isCompactDetailsViewport = useMediaQuery("(max-width: 800px)") ?? false;
  // Phones get a full-screen drawer; tablets get a smaller one.
  const useFullScreenDrawer = useMediaQuery("(max-width: 640px)") ?? false;
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  // Save-to-server modal target. Bulk button uses local-only selection;
  // per-file kebab uses [file]. Targets root; folder placement is via drop.
  const [saveToServerTarget, setSaveToServerTarget] = useState<
    StirlingFileStub[] | null
  >(null);
  // Version-history modal target (opened from the card kebab).
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
  const isMobileUploadAvailable =
    Boolean(appConfig?.enableMobileScanner) && !isMobile;
  // Guests (anonymous sessions) have no server-side storage, so every cloud
  // action is account-only. Rather than let the click fire a guaranteed 401
  // (which surfaced as an error toast), we disable the control and explain why
  // on hover - the same affordance the storage-disabled / wrong-tab gates use.
  const { isAnonymous } = useAuth();
  const signInRequiredReason = isAnonymous
    ? t("filesPage.signInRequired", "Sign in to use cloud storage.")
    : null;
  // Server storage gate; mirrors ConfigController's storageEnabled
  // (enableLogin && storage.isEnabled). When off, Save-to-server stays
  // visible but disabled with an explanatory tooltip (discoverability beats
  // hiding - mirrors the New folder / Manage sharing gates in this view).
  const uploadEnabled = appConfig?.storageEnabled === true;
  const saveToServerDisabledReason: string | null =
    signInRequiredReason ??
    (uploadEnabled
      ? null
      : t(
          "filesPage.saveToServerDisabledHint",
          "Saving to the server isn't enabled on this server. Ask your admin to enable it.",
        ));
  const [mobileUploadModalOpen, setMobileUploadModalOpen] = useState(false);
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

  // Resolve queued delete ids into stubs for the DeleteFilesDialog.
  const deleteDialogFiles = useMemo(
    () =>
      deleteDialogFileIds
        .map((id) => fileMap.get(id))
        .filter((s): s is StirlingFileStub => Boolean(s)),
    [deleteDialogFileIds, fileMap],
  );

  const setCurrentFolderId = folders.setCurrentFolderId;
  const foldersById = folders.foldersById;
  const currentFolderId = folders.currentFolderId;

  // Sync the URL into FolderContext.
  useEffect(() => {
    const match = location.pathname.match(/^\/files\/([^/]+)/);
    const param = match?.[1] ?? null;
    if (param === null) {
      setCurrentFolderId(ROOT_FOLDER_ID);
    } else if (foldersById.has(param as FolderId)) {
      setCurrentFolderId(param as FolderId);
    } else {
      setCurrentFolderId(ROOT_FOLDER_ID);
    }
  }, [location.pathname, foldersById, setCurrentFolderId]);

  // Bounce off any share-related tab when sharing isn't enabled.
  useEffect(() => {
    if (
      !sharingEnabled &&
      (currentTab === "shared" || currentTab === "sharedByMe")
    ) {
      setCurrentTab("all");
    }
  }, [sharingEnabled, currentTab, setCurrentTab]);

  // Push folder selection into the URL while still on /files.
  useEffect(() => {
    const stripped = stripBasePath(window.location.pathname);
    if (!stripped.startsWith("/files")) return;
    const target =
      currentFolderId === null ? "/files" : `/files/${currentFolderId}`;
    if (stripped !== target) {
      navigate(target, { replace: true });
    }
  }, [currentFolderId, navigate]);

  // ─── visible items (current folder + sort + search) ─────────────────────

  /** currentFolderId + all descendants. Includes `null` when at root. */
  const subtreeFolderIds = useMemo(() => {
    const set = new Set<FolderId | null>();
    set.add(currentFolderId);
    const childMap = new Map<FolderId | null, FolderId[]>();
    for (const f of folders.folders) {
      const list = childMap.get(f.parentFolderId) ?? [];
      list.push(f.id);
      childMap.set(f.parentFolderId, list);
    }
    // Iterative DFS to avoid stack overflow on deep chains.
    const stack: (FolderId | null)[] = [currentFolderId];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const childId of childMap.get(cur) ?? []) {
        if (set.has(childId)) continue;
        set.add(childId);
        stack.push(childId);
      }
    }
    return set;
  }, [folders.folders, currentFolderId]);

  const visibleFolders = useMemo(() => {
    // Folders only appear in cloud-rooted tabs.
    if (
      currentTab === "local" ||
      currentTab === "recent" ||
      currentTab === "shared" ||
      currentTab === "sharedByMe"
    ) {
      return [];
    }
    const lc = search.toLowerCase();
    const matched = folders.folders.filter((f) => {
      if (search) {
        // Subtree-wide name match; exclude the current folder itself.
        return (
          f.id !== currentFolderId &&
          subtreeFolderIds.has(f.parentFolderId) &&
          f.name.toLowerCase().includes(lc)
        );
      }
      // Direct children only.
      return f.parentFolderId === currentFolderId;
    });
    return matched.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [folders.folders, currentFolderId, search, currentTab, subtreeFolderIds]);

  // Files in current folder, pre-filter. Drives the type-filter dropdown.
  const filesInCurrentFolder = useMemo(() => {
    // Tab overrides folder navigation for Local/Recent/Shared.
    switch (currentTab) {
      case "local":
        // Local = files with no server copy. folderId is forced null on this
        // path (cf. file.ts comment), but we check remoteStorageId too so
        // stale local-folder rows from a pre-pivot DB don't slip through.
        return allFiles.filter((f) => f.remoteStorageId == null);
      case "cloud":
        // Cloud bucket; search widens to subtree, else direct-folder match.
        return allFiles.filter((f) => {
          if (f.remoteStorageId == null) return false;
          if (search) return subtreeFolderIds.has(f.folderId ?? null);
          return (f.folderId ?? null) === (currentFolderId ?? null);
        });
      case "recent": {
        // Last 50 modified across local + cloud, folder context ignored.
        const sorted = [...allFiles].sort(
          (a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0),
        );
        return sorted.slice(0, 50);
      }
      case "shared":
        return allFiles.filter((f) => f.remoteOwnedByCurrentUser === false);
      case "sharedByMe":
        // Files I own that I've shared in any way - either with a public link
        // or with a specific user. (Previously split across two visually
        // identical tabs; merged here so the same idea lives in one place.)
        return allFiles.filter(
          (f) =>
            f.remoteOwnedByCurrentUser !== false &&
            (f.remoteHasShareLinks === true || f.remoteHasUserShares === true),
        );
      case "all":
      default:
        // Search widens to the subtree.
        // Files with a dangling folderId (folder deleted, or stale local IDB
        // row) fall back to root so they aren't permanently invisible.
        return allFiles.filter((f) => {
          const rawFolder = f.folderId ?? null;
          const effectiveFolder =
            rawFolder !== null && !foldersById.has(rawFolder)
              ? null
              : rawFolder;
          if (search) return subtreeFolderIds.has(effectiveFolder);
          return effectiveFolder === (currentFolderId ?? null);
        });
    }
  }, [
    allFiles,
    currentFolderId,
    currentTab,
    search,
    subtreeFolderIds,
    foldersById,
  ]);

  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    for (const f of filesInCurrentFolder) {
      const ext = (f.name.split(".").pop() ?? "").toUpperCase();
      if (ext) set.add(ext);
    }
    return Array.from(set).sort();
  }, [filesInCurrentFolder]);

  // Drop any active type filters that no longer appear in this folder
  // (e.g. when the user navigates between folders).
  useEffect(() => {
    if (typeFilter.length === 0) return;
    const stillValid = typeFilter.filter((t) => availableTypes.includes(t));
    if (stillValid.length !== typeFilter.length) {
      setTypeFilter(stillValid);
    }
  }, [availableTypes, typeFilter, setTypeFilter]);

  const visibleFiles = useMemo(() => {
    const filtered = filesInCurrentFolder
      .filter((f) =>
        search ? f.name.toLowerCase().includes(search.toLowerCase()) : true,
      )
      .filter((f) =>
        originFilter === "all" ? true : getFileOrigin(f) === originFilter,
      )
      .filter((f) => {
        if (typeFilter.length === 0) return true;
        const ext = (f.name.split(".").pop() ?? "").toUpperCase();
        return typeFilter.includes(ext);
      });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortMode) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "modified-asc":
          return (a.lastModified ?? 0) - (b.lastModified ?? 0);
        case "size-desc":
          return (b.size ?? 0) - (a.size ?? 0);
        case "size-asc":
          return (a.size ?? 0) - (b.size ?? 0);
        case "modified-desc":
        default:
          return (b.lastModified ?? 0) - (a.lastModified ?? 0);
      }
    });
    return sorted;
  }, [filesInCurrentFolder, search, sortMode, originFilter, typeFilter]);

  /**
   * Resolve a folder id to its breadcrumb path (e.g. "Receipts / 2024 / Q1").
   * Returns empty string for root / unknown. Used for the search-result
   * "where does this live?" subtitle.
   */
  const pathForFolderId = useCallback(
    (folderId: FolderId | null | undefined): string => {
      if (folderId == null) return "";
      const parts: string[] = [];
      let cursor: FolderId | null = folderId;
      const seen = new Set<FolderId>();
      while (cursor !== null) {
        if (seen.has(cursor)) break;
        seen.add(cursor);
        const f = foldersById.get(cursor);
        if (!f) break;
        parts.unshift(f.name);
        cursor = f.parentFolderId;
      }
      return parts.join(" / ");
    },
    [foldersById],
  );

  const entries = useMemo<FilesPageEntry[]>(() => {
    // When searching, items may come from anywhere in the subtree, so we
    // expose a "parentPath" subtitle whenever the item's parent differs from
    // currentFolderId. When no search is active, every item is in the
    // current folder by definition and the subtitle is suppressed.
    const inSearch = search.length > 0;
    return [
      ...visibleFolders.map<FilesPageEntry>((folder) => ({
        kind: "folder",
        folder,
        folderFileCount: filesPage.fileCountsByFolder.get(folder.id) ?? 0,
        parentPath:
          inSearch && folder.parentFolderId !== currentFolderId
            ? pathForFolderId(folder.parentFolderId) || undefined
            : undefined,
      })),
      ...visibleFiles.map<FilesPageEntry>((file) => ({
        kind: "file",
        file,
        parentPath:
          inSearch && (file.folderId ?? null) !== (currentFolderId ?? null)
            ? pathForFolderId(file.folderId ?? null) || undefined
            : undefined,
      })),
    ];
  }, [
    visibleFolders,
    visibleFiles,
    filesPage.fileCountsByFolder,
    search,
    currentFolderId,
    pathForFolderId,
  ]);

  // ─── selection ──────────────────────────────────────────────────────────
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
              next.add(visibleFiles[i]!.id);
            }
            return next;
          }
        }
        // Once the user has 2+ files selected they're explicitly in
        // multi-select mode (they checked a box, or shift-range'd, or
        // ctrl-clicked) - in that mode plain clicks toggle add/remove
        // instead of collapsing the whole selection back to one file.
        // This is the Google Drive pattern: the "selection mode" sticks
        // until the user explicitly exits via the X clear button or by
        // clicking the empty background of the grid.
        const inMultiSelectMode = prev.size >= 2;
        if (ctrl || inMultiSelectMode) {
          if (next.has(fileId)) next.delete(fileId);
          else next.add(fileId);
        } else {
          // 0 or 1 selected: plain click replaces (Finder/Explorer
          // behaviour). Clicking the already-only-selected file
          // deselects it, so single-file selection still toggles.
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

  // Background click on the content area clears the selection.
  const handleContentBackgroundClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only react when the click target is the scroll container itself
      // (not a card, row, or drop overlay).
      if (e.target === e.currentTarget) {
        clearSelection();
      }
    },
    [clearSelection],
  );

  // ─── upload (drag-from-desktop or button) ───────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingExternal, setIsDraggingExternal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleNativeUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      // skipWorkspaceDispatch: the user is in the file manager, not opening
      // files for work. Persist to IDB so the file appears in the grid (via
      // FilesPageContext's independent IDB scan) but DON'T pollute workspace
      // state - otherwise the file pops up the next time the user navigates
      // to /viewer or /tools, which reads as "auto-opened" and surprised
      // people every time. The grid will repaint via refresh() below.
      const added = await addFiles(files, {
        selectFiles: false,
        skipWorkspaceDispatch: true,
      });
      const fileIds = added.map((f) => f.fileId);
      const target = currentFolderId;
      // Uploaded files land in Local (folderId stays null).
      if (
        target !== null &&
        fileIds.length > 0 &&
        (currentTab === "all" || currentTab === "cloud")
      ) {
        folders.setError(
          t(
            "filesPage.uploadedToLocal",
            "Uploaded files start in Local. Use 'Save to cloud' to put them in a folder.",
          ),
        );
      }
      await refresh();
    },
    [addFiles, currentFolderId, currentTab, folders, refresh, t],
  );

  const onFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (list.length === 0) return;
      await handleNativeUpload(list);
    },
    [handleNativeUpload],
  );

  // ─── add to workspace ───────────────────────────────────────────────────
  const openFilesInWorkbench = useCallback(
    async (fileIds: FileId[]) => {
      const stubs = fileIds
        .map((id) => fileMap.get(id))
        .filter((s): s is StirlingFileStub => Boolean(s));
      if (stubs.length === 0) return;

      const proceed = async () => {
        clearFilesPageReturnRoute();

        // Server-only stubs have no bytes in IDB; download + ingest first.
        const materialized = await materializeServerStubs(stubs, {
          addFiles: fileActions.addFilesWithOptions,
          updateStub: fileActions.updateStirlingFileStub,
        });
        if (materialized.length !== stubs.length) {
          // At least one server download failed; refresh so the grid
          // reflects any successful ingests and the user can retry.
          await refresh();
          return;
        }

        await fileActions.addStirlingFileStubs(materialized, {
          selectFiles: false,
        });
        // Branch on requested stubs so already-active files still activate.
        if (materialized.length === 1) {
          setActiveFileId(materialized[0]!.id);
          navActions.setWorkbench("viewer");
        } else if (materialized.length > 1) {
          navActions.setWorkbench("fileEditor");
        }
        navigate("/");
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
    ],
  );

  const handleAddToWorkspace = useCallback(
    (fileIds: FileId[]) => openFilesInWorkbench(fileIds),
    [openFilesInWorkbench],
  );

  const handleOpenFile = useCallback(
    (file: StirlingFileStub) => {
      // Double-click commits to workspace.
      void handleAddToWorkspace([file.id]);
    },
    [handleAddToWorkspace],
  );

  const handleOpenFolder = useCallback(
    (id: FolderId) => {
      folders.setCurrentFolderId(id);
      clearSelection();
    },
    [folders, clearSelection],
  );

  // ─── full-page drag-and-drop for OS uploads ─────────────────────────────
  const dropZoneRef = useRef<HTMLDivElement>(null);
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
      const dropped = Array.from(e.dataTransfer?.files ?? []);
      if (dropped.length > 0) {
        handleNativeUpload(dropped).catch((err) =>
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
      }
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
  }, [handleNativeUpload]);

  // ─── close / exit ───────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    // Drop the return-route hint so the workbench doesn't show a stale back.
    clearFilesPageReturnRoute();
    navigate("/");
  }, [navigate]);

  // ─── keyboard shortcuts ─────────────────────────────────────────────────
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // External focus trigger (used by the FileSidebar rail Search button).
  useEffect(() => {
    const onFocus = () => searchInputRef.current?.focus();
    window.addEventListener("files-page:focus-search", onFocus);
    return () => window.removeEventListener("files-page:focus-search", onFocus);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const inInput =
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable);

      // Cmd/Ctrl + A - select every visible file in the current folder.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !inInput) {
        e.preventDefault();
        setSelectedFileIds(new Set(visibleFiles.map((f) => f.id)));
        return;
      }

      // Delete / Backspace - remove selected files.
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

      // "/" focuses the search field.
      if (e.key === "/" && !inInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visibleFiles, selectedFileIds, removeFiles, setSelectedFileIds]);

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
      // Esc-once cancels selection before closing the workbench.
      if (selectedFileIds.size > 0) {
        clearSelection();
        return;
      }
      handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose, selectedFileIds, clearSelection]);

  // ─── remove via context wrapper (clears selection state too) ────────────
  const handleRemoveFiles = useCallback(
    async (fileIds: FileId[]) => {
      await removeFiles(fileIds);
    },
    [removeFiles],
  );

  // ─── derived UI bits ────────────────────────────────────────────────────
  const currentFolderRecord = currentFolderId
    ? (foldersById.get(currentFolderId) ?? null)
    : null;
  const totalCount = entries.length;
  const selectedFiles = useMemo(
    () => Array.from(selectedFileIds),
    [selectedFileIds],
  );

  // Local-only subset of selection; drives Save-to-server visibility.
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

  // null = New folder actionable; string = disabled tooltip reason.
  const newFolderDisabledReason: string | null = useMemo(() => {
    // Guests can't use cloud folders at all - say so before any tab/storage
    // hint, since switching tabs wouldn't help them.
    if (signInRequiredReason) {
      return signInRequiredReason;
    }
    if (currentTab === "local") {
      return t(
        "filesPage.localFoldersUnavailable",
        "Folders are cloud-only - save a file to the cloud to organise it.",
      );
    }
    if (
      currentTab === "recent" ||
      currentTab === "shared" ||
      currentTab === "sharedByMe"
    ) {
      return t(
        "filesPage.newFolderTabUnavailable",
        "Switch to All or Cloud to create folders.",
      );
    }
    if (!folders.serverReachable) {
      return t(
        "filesPage.newFolderStorageDisabled",
        "Server folder storage isn't enabled. Ask your admin to turn it on.",
      );
    }
    return null;
  }, [signInRequiredReason, currentTab, folders.serverReachable, t]);

  return (
    <div className="files-page" ref={dropZoneRef}>
      <header className="files-page-header">
        {/* Breadcrumb only for folder-rooted tabs. */}
        {(currentTab === "all" || currentTab === "cloud") && <Breadcrumbs />}
        {(currentTab === "local" ||
          currentTab === "recent" ||
          currentTab === "shared" ||
          currentTab === "sharedByMe") && (
          <div
            style={{
              fontSize: "0.95rem",
              fontWeight: 600,
              padding: "0.25rem 0.5rem",
              color: "var(--text-primary)",
            }}
          >
            {currentTab === "local"
              ? t("filesPage.tabName.local", "Local")
              : currentTab === "recent"
                ? t("filesPage.tabName.recent", "Recent")
                : currentTab === "shared"
                  ? t("filesPage.tabName.shared", "Shared with me")
                  : t("filesPage.tabName.sharedByMe", "Shared by me")}
          </div>
        )}
        {(() => {
          // Both the inline desktop buttons and the mobile kebab menu need
          // these handlers - extract once so we don't drift two copies.
          const handleRefresh = async () => {
            setRefreshing(true);
            try {
              // pullFromServer bumps the folder revision, which the
              // FolderProvider's effect reacts to by re-running refresh() -
              // no need to await folders.refresh() manually.
              const result = await folders.pullFromServer();
              if (!result.ok && result.reason !== "endpoint-missing") {
                folders.setError(
                  result.reason === "network"
                    ? t(
                        "filesPage.syncError.network",
                        "Could not reach the server.",
                      )
                    : result.reason === "server"
                      ? t(
                          "filesPage.syncError.server",
                          "Server error during folder sync.",
                        )
                      : t("filesPage.syncError.client", "Folder sync failed."),
                );
              }
              await refresh();
            } finally {
              setRefreshing(false);
            }
          };
          return (
            <>
              <SearchField
                ref={searchInputRef}
                value={search}
                onChange={setSearch}
              />
              <div className="files-page-header-actions">
                <Tooltip
                  label={
                    signInRequiredReason ??
                    t("filesPage.refresh", "Refresh from server")
                  }
                  withinPortal
                >
                  <ActionIcon
                    variant="default"
                    size="md"
                    loading={refreshing}
                    disabled={refreshing || Boolean(signInRequiredReason)}
                    aria-busy={refreshing}
                    onClick={handleRefresh}
                    aria-label={t("filesPage.refresh", "Refresh from server")}
                  >
                    <RefreshIcon />
                  </ActionIcon>
                </Tooltip>
                {newFolderDisabledReason ? (
                  <Tooltip
                    label={newFolderDisabledReason}
                    withinPortal
                    multiline
                    w={220}
                  >
                    <span style={{ display: "inline-flex" }}>
                      <Button
                        variant="default"
                        size="sm"
                        leftSection={<CreateNewFolderIcon fontSize="small" />}
                        disabled
                        styles={{ root: { pointerEvents: "auto" } }}
                      >
                        {t("filesPage.newFolder", "New folder")}
                      </Button>
                    </span>
                  </Tooltip>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    leftSection={<CreateNewFolderIcon fontSize="small" />}
                    onClick={() => openNewFolderDialog()}
                  >
                    {t("filesPage.newFolder", "New folder")}
                  </Button>
                )}
                <Button
                  size="sm"
                  leftSection={<UploadFileIcon fontSize="small" />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t("filesPage.upload", "Upload")}
                </Button>
                {isMobileUploadAvailable && (
                  <Tooltip
                    label={t(
                      "filesPage.uploadFromMobile",
                      "Upload from Mobile",
                    )}
                    withinPortal
                  >
                    <ActionIcon
                      size="lg"
                      variant="default"
                      radius="md"
                      onClick={() => setMobileUploadModalOpen(true)}
                      aria-label={t(
                        "filesPage.uploadFromMobile",
                        "Upload from Mobile",
                      )}
                    >
                      <QrCode2Icon fontSize="small" />
                    </ActionIcon>
                  </Tooltip>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={onFileInputChange}
                />
              </div>
            </>
          );
        })()}
      </header>

      {folders.error && (
        <div
          role="alert"
          className="files-page-error-banner"
          style={{
            padding: "0.6rem 1.25rem",
            background:
              "color-mix(in srgb, var(--mantine-color-red-6, #e03131) 12%, transparent)",
            color: "var(--text-primary)",
            borderBottom: "1px solid var(--border-subtle)",
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
            variant="subtle"
            aria-label={t("filesPage.dismissError", "Dismiss")}
            onClick={() => folders.setError(null)}
          >
            <CloseIcon fontSize="small" />
          </ActionIcon>
        </div>
      )}

      {/* No offline banner: when the folder API is unreachable the user
          still sees their cached local files (the IDB read survives), and
          folder-mutation controls are individually disabled with their own
          tooltips. Banner removed per UX feedback. */}

      <div className="files-page-body">
        <main className="files-page-main">
          {/* Tab strip filters the file list; ARIA Tabs keyboard model. */}
          {(() => {
            const TAB_DEFS = [
              { id: "all", label: t("filesPage.tabs.all", "All") },
              { id: "recent", label: t("filesPage.tabs.recent", "Recent") },
              // Sharing tabs only when sharingEnabled.
              ...(sharingEnabled
                ? [
                    {
                      id: "shared" as const,
                      label: t("filesPage.tabs.shared", "Shared with me"),
                    },
                    {
                      id: "sharedByMe" as const,
                      label: t("filesPage.tabs.sharedByMe", "Shared by me"),
                    },
                  ]
                : []),
            ] as const;
            const focusTab = (id: string) => {
              const el = document.getElementById(`filesPage-tab-${id}`);
              el?.focus();
            };
            return (
              <div
                className="files-page-tabs"
                role="tablist"
                aria-label={t("filesPage.tabs.ariaLabel", "File views")}
                onKeyDown={(e) => {
                  const idx = TAB_DEFS.findIndex((t2) => t2.id === currentTab);
                  if (idx < 0) return;
                  let next: number;
                  if (e.key === "ArrowRight")
                    next = (idx + 1) % TAB_DEFS.length;
                  else if (e.key === "ArrowLeft")
                    next = (idx - 1 + TAB_DEFS.length) % TAB_DEFS.length;
                  else if (e.key === "Home") next = 0;
                  else if (e.key === "End") next = TAB_DEFS.length - 1;
                  else return;
                  e.preventDefault();
                  const target = TAB_DEFS[next]!;
                  setCurrentTab(target.id);
                  focusTab(target.id);
                }}
                style={{
                  display: "flex",
                  gap: "0.1rem",
                  padding: "0.2rem 1rem 0.2rem",
                }}
              >
                {TAB_DEFS.map((tab) => (
                  <button
                    key={tab.id}
                    id={`filesPage-tab-${tab.id}`}
                    role="tab"
                    type="button"
                    aria-selected={currentTab === tab.id}
                    aria-controls="filesPage-tabpanel"
                    tabIndex={currentTab === tab.id ? 0 : -1}
                    onClick={() => setCurrentTab(tab.id)}
                    style={{
                      background:
                        currentTab === tab.id
                          ? "var(--hover-bg)"
                          : "transparent",
                      border: "none",
                      borderRadius: "0.3rem",
                      padding: "0.2rem 0.6rem",
                      color:
                        currentTab === tab.id
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                      fontWeight: currentTab === tab.id ? 500 : 400,
                      fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            );
          })()}

          <div className="files-page-toolbar">
            <span className="files-page-toolbar-info">
              {loading
                ? t("filesPage.loading", "Loading…")
                : t("filesPage.summary", "{{count}} items", {
                    count: totalCount,
                  })}
              {selectedFiles.length > 0 && (
                <span>
                  {" "}
                  ·{" "}
                  {t("filesPage.selectedCount", "{{count}} selected", {
                    count: selectedFiles.length,
                  })}
                </span>
              )}
            </span>
            {(() => {
              // Select all / Clear toggle over visible files.
              if (visibleFiles.length === 0) return null;
              const allSelected = visibleFiles.every((f) =>
                selectedFileIds.has(f.id),
              );
              const someSelected = !allSelected && selectedFiles.length > 0;
              return (
                <Tooltip
                  label={t(
                    "filesPage.selectAllHint",
                    "Click to select all. Tip: hold Ctrl (or Cmd) to add files one at a time, Shift to select a range.",
                  )}
                  withinPortal
                  multiline
                  w={280}
                >
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => {
                      if (allSelected) {
                        setSelectedFileIds(new Set());
                      } else {
                        setSelectedFileIds(
                          new Set(visibleFiles.map((f) => f.id)),
                        );
                      }
                    }}
                    aria-pressed={allSelected || someSelected}
                  >
                    {allSelected
                      ? t("filesPage.deselectAll", "Clear selection")
                      : t("filesPage.selectAll", "Select all")}
                  </Button>
                </Tooltip>
              );
            })()}
            <div className="files-page-toolbar-actions">
              {selectedFiles.length > 0 &&
                (() => {
                  // Bulk-action labels; CSS collapses to icon-only below 900px.
                  const addLabel =
                    selectedFiles.length === 1
                      ? t("filesPage.addToWorkspace", "Add to workspace")
                      : t(
                          "filesPage.addToWorkspaceCount",
                          "Add {{count}} to workspace",
                          { count: selectedFiles.length },
                        );
                  const moveLabel = t("filesPage.moveTo", "Move to…");
                  const removeLabel = t("filesPage.remove", "Remove");
                  return (
                    // wrap="nowrap" keeps the row single-line.
                    <Group gap="xs" wrap="nowrap">
                      <Tooltip label={addLabel} withinPortal>
                        <Button
                          size="sm"
                          leftSection={<OpenInNewIcon fontSize="small" />}
                          onClick={() => handleAddToWorkspace(selectedFiles)}
                          aria-label={addLabel}
                          data-testid="add-to-workspace"
                        >
                          {addLabel}
                        </Button>
                      </Tooltip>
                      {/* Save to server; shown whenever local-only files are
                          selected. When storage is off it stays visible but
                          disabled, tooltip pointing at the admin. */}
                      {localOnlySelectedStubs.length > 0 && (
                        <Tooltip
                          label={
                            saveToServerDisabledReason ??
                            t("filesPage.saveToServer", "Save to server")
                          }
                          withinPortal
                          multiline={Boolean(saveToServerDisabledReason)}
                          w={saveToServerDisabledReason ? 240 : undefined}
                        >
                          <Button
                            size="sm"
                            variant="default"
                            leftSection={<CloudUploadIcon fontSize="small" />}
                            disabled={Boolean(saveToServerDisabledReason)}
                            onClick={() =>
                              setSaveToServerTarget(localOnlySelectedStubs)
                            }
                            styles={{
                              root: {
                                // Keep the tooltip hoverable while disabled.
                                pointerEvents: saveToServerDisabledReason
                                  ? "auto"
                                  : undefined,
                              },
                            }}
                            aria-label={t(
                              "filesPage.saveToServer",
                              "Save to server",
                            )}
                          >
                            {t("filesPage.saveToServer", "Save to server")}
                          </Button>
                        </Tooltip>
                      )}
                      {/* Show details button on compact viewports. */}
                      {selectedFiles.length === 1 &&
                        isCompactDetailsViewport && (
                          <Tooltip
                            label={t("filesPage.showDetails", "Show details")}
                            withinPortal
                          >
                            <Button
                              size="sm"
                              variant="default"
                              leftSection={
                                <InfoOutlinedIcon fontSize="small" />
                              }
                              onClick={() => setMobileDetailsOpen(true)}
                              aria-label={t(
                                "filesPage.showDetails",
                                "Show details",
                              )}
                            >
                              {t("filesPage.showDetails", "Show details")}
                            </Button>
                          </Tooltip>
                        )}
                      <Tooltip label={moveLabel} withinPortal>
                        <Button
                          size="sm"
                          variant="default"
                          leftSection={<DriveFileMoveIcon fontSize="small" />}
                          onClick={() => promptMoveFiles(selectedFiles)}
                          aria-label={moveLabel}
                        >
                          {moveLabel}
                        </Button>
                      </Tooltip>
                      <Tooltip label={removeLabel} withinPortal>
                        <Button
                          size="sm"
                          color="red"
                          variant="light"
                          leftSection={<DeleteIcon fontSize="small" />}
                          onClick={() => handleRemoveFiles(selectedFiles)}
                          aria-label={removeLabel}
                        >
                          {removeLabel}
                        </Button>
                      </Tooltip>
                      <Tooltip
                        label={t("filesPage.clearSelection", "Clear selection")}
                        withinPortal
                      >
                        <ActionIcon
                          variant="subtle"
                          size="md"
                          onClick={() => clearSelection()}
                          aria-label={t(
                            "filesPage.clearSelection",
                            "Clear selection",
                          )}
                        >
                          <CloseIcon fontSize="small" />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  );
                })()}
              {selectedFiles.length > 0 && (
                <span
                  className="files-page-toolbar-divider"
                  aria-hidden="true"
                />
              )}
              <Select
                size="xs"
                value={originFilter}
                onChange={(value) =>
                  value && setOriginFilter(value as FilesPageOriginFilter)
                }
                data={[
                  {
                    value: "all",
                    label: t("filesPage.origin.all", "All sources"),
                  },
                  {
                    value: "local",
                    label: t("filesPage.origin.local", "Local"),
                  },
                  {
                    value: "cloud",
                    label: t("filesPage.origin.cloud", "Cloud"),
                  },
                  {
                    value: "shared-with-me",
                    label: t("filesPage.origin.shared", "Shared"),
                  },
                ]}
                style={{ width: 140 }}
                aria-label={t("filesPage.originFilter", "Filter by source")}
              />
              {availableTypes.length > 1 && (
                <MultiSelect
                  size="xs"
                  value={typeFilter}
                  onChange={setTypeFilter}
                  data={availableTypes.map((ext) => ({
                    value: ext,
                    label: ext,
                  }))}
                  placeholder={
                    typeFilter.length === 0
                      ? t("filesPage.typeFilter.allTypes", "All types")
                      : undefined
                  }
                  clearable
                  hidePickedOptions
                  searchable={false}
                  style={{ width: 160 }}
                  aria-label={t("filesPage.typeFilter.label", "Filter by type")}
                />
              )}
              <Select
                size="xs"
                value={sortMode}
                onChange={(value) =>
                  value && setSortMode(value as FilesPageSortMode)
                }
                data={[
                  {
                    value: "modified-desc",
                    label: t("filesPage.sort.modifiedDesc", "Recent first"),
                  },
                  {
                    value: "modified-asc",
                    label: t("filesPage.sort.modifiedAsc", "Oldest first"),
                  },
                  {
                    value: "name-asc",
                    label: t("filesPage.sort.nameAsc", "Name A→Z"),
                  },
                  {
                    value: "name-desc",
                    label: t("filesPage.sort.nameDesc", "Name Z→A"),
                  },
                  {
                    value: "size-desc",
                    label: t("filesPage.sort.sizeDesc", "Largest first"),
                  },
                  {
                    value: "size-asc",
                    label: t("filesPage.sort.sizeAsc", "Smallest first"),
                  },
                ]}
                style={{ width: 160 }}
              />
              <span className="files-page-toolbar-divider" aria-hidden="true" />
              <SegmentedControl
                size="xs"
                value={viewMode}
                onChange={(v) => {
                  // Mantine only emits values declared in `data[].value`, but
                  // narrow defensively so a future third option can't silently
                  // bypass the FilesPageViewMode contract. Derived from the
                  // `as const` tuple so adding a mode anywhere in the code
                  // base automatically widens the guard here.
                  if (!(FILES_PAGE_VIEW_MODES as readonly string[]).includes(v))
                    return;
                  setViewMode(v as (typeof FILES_PAGE_VIEW_MODES)[number]);
                }}
                aria-label={t("filesPage.viewMode.label", "View mode")}
                data={[
                  {
                    value: "grid",
                    label: (
                      <span
                        className="files-page-view-toggle-icon"
                        title={t("filesPage.viewMode.grid", "Grid view")}
                      >
                        <GridViewIcon fontSize="small" />
                        <span className="files-page-sr-only">
                          {t("filesPage.viewMode.grid", "Grid view")}
                        </span>
                      </span>
                    ),
                  },
                  {
                    value: "list",
                    label: (
                      <span
                        className="files-page-view-toggle-icon"
                        title={t("filesPage.viewMode.list", "List view")}
                      >
                        <ViewListIcon fontSize="small" />
                        <span className="files-page-sr-only">
                          {t("filesPage.viewMode.list", "List view")}
                        </span>
                      </span>
                    ),
                  },
                ]}
              />
            </div>
          </div>

          <div
            className="files-page-content"
            onClick={handleContentBackgroundClick}
          >
            <FileGrid
              entries={entries}
              loading={loading}
              currentTab={currentTab}
              serverReachable={folders.serverReachable}
              selectedFileIds={selectedFileIds}
              activeWorkspaceFileIds={activeWorkspaceFileIdSet}
              viewMode={viewMode}
              sortMode={sortMode}
              onChangeSortMode={setSortMode}
              onSelectFile={handleSelectFile}
              onSetSelection={setSelectedFileIds}
              onOpenFolder={handleOpenFolder}
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
              saveToServerDisabledReason={saveToServerDisabledReason}
              // Center-of-grid CTAs when the empty state shows - same
              // handlers the corner header buttons use so behaviour
              // (disabled tooltips, native file picker, dialog) is
              // identical regardless of where the user clicks from.
              onEmptyUpload={() => fileInputRef.current?.click()}
              onEmptyCreateFolder={() => openNewFolderDialog()}
              newFolderDisabledReason={newFolderDisabledReason}
            />
            {isDraggingExternal && (
              <div className="files-page-drop-overlay" aria-live="polite">
                <span className="files-page-drop-overlay-icon">
                  <UploadFileIcon />
                </span>
                <span>
                  {t("filesPage.dropOverlay", "Drop files to upload")}
                </span>
                <span className="files-page-drop-overlay-sub">
                  {/* Behavior contract: per handleNativeUpload above, all
                      newly-uploaded files start in Local (folderId stays
                      null) regardless of the current folder view. Saying
                      "will land in {folder}" was a lie; tell the truth
                      so the user reaches for Save-to-cloud / Move-to when
                      they actually want a folder placement. */}
                  {t(
                    "filesPage.dropOverlaySub",
                    "Files start in Local. Use 'Move to' or 'Save to cloud' to organise them into a folder.",
                  )}
                </span>
              </div>
            )}
          </div>
        </main>

        {/* Inline aside on desktop. */}
        {selectedFiles.length > 0 && !isCompactDetailsViewport && (
          <FileDetailsPanel
            selectedFileIds={selectedFiles}
            fileMap={fileMap}
            currentFolder={currentFolderRecord}
            onClose={() => clearSelection()}
            onAddToWorkspace={handleAddToWorkspace}
            onMove={promptMoveFiles}
            onRemove={handleRemoveFiles}
            onSaveToServer={(files) => setSaveToServerTarget(files)}
            saveToServerDisabledReason={saveToServerDisabledReason}
          />
        )}
      </div>

      {/* Drawer hosts the details panel on ≤800px viewports. */}
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
              currentFolder={currentFolderRecord}
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
        folders={folders.folders}
        initialFolderId={moveDialog.initial}
        disabledFolderId={moveDialog.folderId}
        onConfirm={async (target) => {
          if (moveDialog.fileIds && moveDialog.fileIds.length > 0) {
            await moveFilesTo(moveDialog.fileIds, target);
          } else if (moveDialog.folderId) {
            await moveFolderTo(moveDialog.folderId, target);
          }
        }}
        // Inline-create folder; gated on serverReachable.
        onCreateFolder={
          folders.serverReachable
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

      {/* Cloud-aware delete; offers local/cloud/both when a file lives in both. */}
      <DeleteFilesDialog
        opened={deleteDialogOpen}
        files={deleteDialogFiles}
        onClose={closeDeleteDialog}
        onConfirm={confirmRemoveFiles}
      />

      {/* Version journey in a modal (opened from the card kebab). */}
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

      <MobileUploadModal
        opened={mobileUploadModalOpen}
        onClose={() => setMobileUploadModalOpen(false)}
        onFilesReceived={(files) => {
          if (files.length > 0) {
            void addFiles(files);
          }
        }}
      />
    </div>
  );
}

const SearchField = React.forwardRef<
  HTMLInputElement,
  { value: string; onChange: (v: string) => void }
>(function SearchField({ value, onChange }, ref) {
  const { t } = useTranslation();
  return (
    <div className="files-page-search">
      <SearchIcon fontSize="small" style={{ color: "var(--text-muted)" }} />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={t(
          "filesPage.searchPlaceholder",
          "Search this folder & subfolders",
        )}
        aria-label={t("filesPage.search", "Search")}
      />
      {value && (
        <ActionIcon
          variant="subtle"
          size="xs"
          onClick={() => onChange("")}
          aria-label={t("filesPage.clearSearch", "Clear search")}
        >
          <CloseIcon fontSize="small" />
        </ActionIcon>
      )}
    </div>
  );
});

function Breadcrumbs() {
  const { t } = useTranslation();
  const folders = useFolders();
  const filesPage = useFilesPage();
  const trail = folders.breadcrumbs;
  return (
    <nav
      className="files-page-breadcrumbs"
      aria-label={t("filesPage.breadcrumbs", "Folder path")}
    >
      {trail.map((entry, idx) => {
        const isLast = idx === trail.length - 1;
        return (
          <React.Fragment key={entry.id ?? "root"}>
            <button
              type="button"
              className={`files-page-breadcrumb${isLast ? " is-current" : ""}`}
              onClick={() => folders.setCurrentFolderId(entry.id)}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(FILES_PAGE_DRAG_TYPE)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const payload = parseFilesPageDragPayload(e.dataTransfer);
                if (!payload) return;
                if (payload.kind === "files") {
                  // Route through moveFilesTo (→ IndexedDBContext.moveFilesToFolder)
                  // so the revision bumps and the grid refreshes. Surface
                  // rejection via the banner - console-only was invisible
                  // to non-dev users.
                  void filesPage
                    .moveFilesTo(payload.fileIds, entry.id)
                    .catch((err) => {
                      console.error("[breadcrumb] drop failed", err);
                      folders.setError(
                        err instanceof Error
                          ? t("filesPage.error.moveFilesFailedDetail", {
                              message: err.message,
                              defaultValue: `Could not move files: ${err.message}`,
                            })
                          : t(
                              "filesPage.error.moveFilesFailed",
                              "Could not move files.",
                            ),
                      );
                    });
                } else if (payload.kind === "folder") {
                  // Route through moveFolderTo so the client-side cycle guard fires
                  // before the server call - otherwise dragging an ancestor onto a
                  // child crumb shows the generic banner instead of the localized
                  // "Can't move a folder into one of its own subfolders." message.
                  void filesPage
                    .moveFolderTo(payload.folderId, entry.id)
                    .catch((err) => {
                      console.error("[breadcrumb] folder drop failed", err);
                      folders.setError(
                        err instanceof Error
                          ? t("filesPage.error.moveFolderFailedDetail", {
                              message: err.message,
                              defaultValue: `Could not move folder: ${err.message}`,
                            })
                          : t(
                              "filesPage.error.moveFolderFailed",
                              "Could not move folder.",
                            ),
                      );
                    });
                }
              }}
            >
              {entry.name}
            </button>
            {!isLast && (
              <KeyboardArrowRightIcon
                className="files-page-breadcrumb-sep"
                fontSize="small"
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
