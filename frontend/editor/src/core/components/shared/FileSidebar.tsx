import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  forwardRef,
} from "react";
import { Loader, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
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
import { useAuth } from "@app/auth/UseSession";
import { useProfilePictureUrl } from "@app/hooks/useProfilePictureUrl";
import {
  useIndexedDB,
  useIndexedDBRevision,
} from "@app/contexts/IndexedDBContext";
import { accountService } from "@app/services/accountService";
import { GoogleDriveIcon } from "@shared/components/CloudStorageIcons";
import { Wordmark } from "@app/components/shared/Wordmark";
import type { StirlingFileStub } from "@app/types/fileContext";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import FolderSpecialIcon from "@mui/icons-material/FolderSpecial";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SettingsIcon from "@mui/icons-material/Settings";
import type { FileId } from "@app/types/file";
import { FileItem } from "@app/components/shared/FileSidebarFileItem";
import { useFolderMembership } from "@app/hooks/useFolderMembership";
import { useAllWatchedFolders } from "@app/hooks/useAllWatchedFolders";
import { usePolicyFileBadges } from "@app/hooks/usePolicyFileBadges";
import {
  setWatchedFolderDraggedFileIds,
  clearWatchedFolderDraggedFileIds,
} from "@app/components/watchedFolders/watchedFolderDragState";
import { WATCHED_FOLDERS_ENABLED } from "@app/constants/featureFlags";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import "@app/components/shared/FileSidebar.css";

const COLLAPSED_WIDTH = "3.5rem";
const EXPANDED_WIDTH = "16.25rem"; // ~260px

// Inlined to avoid a circular import with WatchedFoldersRegistration.
const WATCHED_FOLDER_VIEW_ID = "watchedFolder";
const WATCHED_FOLDER_WORKBENCH_ID = "custom:watchedFolder";

export interface FileSidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenSettings?: () => void;
  /** Accessible name override for the toggle button. */
  toggleAriaLabel?: string;
  /** Icon override for the toggle button (e.g. back-arrow on /files). */
  toggleIcon?: React.ReactNode;
  /** Override the Open-from-computer handler (e.g. upload to /files folder). */
  onUploadFiles?: (files: File[]) => void | Promise<void>;
  /** Override the Google Drive handler. */
  onPickGoogleDriveFiles?: (files: File[]) => void | Promise<void>;
  /** Override the Search row click (e.g. focus the /files search input). */
  onSearchClick?: () => void;
  /** Extra action row inserted under Open-from-computer (e.g. New folder). */
  extraAction?: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    disabledTooltip?: string;
    testId?: string;
  };
}

const FileSidebar = forwardRef<HTMLDivElement, FileSidebarProps>(
  function FileSidebar(
    {
      collapsed = false,
      onToggleCollapse,
      onOpenSettings,
      toggleAriaLabel,
      toggleIcon,
      onUploadFiles,
      onPickGoogleDriveFiles,
      onSearchClick,
      extraAction,
    },
    ref,
  ) {
    const { t } = useTranslation();
    const [searchActive, setSearchActive] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const searchInputRef = useRef<HTMLInputElement>(null);
    const nativeFileInputRef = useRef<HTMLInputElement>(null);
    // State (not ref) so setting it triggers a re-render - avoids racing addFiles state updates.
    const [pendingViewFileId, setPendingViewFileId] = useState<string | null>(
      null,
    );

    const navigate = useNavigate();
    const { config } = useAppConfig();
    const {
      isEnabled: isGoogleDriveEnabled,
      openPicker: openGoogleDrivePicker,
    } = useGoogleDrivePicker();
    const { state } = useFileState();
    const { actions: fileActions } = useFileActions();
    const { actions: navActions } = useNavigationActions();
    const { setCustomWorkbenchViewData, customWorkbenchViews } =
      useToolWorkflow();
    const { workbench: currentWorkbench, selectedTool } = useNavigationState();
    const isWatchedFoldersActive =
      currentWorkbench === WATCHED_FOLDER_WORKBENCH_ID;
    // The folder currently open in the Watched Folders view (null = folder list/home).
    const activeWatchedFolderId = (customWorkbenchViews.find(
      (v) => v.id === WATCHED_FOLDER_VIEW_ID,
    )?.data?.folderId ?? null) as string | null;
    // fileId → folderId[] across all watch folders. In the Watched Folders view the
    // sidebar tick reflects "already in the open folder" instead of workbench
    // membership (which is meaningless there - a click sends to the folder, not
    // the workbench). The same map drives the per-file membership dots.
    const folderMembership = useFolderMembership();
    const allFolders = useAllWatchedFolders();
    const policyFileBadges = usePolicyFileBadges();
    const folderById = useMemo(
      () => new Map(allFolders.map((f) => [f.id, f])),
      [allFolders],
    );

    const openWatchedFolders = useCallback(() => {
      if (collapsed && onToggleCollapse) onToggleCollapse();
      setCustomWorkbenchViewData(WATCHED_FOLDER_VIEW_ID, { folderId: null });
      navActions.setWorkbench(WATCHED_FOLDER_WORKBENCH_ID as any);
    }, [collapsed, onToggleCollapse, setCustomWorkbenchViewData, navActions]);

    // Clicking a file's membership dot jumps straight into that folder.
    const openWatchedFolder = useCallback(
      (folderId: string) => {
        if (collapsed && onToggleCollapse) onToggleCollapse();
        setCustomWorkbenchViewData(WATCHED_FOLDER_VIEW_ID, { folderId });
        navActions.setWorkbench(WATCHED_FOLDER_WORKBENCH_ID as any);
      },
      [collapsed, onToggleCollapse, setCustomWorkbenchViewData, navActions],
    );

    // In Watched Folders view, sidebar files can be dragged onto a folder card / drop
    // zone (which read the watchedFolderFileId dataTransfer key).
    const handleWatchedFolderDragStart = useCallback(
      (e: React.DragEvent, fileId: FileId) => {
        e.dataTransfer.setData("watchedFolderFileId", String(fileId));
        e.dataTransfer.effectAllowed = "copy";
        // Publish the id so drop targets can detect "already in folder" during
        // dragover (dataTransfer values are unreadable then). Clear on dragend
        // regardless of whether the drag ended in a drop or was cancelled.
        setWatchedFolderDraggedFileIds([String(fileId)]);
        const clear = () => {
          clearWatchedFolderDraggedFileIds();
          document.removeEventListener("dragend", clear);
        };
        document.addEventListener("dragend", clear);
      },
      [],
    );
    const isMultiTool =
      currentWorkbench === "pageEditor" && selectedTool === "multiTool";
    const { requestNavigation } = useNavigationGuard();
    const { activeFileId, setActiveFileId } = useViewer();
    const { addFiles } = useFileHandler();
    const indexedDB = useIndexedDB();

    // Each auth layer derives its own displayName from its native user shape.
    // Fall back to the proprietary REST endpoint only when the auth
    // context yields nothing - then to "User" as a generic last resort.
    const { displayName: authDisplayName } = useAuth();
    const [accountUsername, setAccountUsername] = useState<string | null>(null);
    const displayName =
      authDisplayName ?? accountUsername ?? t("auth.displayName.user", "User");

    const profilePictureUrl = useProfilePictureUrl();
    const [pictureFailed, setPictureFailed] = useState(false);
    useEffect(() => setPictureFailed(false), [profilePictureUrl]);
    const showProfilePicture = !!profilePictureUrl && !pictureFailed;

    useEffect(() => {
      if (!config?.enableLogin) {
        setAccountUsername(null);
        return;
      }
      if (authDisplayName) {
        // The auth context has a name; don't bother hitting the REST
        // endpoint, but clear any stale cached value from a prior call.
        setAccountUsername(null);
        return;
      }
      accountService
        .getAccountData()
        .then((data) => {
          // Always reflect the latest result - including clearing it on
          // sign-out, when the endpoint returns no username (or 401s into
          // the catch branch below). Without this, signing out would leave
          // the old username on screen.
          setAccountUsername(data?.username ?? null);
        })
        .catch(() => {
          setAccountUsername(null);
        });
    }, [config?.enableLogin, authDisplayName]);

    // Leaf files = user-visible files (excludes intermediate tool outputs)
    const [allFileStubs, setAllFileStubs] = useState<StirlingFileStub[]>([]);
    const [stubsLoaded, setStubsLoaded] = useState(false);

    const refreshStubs = useCallback(async () => {
      // Leaf files from IDB - same source as the file selection modal.
      const stubs = await indexedDB.loadLeafMetadata();
      const idbIds = new Set(stubs.map((s) => s.id as string));

      // Also include workbench files not yet flushed to IDB.
      const pendingStubs = state.files.ids
        .map((id) => state.files.byId[id])
        .filter(
          (stub): stub is NonNullable<typeof stub> =>
            !!stub && stub.isLeaf !== false && !idbIds.has(stub.id as string),
        );

      const allStubs = [...stubs, ...pendingStubs];
      setAllFileStubs(
        allStubs.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0)),
      );
      setStubsLoaded(true);
    }, [indexedDB, state.files.ids, state.files.byId]);

    // Refresh on mount, workbench changes, or external IndexedDB writes
    const indexedDBRevision = useIndexedDBRevision();
    useEffect(() => {
      refreshStubs();
    }, [refreshStubs, indexedDBRevision]);

    // Once a pending file lands in state, open it in the viewer.
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

    const filteredFileStubs = searchQuery.trim()
      ? allFileStubs.filter((stub) =>
          stub.name.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : allFileStubs;

    // Handle search activation
    const handleSearchClick = useCallback(() => {
      if (onSearchClick) {
        onSearchClick();
        return;
      }
      if (collapsed && onToggleCollapse) {
        onToggleCollapse();
      }
      setSearchActive(true);
    }, [collapsed, onToggleCollapse, onSearchClick]);

    const handleSearchClose = useCallback(() => {
      setSearchActive(false);
      setSearchQuery("");
    }, []);

    useEffect(() => {
      if (searchActive && searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, [searchActive]);

    // Handle Google Drive
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

    // Toggle file in/out of workbench
    const handleFileClick = useCallback(
      async (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        if (!stub) return;

        // In the Watched Folders view a click sends the file into the open folder
        // (mirrors how a click toggles a file into the active workbench elsewhere).
        // On the folder list (no folder open) it's a no-op so browsing isn't disrupted.
        if (isWatchedFoldersActive) {
          if (activeWatchedFolderId) {
            setCustomWorkbenchViewData(WATCHED_FOLDER_VIEW_ID, {
              folderId: activeWatchedFolderId,
              pendingFileId: stub.id,
            });
          }
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
        state.files.ids,
        state.ui.selectedFileIds,
        fileActions,
        navActions,
        currentWorkbench,
        activeFileId,
        requestNavigation,
        isMultiTool,
        isWatchedFoldersActive,
        activeWatchedFolderId,
        setCustomWorkbenchViewData,
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
          viewedWorkbenchId &&
          (viewedWorkbenchId as string) === (stub.id as string)
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
          setPendingViewFileId(stub.id as string);
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

    const handleNativeFilePick = useCallback(
      async (e: React.ChangeEvent<HTMLInputElement>) => {
        // Per-tool validation happens downstream.
        const files = Array.from(e.target.files ?? []);
        if (files.length > 0) {
          if (onUploadFiles) {
            await onUploadFiles(files);
          } else {
            await addFiles(files);
            if (!isMultiTool) {
              navActions.setWorkbench(
                files.length === 1 ? "viewer" : "fileEditor",
              );
            }
          }
        }
        e.target.value = "";
      },
      [addFiles, navActions, isMultiTool, onUploadFiles],
    );

    const shouldHideGoogleDrive =
      !isGoogleDriveEnabled && config?.hideDisabledToolsGoogleDrive;

    const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

    return (
      <div
        ref={ref}
        className="file-sidebar"
        style={{ width, minWidth: width, maxWidth: width }}
        data-collapsed={collapsed}
        data-sidebar="file-sidebar"
        data-tour="quick-access-bar"
      >
        <div className="file-sidebar-inner">
          {/* Header: hamburger + branding */}
          <Tooltip
            label={toggleAriaLabel ?? t("fileSidebar.expand", "Expand sidebar")}
            position="right"
            withinPortal
            disabled={!collapsed}
          >
            <div
              className="file-sidebar-header"
              onClick={() => onToggleCollapse?.()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggleCollapse?.();
                }
              }}
              aria-label={
                toggleAriaLabel ??
                (collapsed
                  ? t("fileSidebar.expand", "Expand sidebar")
                  : t("fileSidebar.collapse", "Collapse sidebar"))
              }
            >
              {/* Wrapper carries sizing; data-toggle-flip-rtl flips icon in RTL. */}
              <span
                className="file-sidebar-menu-icon"
                data-toggle-flip-rtl={toggleIcon ? "true" : undefined}
              >
                {toggleIcon ?? <MenuIcon />}
              </span>
              {!collapsed && (
                <Wordmark
                  alt="Stirling PDF"
                  className="file-sidebar-brand-text sidebar-content-fade"
                />
              )}
            </div>
          </Tooltip>

          {/* Search row */}
          <Tooltip
            label={t("fileSidebar.search", "Search")}
            position="right"
            withinPortal
            disabled={!collapsed}
          >
            <div
              className={`file-sidebar-search-row${searchActive && !collapsed ? " active" : ""}`}
              onClick={!searchActive ? handleSearchClick : undefined}
              role={!searchActive ? "button" : undefined}
              tabIndex={!searchActive ? 0 : undefined}
              onKeyDown={
                !searchActive
                  ? (e) => e.key === "Enter" && handleSearchClick()
                  : undefined
              }
            >
              {searchActive && !collapsed ? (
                <CloseIcon
                  className="file-sidebar-search-icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSearchClose();
                  }}
                />
              ) : (
                <SearchIcon className="file-sidebar-search-icon" />
              )}
              {!collapsed &&
                (searchActive ? (
                  <input
                    ref={searchInputRef}
                    className="file-sidebar-search-input sidebar-content-fade"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t(
                      "fileSidebar.searchPlaceholder",
                      "Search files...",
                    )}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="file-sidebar-search-label sidebar-content-fade">
                    {t("fileSidebar.search", "Search")}
                  </span>
                ))}
            </div>
          </Tooltip>

          {/* Scrollable content */}
          <div className="file-sidebar-scroll">
            {/* Hidden native file input - kept outside the !collapsed gate so
                the "Open from computer" row below (always rendered) can fire
                it in either sidebar state without a silent no-op. */}
            <input
              ref={nativeFileInputRef}
              type="file"
              multiple
              // No `accept` filter - this picker feeds the global workspace,
              // not a specific tool, so users may legitimately upload PNGs,
              // ZIPs, etc. for the convert/merge/extract tools to handle.
              style={{ display: "none" }}
              onChange={handleNativeFilePick}
              data-testid="file-input"
            />
            {/* Open from Computer + My Files + Google Drive */}
            {/* Tooltips only fire when collapsed - when expanded the visible
                text label below already identifies each row, so a tooltip
                would just flash a duplicate. Distinct icons (UploadFile for
                "Open from computer" vs FolderOpen for "My Files") so the
                collapsed rail isn't two identical folder icons either. */}
            <Tooltip
              label={t("fileSidebar.openFromComputer", "Open from computer")}
              position="right"
              withinPortal
              disabled={!collapsed}
            >
              <div
                className="file-sidebar-action-row"
                // `files-button` is the long-standing upload entry-point
                // testid: click + setInputFiles on `file-input` above. Tour
                // anchor lives here too - the tour now spotlights the native
                // picker shortcut rather than the old modal.
                data-testid="files-button"
                data-tour="files-button"
                onClick={() => {
                  // "Open from computer" goes straight to the native OS file
                  // picker. The full file manager (recent + drives + folders)
                  // is reachable via "My Files" below.
                  nativeFileInputRef.current?.click();
                }}
                role="button"
                tabIndex={0}
                aria-label={t(
                  "fileSidebar.openFromComputer",
                  "Open from computer",
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    nativeFileInputRef.current?.click();
                  }
                }}
              >
                <UploadFileIcon className="file-sidebar-action-icon" />
                {!collapsed && (
                  <span className="file-sidebar-action-label sidebar-content-fade">
                    {t("fileSidebar.openFromComputer", "Open from computer")}
                  </span>
                )}
              </div>
            </Tooltip>

            {extraAction && (
              <Tooltip
                label={extraAction.disabledTooltip ?? extraAction.label}
                position="right"
                withinPortal
                // Only force a wide multiline box when the long disabled
                // reason is shown; the short label fits one line.
                multiline={Boolean(
                  extraAction.disabled && extraAction.disabledTooltip,
                )}
                w={
                  extraAction.disabled && extraAction.disabledTooltip
                    ? 220
                    : undefined
                }
                disabled={
                  !collapsed &&
                  !(extraAction.disabled && extraAction.disabledTooltip)
                }
              >
                <div
                  className={`file-sidebar-action-row${extraAction.disabled ? " disabled" : ""}`}
                  data-testid={extraAction.testId}
                  onClick={() => {
                    if (extraAction.disabled) return;
                    extraAction.onClick();
                  }}
                  role="button"
                  tabIndex={extraAction.disabled ? -1 : 0}
                  aria-disabled={extraAction.disabled}
                  aria-label={extraAction.label}
                  onKeyDown={(e) => {
                    if (extraAction.disabled) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      extraAction.onClick();
                    }
                  }}
                >
                  <span className="file-sidebar-action-icon">
                    {extraAction.icon}
                  </span>
                  {!collapsed && (
                    <span className="file-sidebar-action-label sidebar-content-fade">
                      {extraAction.label}
                    </span>
                  )}
                </div>
              </Tooltip>
            )}

            <Tooltip
              label={t("fileSidebar.myFiles", "My Files")}
              position="right"
              withinPortal
              disabled={!collapsed}
            >
              <div
                className="file-sidebar-action-row"
                data-testid="my-files-button"
                onClick={() => {
                  if (collapsed && onToggleCollapse) onToggleCollapse();
                  navigate("/files");
                }}
                role="button"
                tabIndex={0}
                aria-label={t("fileSidebar.myFiles", "My Files")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate("/files");
                  }
                }}
              >
                <FolderOpenIcon className="file-sidebar-action-icon" />
                {!collapsed && (
                  <span className="file-sidebar-action-label sidebar-content-fade">
                    {t("fileSidebar.myFiles", "My Files")}
                  </span>
                )}
              </div>
            </Tooltip>

            {!shouldHideGoogleDrive && (
              <Tooltip
                label={
                  !isGoogleDriveEnabled
                    ? t(
                        "fileSidebar.googleDriveDisabled",
                        "Google Drive is not configured",
                      )
                    : t("fileSidebar.googleDrive", "Open from Google Drive")
                }
                position="right"
                withinPortal
                disabled={!collapsed}
              >
                <div
                  className={`file-sidebar-cloud-row${!isGoogleDriveEnabled ? " disabled" : ""}`}
                  onClick={handleGoogleDriveClick}
                  role="button"
                  tabIndex={isGoogleDriveEnabled ? 0 : -1}
                  aria-disabled={!isGoogleDriveEnabled}
                  aria-label={
                    !isGoogleDriveEnabled
                      ? t(
                          "fileSidebar.googleDriveDisabled",
                          "Google Drive is not configured",
                        )
                      : t("fileSidebar.googleDrive", "Open from Google Drive")
                  }
                >
                  <div className="file-sidebar-cloud-icon-wrapper">
                    <GoogleDriveIcon
                      className="file-sidebar-cloud-icon-gray"
                      style={{ color: "var(--text-secondary)" }}
                    />
                    {isGoogleDriveEnabled && (
                      <GoogleDriveIcon
                        colored
                        className="file-sidebar-cloud-icon-color"
                      />
                    )}
                  </div>
                  {!collapsed && (
                    <span className="file-sidebar-action-label sidebar-content-fade">
                      {t("fileSidebar.googleDrive", "Google Drive")}
                    </span>
                  )}
                </div>
              </Tooltip>
            )}

            {/* Watched Folders entry */}
            {WATCHED_FOLDERS_ENABLED && (
              <div
                className="file-sidebar-action-row"
                data-testid="watchedFolders-button"
                data-active={isWatchedFoldersActive}
                onClick={openWatchedFolders}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && openWatchedFolders()}
                aria-label={t("watchedFolders.sidebarTitle", "Watched Folders")}
                style={
                  isWatchedFoldersActive
                    ? { backgroundColor: "var(--active-bg)" }
                    : undefined
                }
              >
                <FolderSpecialIcon className="file-sidebar-action-icon" />
                {!collapsed && (
                  <span className="file-sidebar-action-label sidebar-content-fade">
                    {t("watchedFolders.sidebarTitle", "Watched Folders")}
                  </span>
                )}
              </div>
            )}

            {/* Files section - always visible when expanded */}
            {!collapsed && (
              <div className="file-sidebar-files-section sidebar-content-fade">
                <div className="file-sidebar-section-header">
                  <span className="file-sidebar-section-label">
                    {t("fileSidebar.files", "Files")}
                  </span>
                  <button
                    className="file-sidebar-section-btn file-sidebar-section-btn-external"
                    onClick={() => navigate("/files")}
                    title={t(
                      "fileSidebar.openFileManager",
                      "Browse all files & folders",
                    )}
                    type="button"
                    data-testid="open-files-page"
                  >
                    <OpenInNewIcon sx={{ fontSize: "1rem" }} />
                  </button>
                  <button
                    className="file-sidebar-section-btn file-sidebar-section-btn-add"
                    onClick={() => nativeFileInputRef.current?.click()}
                    title={t("fileSidebar.addFiles", "Add files")}
                    type="button"
                  >
                    <AddIcon sx={{ fontSize: "1rem" }} />
                  </button>
                </div>

                {!stubsLoaded ? (
                  <div className="file-sidebar-loading">
                    <Loader size="sm" color="var(--text-muted)" />
                  </div>
                ) : filteredFileStubs.length > 0 ? (
                  <div className="file-sidebar-file-list">
                    {filteredFileStubs.map((stub) => {
                      const workbenchFileId = state.files.ids.find(
                        (id) => (id as string) === (stub.id as string),
                      );
                      const isInWorkbench = !!workbenchFileId;
                      // On Watched Folders, the tick means "this file is already in
                      // the open folder"; on the folder home (no folder open) a
                      // click is a no-op, so show no tick at all.
                      const isSelected = isWatchedFoldersActive
                        ? activeWatchedFolderId != null &&
                          (folderMembership
                            .get(stub.id as string)
                            ?.includes(activeWatchedFolderId) ??
                            false)
                        : isInWorkbench;
                      // Membership dots only on the Watched Folders home (the folder
                      // grid, no folder open). Inside a specific folder the tick
                      // already shows "in this folder"; in other views they'd just
                      // be noise.
                      const showFolderDots =
                        WATCHED_FOLDERS_ENABLED &&
                        isWatchedFoldersActive &&
                        activeWatchedFolderId === null;
                      const memberFolders = showFolderDots
                        ? (folderMembership.get(stub.id as string) ?? [])
                            .map((fid) => folderById.get(fid))
                            .filter((f): f is NonNullable<typeof f> => !!f)
                            .map((f) => ({
                              id: f.id,
                              name: f.name,
                              accentColor: f.accentColor,
                            }))
                        : [];
                      // Both active and viewed-in-viewer are ID-based - never index-based.
                      const isViewedInViewer = !!(
                        viewedWorkbenchId &&
                        viewedWorkbenchId === (stub.id as string)
                      );
                      const isActive = isViewedInViewer;
                      // In-memory thumbnail may be fresher than the IndexedDB stub.
                      // Encrypted files never get a raster thumbnail - use undefined
                      // so the sidebar icon is shown instead of a stale canvas thumbnail.
                      const isEncryptedFile =
                        stub.processedFile?.isEncrypted === true;
                      const thumbnailUrl = isEncryptedFile
                        ? undefined
                        : (workbenchFileId
                            ? state.files.byId[workbenchFileId]?.thumbnailUrl
                            : undefined) || stub.thumbnailUrl;
                      return (
                        <FileItem
                          key={stub.id}
                          fileId={stub.id}
                          name={stub.name}
                          size={stub.size}
                          lastModified={stub.lastModified}
                          isSelected={isSelected}
                          isActive={isActive}
                          isViewedInViewer={isViewedInViewer}
                          thumbnailUrl={thumbnailUrl}
                          onClick={handleFileClick}
                          onEyeClick={handleEyeClick}
                          draggable={isWatchedFoldersActive}
                          onDragStart={handleWatchedFolderDragStart}
                          folders={memberFolders}
                          onFolderClick={openWatchedFolder}
                          policies={
                            policyFileBadges.get(stub.id as string) ?? []
                          }
                        />
                      );
                    })}
                  </div>
                ) : (
                  !searchActive && (
                    <div className="file-sidebar-empty">
                      <p className="file-sidebar-empty-text">
                        {t("fileSidebar.noFiles", "No files yet")}
                      </p>
                      <p className="file-sidebar-empty-hint">
                        {t("fileSidebar.dropHint", "Open files to get started")}
                      </p>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar: user name + settings */}
        <Tooltip
          label={
            onOpenSettings
              ? `${displayName} - ${t("fileSidebar.openSettings", "Open settings")}`
              : displayName
          }
          position="right"
          withinPortal
          disabled={!collapsed}
        >
          <div
            className="file-sidebar-bottom-bar"
            onClick={onOpenSettings}
            role={onOpenSettings ? "button" : undefined}
            tabIndex={onOpenSettings ? 0 : undefined}
            onKeyDown={
              onOpenSettings
                ? (e) => e.key === "Enter" && onOpenSettings()
                : undefined
            }
            data-testid={onOpenSettings ? "config-button" : undefined}
            data-tour={onOpenSettings ? "config-button" : undefined}
            aria-label={
              onOpenSettings
                ? t("fileSidebar.openSettings", "Open settings")
                : displayName
            }
            style={onOpenSettings ? { cursor: "pointer" } : undefined}
          >
            <div
              className={`file-sidebar-bottom-avatar${
                showProfilePicture ? " file-sidebar-bottom-avatar--picture" : ""
              }`}
              aria-label={displayName}
            >
              {showProfilePicture ? (
                <img
                  src={profilePictureUrl}
                  alt=""
                  className="file-sidebar-bottom-avatar-img"
                  onError={() => setPictureFailed(true)}
                />
              ) : (
                displayName.charAt(0).toUpperCase()
              )}
            </div>
            {!collapsed && (
              <span className="file-sidebar-bottom-name sidebar-content-fade">
                {displayName}
              </span>
            )}
            {onOpenSettings && !collapsed && (
              <div className="file-sidebar-bottom-settings">
                <SettingsIcon sx={{ fontSize: "1.1rem" }} />
              </div>
            )}
          </div>
        </Tooltip>
      </div>
    );
  },
);

export default FileSidebar;
