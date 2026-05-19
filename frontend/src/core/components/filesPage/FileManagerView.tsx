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
  Menu,
  MultiSelect,
  SegmentedControl,
  Select,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import GridViewIcon from "@mui/icons-material/GridView";
import ViewListIcon from "@mui/icons-material/ViewList";
import DeleteIcon from "@mui/icons-material/Delete";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import VisibilityIcon from "@mui/icons-material/Visibility";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import RefreshIcon from "@mui/icons-material/Refresh";
import MoreVertIcon from "@mui/icons-material/MoreVert";

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
import { MoveToFolderDialog } from "@app/components/filesPage/MoveToFolderDialog";
import { FolderNameDialog } from "@app/components/filesPage/FolderNameDialog";
import {
  FILES_PAGE_DRAG_TYPE,
  parseFilesPageDragPayload,
} from "@app/components/filesPage/dragDrop";
import {
  clearFilesPageReturnRoute,
  setFilesPageReturnRoute,
} from "@app/components/filesPage/filesPageReturnRoute";
import "@app/components/filesPage/FilesPage.css";

export default function FileManagerView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  // Sharing is gated server-side. Hide the "Shared with me" tab entirely
  // when the deployment didn't enable it - the tab was always empty in
  // that case and just confused users into thinking sharing was broken.
  // Use the shared hook so this gate stays in lockstep with the other
  // sharing-feature gates (FileActions, FileInfoCard, ShareManagementModal,
  // etc.) - all read the same `config.storageSharingEnabled` flag.
  const { sharingEnabled } = useSharingEnabled();

  // At ≤800px the inline details aside no longer fits next to the grid
  // (and the rest of the chrome is in mobile-compaction mode). On these
  // viewports a Mantine Drawer hosts the details panel content. The
  // Drawer is BUTTON-TRIGGERED (not auto-opened on selection) - opening
  // it on every selection blocked multi-select because the backdrop
  // intercepted taps on other file cards.
  const isCompactDetailsViewport = useMediaQuery("(max-width: 800px)") ?? false;
  // Full-screen drawer on phones (≤640) so there's no awkward empty strip
  // showing the grid peeking through behind the backdrop; on tablet-sized
  // viewports (641-800) a smaller drawer keeps some grid context visible.
  const useFullScreenDrawer = useMediaQuery("(max-width: 640px)") ?? false;
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const folders = useFolders();
  const { actions: fileActions } = useFileActions();
  const { fileIds: activeWorkspaceFileIds } = useAllFiles();
  const activeWorkspaceFileIdSet = useMemo(
    () => new Set(activeWorkspaceFileIds.map((id) => id as string)),
    [activeWorkspaceFileIds],
  );
  const { addFiles } = useFileHandler();
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
    deleteFolder,
    setFolderAppearance,
  } = filesPage;

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

  // If the deployment turned sharing off after the user last visited
  // (e.g. cached state had currentTab === "shared"), the Shared tab is
  // no longer rendered above - bounce back to All so the user doesn't
  // sit on an inert tab with no content.
  useEffect(() => {
    if (!sharingEnabled && currentTab === "shared") {
      setCurrentTab("all");
    }
  }, [sharingEnabled, currentTab, setCurrentTab]);

  // Push URL when the user picks a folder. Only sync while we're still on
  // /files so an explicit close doesn't bounce us back.
  useEffect(() => {
    if (!window.location.pathname.startsWith("/files")) return;
    const target =
      currentFolderId === null ? "/files" : `/files/${currentFolderId}`;
    if (window.location.pathname !== target) {
      navigate(target, { replace: true });
    }
  }, [currentFolderId, navigate]);

  // ─── visible items (current folder + sort + search) ─────────────────────

  /**
   * Set of folder IDs in the subtree rooted at currentFolderId - that is,
   * currentFolderId itself plus every descendant. Used to widen search
   * results to include subfolder hits without changing the no-search
   * navigation behaviour (where only direct children appear).
   *
   * Includes `null` when at root so file predicates like
   * `subtreeFolderIds.has(file.folderId ?? null)` work uniformly.
   */
  const subtreeFolderIds = useMemo(() => {
    const set = new Set<FolderId | null>();
    set.add(currentFolderId);
    const childMap = new Map<FolderId | null, FolderId[]>();
    for (const f of folders.folders) {
      const list = childMap.get(f.parentFolderId) ?? [];
      list.push(f.id);
      childMap.set(f.parentFolderId, list);
    }
    // Iterative DFS - recursive form risked a stack overflow on a deeply
    // nested chain a user could create.
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
    // Folders only appear in cloud-rooted tabs. Local / Recent / Shared
    // tabs are flat file views - showing cloud folders there would be
    // confusing (the user clicked Local to escape folders).
    if (
      currentTab === "local" ||
      currentTab === "recent" ||
      currentTab === "shared"
    ) {
      return [];
    }
    const lc = search.toLowerCase();
    const matched = folders.folders.filter((f) => {
      if (search) {
        // Recursive search: show any folder anywhere in the current
        // subtree whose name matches. Hide the current folder itself
        // (its "match" would be circular and useless).
        return (
          f.id !== currentFolderId &&
          subtreeFolderIds.has(f.parentFolderId) &&
          f.name.toLowerCase().includes(lc)
        );
      }
      // No search: classic direct-children-only view.
      return f.parentFolderId === currentFolderId;
    });
    return matched.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [folders.folders, currentFolderId, search, currentTab, subtreeFolderIds]);

  // Files in the current folder (before search/origin/type filtering). Used
  // to compute the *available* file-type list for the dropdown - that way
  // the dropdown shows what's actually here rather than every type we've
  // ever seen.
  const filesInCurrentFolder = useMemo(() => {
    // Tab takes precedence - folders are a cloud-only concept; the tabs
    // override navigation when the user is in Local/Recent/Shared.
    switch (currentTab) {
      case "local":
        // Local = files with no server copy. folderId is forced null on this
        // path (cf. file.ts comment), but we check remoteStorageId too so
        // stale local-folder rows from a pre-pivot DB don't slip through.
        return allFiles.filter((f) => f.remoteStorageId == null);
      case "cloud":
        // Cloud bucket excludes local-only files. With an active search we
        // widen to any cloud file in the current subtree; otherwise the
        // classic direct-folder match.
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
      case "all":
      default:
        // Search widens to the subtree so a user typing "invoice" at root
        // finds /Receipts/2024/Q1-invoice.pdf without having to navigate first.
        return allFiles.filter((f) => {
          if (search) return subtreeFolderIds.has(f.folderId ?? null);
          return (f.folderId ?? null) === (currentFolderId ?? null);
        });
    }
  }, [allFiles, currentFolderId, currentTab, search, subtreeFolderIds]);

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
        if (ctrl) {
          if (next.has(fileId)) next.delete(fileId);
          else next.add(fileId);
        } else {
          // Plain click toggles when the file is already the *only*
          // selected one - matches Finder/Explorer behaviour. Otherwise
          // it collapses the selection to just this file.
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
      const added = await addFiles(files, { selectFiles: false });
      const fileIds = added.map((f) => f.fileId);
      const target = currentFolderId;
      // Newly-uploaded files are local-only (no remoteStorageId yet). The
      // BaseFileMetadata invariant requires folderId == null for local files,
      // so we MUST NOT set folderId to a cloud folder here - that would put
      // the file in two tabs at once (Local view by remoteStorageId predicate
      // AND the cloud folder by folderId match). Drop them at root; the
      // (future) save-to-cloud action is the right place to choose a folder.
      if (
        target !== null &&
        fileIds.length > 0 &&
        // Only relevant for cloud folders; ROOT keeps them at the "right"
        // place anyway, and currentTab being cloud means a real folder.
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

  // ─── add to workspace vs quick view ─────────────────────────────────────
  //
  // The two actions look similar but have different intent:
  //   addToWorkspace - user is committing these files to the workspace so
  //     they can run tools on them. No back-to-files affordance - they
  //     came here to work, not to peek.
  //   quickView - user is taking a quick look at one file. A "Back to My
  //     Files" pill appears in the WorkbenchBar so they can return without
  //     navigating manually.
  const openFilesInWorkbench = useCallback(
    async (fileIds: FileId[], options: { trackReturn: boolean }) => {
      const stubs = fileIds
        .map((id) => fileMap.get(id))
        .filter((s): s is StirlingFileStub => Boolean(s));
      if (stubs.length === 0) return;

      const proceed = async () => {
        if (options.trackReturn) {
          const returnRoute =
            currentFolderId === null ? "/files" : `/files/${currentFolderId}`;
          const folderRecord = currentFolderId
            ? (foldersById.get(currentFolderId) ?? null)
            : null;
          const returnLabel = folderRecord
            ? folderRecord.name
            : t("filesPage.myFiles", "My Files");
          setFilesPageReturnRoute(returnRoute, returnLabel);
        } else {
          clearFilesPageReturnRoute();
        }

        const added = await fileActions.addStirlingFileStubs(stubs, {
          selectFiles: false,
        });
        if (added.length === 1) {
          setActiveFileId(added[0]!.fileId);
          navActions.setWorkbench("viewer");
        } else if (added.length > 1) {
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
      currentFolderId,
      foldersById,
      t,
    ],
  );

  const handleAddToWorkspace = useCallback(
    (fileIds: FileId[]) =>
      openFilesInWorkbench(fileIds, { trackReturn: false }),
    [openFilesInWorkbench],
  );

  const handleQuickView = useCallback(
    (fileId: FileId) => openFilesInWorkbench([fileId], { trackReturn: true }),
    [openFilesInWorkbench],
  );

  const handleOpenFile = useCallback(
    (file: StirlingFileStub) => {
      // Double-clicking a file is the "commit" action - drop the file
      // straight into the workspace, same as the Add-to-workspace button.
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
              ? `Could not upload files: ${err.message}`
              : "Could not upload files.",
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
    // User explicitly left My Files without opening a file - drop the
    // return-route hint so the workbench doesn't show a stale back button.
    clearFilesPageReturnRoute();
    navigate("/");
  }, [navigate]);

  // ─── keyboard shortcuts ─────────────────────────────────────────────────
  const searchInputRef = useRef<HTMLInputElement | null>(null);
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
              ? `Could not remove files: ${err.message}`
              : "Could not remove files.",
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
      // Esc-once cancels the selection rather than closing the
      // workbench - keeps users from accidentally losing their place.
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

  return (
    <div className="files-page" ref={dropZoneRef}>
      <header className="files-page-header">
        {/* Single Back affordance - was previously a Home + Tools + Close
            trio that all did the same handleClose action. Mobile gets the
            same button (no data-mobile-hide) since the bottom bar nav is
            the only other way out. */}
        <Button
          variant="subtle"
          size="sm"
          leftSection={<KeyboardArrowLeftIcon fontSize="small" />}
          onClick={handleClose}
        >
          {t("filesPage.back", "Back")}
        </Button>
        {/* Breadcrumb only makes sense when the view is folder-rooted.
            Local / Recent / Shared are flat virtual buckets - showing
            a stale folder path here would mislead the user about where
            they actually are. */}
        {(currentTab === "all" || currentTab === "cloud") && <Breadcrumbs />}
        {(currentTab === "local" ||
          currentTab === "recent" ||
          currentTab === "shared") && (
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
                : t("filesPage.tabName.shared", "Shared with me")}
          </div>
        )}
        {(() => {
          // Both the inline desktop buttons and the mobile kebab menu need
          // these handlers — extract once so we don't drift two copies.
          const handleRefresh = async () => {
            setRefreshing(true);
            try {
              // pullFromServer bumps the folder revision, which the
              // FolderProvider's effect reacts to by re-running refresh() —
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
          const newFolderDisabledReason =
            currentTab === "local"
              ? t(
                  "filesPage.localFoldersUnavailable",
                  "Folders are cloud-only - save a file to the cloud to organise it.",
                )
              : currentTab === "recent" || currentTab === "shared"
                ? t(
                    "filesPage.newFolderTabUnavailable",
                    "Switch to All or Cloud to create folders.",
                  )
                : !folders.serverReachable
                  ? t(
                      "filesPage.newFolderStorageDisabled",
                      "Server folder storage isn't available. Ask your admin to enable storage in settings (security.enableLogin + storage.enabled) - the feature exists but is opt-in.",
                    )
                  : null;
          // Wrap the button in a Tooltip so the disabled state EXPLAINS
          // itself - users were left wondering why "New folder" was greyed
          // out. The label tells them the feature exists and points at how
          // to turn it on. `disabled={!disabled-state}` on the tooltip
          // suppresses it when the button is actionable.
          const newFolderButton = (
            <Tooltip
              label={newFolderDisabledReason ?? ""}
              disabled={newFolderDisabledReason === null}
              withinPortal
              multiline
              w={260}
              position="bottom-end"
            >
              <Button
                leftSection={<CreateNewFolderIcon fontSize="small" />}
                variant="default"
                size="sm"
                disabled={newFolderDisabledReason !== null}
                onClick={() => openNewFolderDialog()}
                data-disabled={newFolderDisabledReason !== null || undefined}
                styles={{
                  root: {
                    // Mantine's disabled style ignores pointer events, which
                    // also kills the Tooltip hover. `pointer-events: auto`
                    // restores hover on the disabled button without making
                    // it clickable (the click handler itself is suppressed
                    // by Mantine while disabled is true).
                    pointerEvents:
                      newFolderDisabledReason !== null ? "auto" : undefined,
                  },
                }}
              >
                {t("filesPage.newFolder", "New folder")}
              </Button>
            </Tooltip>
          );
          return (
            <div className="files-page-header-actions">
              <SearchField
                ref={searchInputRef}
                value={search}
                onChange={setSearch}
              />
              {/* Refresh — inline on desktop, folded into the kebab on mobile. */}
              <Tooltip
                label={t("filesPage.refresh", "Refresh from server")}
                withinPortal
              >
                <ActionIcon
                  variant="default"
                  size="md"
                  data-mobile-hide="true"
                  loading={refreshing}
                  disabled={refreshing}
                  aria-busy={refreshing}
                  onClick={handleRefresh}
                  aria-label={t("filesPage.refresh", "Refresh from server")}
                >
                  <RefreshIcon />
                </ActionIcon>
              </Tooltip>
              {/* New folder — inline on desktop, folded into the kebab on mobile. */}
              <span data-mobile-hide="true" style={{ display: "inline-flex" }}>
                <Tooltip
                  label={
                    newFolderDisabledReason ??
                    t("filesPage.newFolder", "New folder")
                  }
                  withinPortal
                >
                  {/* Mantine disables tooltip pointer events on disabled
                      children — wrap so the tooltip still fires on hover. */}
                  {newFolderDisabledReason ? (
                    <span style={{ display: "inline-flex" }}>
                      {newFolderButton}
                    </span>
                  ) : (
                    newFolderButton
                  )}
                </Tooltip>
              </span>
              <Button
                leftSection={<UploadFileIcon fontSize="small" />}
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                {t("filesPage.upload", "Upload")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={onFileInputChange}
              />
              {/* Mobile overflow: collapses Refresh + New folder so the
                  toolbar isn't clipped on narrow viewports. CSS hides this
                  on >640px via `data-desktop-hide`. */}
              <Menu shadow="md" position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon
                    variant="default"
                    size="md"
                    data-desktop-hide="true"
                    aria-label={t(
                      "filesPage.moreActions",
                      "More folder actions",
                    )}
                  >
                    <MoreVertIcon />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<RefreshIcon fontSize="small" />}
                    disabled={refreshing}
                    onClick={handleRefresh}
                  >
                    {t("filesPage.refresh", "Refresh from server")}
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<CreateNewFolderIcon fontSize="small" />}
                    disabled={newFolderDisabledReason !== null}
                    onClick={() => openNewFolderDialog()}
                  >
                    {newFolderDisabledReason ??
                      t("filesPage.newFolder", "New folder")}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </div>
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
          {/* Tabs are presets: each one filters the file list and chooses
              whether folder cards appear at all. Switching tabs is the
              fastest path between "see my local files" and "browse cloud".
              Keyboard model follows WAI-ARIA Tabs: roving tabindex + arrow
              keys to move + Home/End to jump. */}
          {(() => {
            // Compact tab strip - used as a quick view filter. The tree on
            // the left has the same Local pinned row, so this is intentional
            // redundancy for users who reach for the toolbar instead of the
            // tree. Kept low-key so it doesn't compete with primary actions.
            // Local and Cloud removed - the pinned "Local" row in the tree
            // sidebar covers Local, and the default "All" view already shows
            // cloud folders. Recent + Shared remain as virtual-bucket filters.
            const TAB_DEFS = [
              { id: "all", label: t("filesPage.tabs.all", "All") },
              { id: "recent", label: t("filesPage.tabs.recent", "Recent") },
              // Shared only when the server actually has sharing enabled —
              // see useSharingEnabled gate at the top of the component.
              ...(sharingEnabled
                ? [
                    {
                      id: "shared" as const,
                      label: t("filesPage.tabs.shared", "Shared with me"),
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
                  // No initializer: every branch below either assigns or
                  // returns, so seeding `next = idx` was a no-useless-assignment
                  // lint hit. TS's definite-assignment analysis picks up the
                  // assignments through the if/else chain.
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
              // Select all / Clear toggle: operates on the currently-visible
              // file list (post search/origin/type filters), not on `allFiles`,
              // so the user gets what they see. Hidden when there are no
              // visible files to act on.
              if (visibleFiles.length === 0) return null;
              const allSelected = visibleFiles.every((f) =>
                selectedFileIds.has(f.id),
              );
              const someSelected = !allSelected && selectedFiles.length > 0;
              return (
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
              );
            })()}
            <div className="files-page-toolbar-actions">
              {selectedFiles.length > 0 &&
                (() => {
                  // Labels for the bulk-action buttons. CSS hides the
                  // visible label text at ≤900px (collapsing the buttons
                  // to icon-only so the toolbar fits without wrapping)
                  // - so each button gets a Tooltip + aria-label here
                  // for both pointer-hover and screen-reader access.
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
                  const quickViewLabel = t("filesPage.quickView", "Quick view");
                  return (
                    // wrap="nowrap" so the bulk-action row stays single-
                    // line - default Mantine Group wraps when narrow,
                    // which was pushing the "X" clear button onto a
                    // second row. The CSS on .files-page-toolbar-actions
                    // already clips overflow, and each Button has
                    // flex-shrink:0, so nowrap is safe.
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
                      {selectedFiles.length === 1 && (
                        <Tooltip label={quickViewLabel} withinPortal>
                          <Button
                            size="sm"
                            variant="subtle"
                            leftSection={<VisibilityIcon fontSize="small" />}
                            onClick={() => handleQuickView(selectedFiles[0]!)}
                            aria-label={quickViewLabel}
                          >
                            {quickViewLabel}
                          </Button>
                        </Tooltip>
                      )}
                      {/* "Show details" button - only on compact viewports
                          where the inline details aside is gone. The
                          replacement Drawer is BUTTON-TRIGGERED (not
                          auto-opened on selection) so multi-select still
                          works - tapping more file checkboxes adds to the
                          selection without a backdrop blocking the row. */}
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
              onQuickView={(file) => handleQuickView(file.id)}
              onMoveFiles={moveFilesTo}
              onMoveFolder={moveFolderTo}
              onRenameFolder={openRenameFolderDialog}
              onDeleteFolder={(folder) => {
                deleteFolder(folder).catch((err) =>
                  folders.setError(
                    err instanceof Error
                      ? `Could not delete folder: ${err.message}`
                      : "Could not delete folder.",
                  ),
                );
              }}
              onChangeFolderAppearance={(folderId, appearance) => {
                setFolderAppearance(folderId, appearance).catch((err) =>
                  folders.setError(
                    err instanceof Error
                      ? `Could not update folder appearance: ${err.message}`
                      : "Could not update folder appearance.",
                  ),
                );
              }}
              onRemoveFiles={handleRemoveFiles}
              onPromptMoveFiles={promptMoveFiles}
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

        {/* Desktop: render the details panel inline as an <aside> sibling
            of the main grid. CSS in FilesPage.css governs its width. */}
        {selectedFiles.length > 0 && !isCompactDetailsViewport && (
          <FileDetailsPanel
            selectedFileIds={selectedFiles}
            fileMap={fileMap}
            currentFolder={currentFolderRecord}
            onClose={() => clearSelection()}
            onAddToWorkspace={handleAddToWorkspace}
            onQuickView={handleQuickView}
            onMove={promptMoveFiles}
            onRemove={handleRemoveFiles}
          />
        )}
      </div>

      {/* Compact viewports (≤800px): inline aside is gone (no room next
          to the grid) so the same details panel lives inside a Drawer.
          The Drawer is button-triggered (via the "Show details" button
          in the bulk-action row), NOT auto-opened on selection - that
          earlier auto-open behaviour blocked multi-select because the
          backdrop intercepted taps on other file cards.

          On very narrow phones (≤480px) the Drawer is full-width so
          there's no awkward empty strip showing the grid peeking through
          on the left; on tablet-sized compact viewports a smaller width
          keeps some context. The Drawer's own close handler clears
          `mobileDetailsOpen` only - selection stays so the bulk-action
          row keeps showing. */}
      {isCompactDetailsViewport && (
        <Drawer
          opened={mobileDetailsOpen && selectedFiles.length === 1}
          onClose={() => setMobileDetailsOpen(false)}
          position="right"
          size={useFullScreenDrawer ? "100%" : "sm"}
          padding={0}
          withCloseButton={false}
          // The panel renders its own close button + header. Keep the
          // Drawer scroll container at the body level so the long
          // version-journey timeline scrolls inside the drawer without
          // pushing the action stack off the bottom.
          overlayProps={{ opacity: 0.45 }}
        >
          {mobileDetailsOpen && selectedFiles.length === 1 && (
            <FileDetailsPanel
              selectedFileIds={selectedFiles}
              fileMap={fileMap}
              currentFolder={currentFolderRecord}
              onClose={() => setMobileDetailsOpen(false)}
              onAddToWorkspace={handleAddToWorkspace}
              onQuickView={handleQuickView}
              onMove={promptMoveFiles}
              onRemove={handleRemoveFiles}
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
                          ? `Could not move files: ${err.message}`
                          : "Could not move files.",
                      );
                    });
                } else if (payload.kind === "folder") {
                  void folders
                    .moveFolder(payload.folderId, entry.id)
                    .catch((err) => {
                      console.error("[breadcrumb] folder drop failed", err);
                      folders.setError(
                        err instanceof Error
                          ? `Could not move folder: ${err.message}`
                          : "Could not move folder.",
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
