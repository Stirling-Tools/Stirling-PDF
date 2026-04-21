import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  forwardRef,
} from "react";
import { Loader } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useFileState, useFileActions } from "@app/contexts/file/fileHooks";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useGoogleDrivePicker } from "@app/hooks/useGoogleDrivePicker";
import {
  useNavigationState,
  useNavigationActions,
  useNavigationGuard,
} from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";
import { accountService } from "@app/services/accountService";
import { GoogleDriveIcon } from "@app/components/shared/CloudStorageIcons";
import type { StirlingFileStub } from "@app/types/fileContext";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SettingsIcon from "@mui/icons-material/Settings";
import type { FileId } from "@app/types/file";
import { FileItem } from "@app/components/shared/FileSidebarFileItem";
import "@app/components/shared/FileSidebar.css";

const COLLAPSED_WIDTH = "3.5rem";
const EXPANDED_WIDTH = "16.25rem"; // ~260px

export interface FileSidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenSettings?: () => void;
}

const FileSidebar = forwardRef<HTMLDivElement, FileSidebarProps>(
  function FileSidebar(
    { collapsed = false, onToggleCollapse, onOpenSettings },
    ref,
  ) {
    const { t } = useTranslation();
    const [searchActive, setSearchActive] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const searchInputRef = useRef<HTMLInputElement>(null);
    const nativeFileInputRef = useRef<HTMLInputElement>(null);
    // State (not ref) so setting it triggers a re-render — avoids racing addFiles state updates.
    const [pendingViewFileId, setPendingViewFileId] = useState<string | null>(
      null,
    );

    const { openFilesModal } = useFilesModalContext();
    const { config } = useAppConfig();
    const {
      isEnabled: isGoogleDriveEnabled,
      openPicker: openGoogleDrivePicker,
    } = useGoogleDrivePicker();
    const { state } = useFileState();
    const { actions: fileActions } = useFileActions();
    const { actions: navActions } = useNavigationActions();
    const { workbench: currentWorkbench } = useNavigationState();
    const { requestNavigation } = useNavigationGuard();
    const { activeFileId, setActiveFileId } = useViewer();
    const { addFiles } = useFileHandler();
    const indexedDB = useIndexedDB();
    const [displayName, setDisplayName] = useState<string>("Guest");

    useEffect(() => {
      if (!config?.enableLogin) return;
      accountService
        .getAccountData()
        .then((data) => {
          if (data?.username) setDisplayName(data.username);
        })
        .catch(() => {
          /* not logged in or security disabled */
        });
    }, [config?.enableLogin]);

    // Leaf files = user-visible files (excludes intermediate tool outputs)
    const [allFileStubs, setAllFileStubs] = useState<StirlingFileStub[]>([]);
    const [stubsLoaded, setStubsLoaded] = useState(false);

    const refreshStubs = useCallback(async () => {
      // Leaf files from IDB — same source as the file selection modal.
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
    useEffect(() => {
      refreshStubs();
    }, [refreshStubs, indexedDB.revision]);

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
      if (collapsed && onToggleCollapse) {
        onToggleCollapse();
      }
      setSearchActive(true);
    }, [collapsed, onToggleCollapse]);

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
      if (files.length > 0) {
        await addFiles(files);
        navActions.setWorkbench(files.length === 1 ? "viewer" : "fileEditor");
      }
    }, [isGoogleDriveEnabled, openGoogleDrivePicker, addFiles, navActions]);

    // Toggle file in/out of workbench
    const handleFileClick = useCallback(
      async (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        if (!stub) return;

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
          // Re-add by stub to preserve its ID — addFiles() would create a new UUID + IDB entry.
          const workbenchCount = state.files.ids.length;

          if (workbenchCount > 0 && currentWorkbench === "viewer") {
            navActions.setWorkbench("fileEditor");
          }

          await fileActions.addStirlingFileStubs([stub]);

          if (workbenchCount === 0) {
            navActions.setWorkbench("viewer");
          } else {
            navActions.setWorkbench("fileEditor");
          }
        }
      },
      [
        allFileStubs,
        state.files.ids,
        fileActions,
        navActions,
        currentWorkbench,
        activeFileId,
        requestNavigation,
      ],
    );

    // Which file is currently open in the viewer — stable ID, never index-derived.
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
          // Closing the currently-viewed file — guard against unsaved changes.
          navActions.setWorkbench("fileEditor");
          return;
        }

        // Switching to a different file while viewer is open — guard against unsaved changes.
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
        const files = Array.from(e.target.files ?? []);
        if (files.length > 0) {
          await addFiles(files);
          navActions.setWorkbench(files.length === 1 ? "viewer" : "fileEditor");
        }
        e.target.value = "";
      },
      [addFiles, navActions],
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
      >
        <div className="file-sidebar-inner">
          {/* Header: hamburger + branding */}
          <div
            className="file-sidebar-header"
            onClick={() => {
              if (searchActive) {
                handleSearchClose();
              } else {
                onToggleCollapse?.();
              }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onToggleCollapse?.()}
            aria-label={
              collapsed
                ? t("fileSidebar.expand", "Expand sidebar")
                : t("fileSidebar.collapse", "Collapse sidebar")
            }
          >
            {searchActive && !collapsed ? (
              <CloseIcon className="file-sidebar-menu-icon" />
            ) : (
              <MenuIcon className="file-sidebar-menu-icon" />
            )}
            {!collapsed && (
              <span className="file-sidebar-brand-text sidebar-content-fade">
                Stirling PDF
              </span>
            )}
          </div>

          {/* Search row */}
          {
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
              <SearchIcon className="file-sidebar-search-icon" />
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
          }

          {/* Scrollable content */}
          <div className="file-sidebar-scroll">
            {/* Open from Computer + Google Drive */}
            {
              <>
                <div
                  className="file-sidebar-action-row"
                  onClick={() => {
                    if (collapsed && onToggleCollapse) onToggleCollapse();
                    openFilesModal();
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && openFilesModal()}
                >
                  <FolderOpenIcon className="file-sidebar-action-icon" />
                  {!collapsed && (
                    <span className="file-sidebar-action-label sidebar-content-fade">
                      {t("fileSidebar.openFromComputer", "Open from computer")}
                    </span>
                  )}
                </div>

                {!shouldHideGoogleDrive && (
                  <div
                    className={`file-sidebar-cloud-row${!isGoogleDriveEnabled ? " disabled" : ""}`}
                    onClick={handleGoogleDriveClick}
                    role="button"
                    tabIndex={isGoogleDriveEnabled ? 0 : -1}
                    aria-disabled={!isGoogleDriveEnabled}
                    title={
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
                )}
              </>
            }

            {/* Files section - always visible when expanded */}
            {!collapsed && (
              <div className="file-sidebar-files-section sidebar-content-fade">
                <div className="file-sidebar-section-header">
                  <span className="file-sidebar-section-label">
                    {t("fileSidebar.files", "Files")}
                  </span>
                  <button
                    className="file-sidebar-section-btn file-sidebar-section-btn-external"
                    onClick={() => openFilesModal()}
                    title={t(
                      "fileSidebar.openFileManager",
                      "Open file manager",
                    )}
                    type="button"
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
                  <input
                    ref={nativeFileInputRef}
                    type="file"
                    multiple
                    accept=".pdf"
                    style={{ display: "none" }}
                    onChange={handleNativeFilePick}
                  />
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
                      // Both active and viewed-in-viewer are ID-based — never index-based.
                      const isViewedInViewer = !!(
                        viewedWorkbenchId &&
                        viewedWorkbenchId === (stub.id as string)
                      );
                      const isActive = isViewedInViewer;
                      // In-memory thumbnail may be fresher than the IndexedDB stub.
                      const thumbnailUrl =
                        (workbenchFileId
                          ? state.files.byId[workbenchFileId]?.thumbnailUrl
                          : undefined) || stub.thumbnailUrl;
                      return (
                        <FileItem
                          key={stub.id}
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
          aria-label={
            onOpenSettings
              ? t("fileSidebar.openSettings", "Open settings")
              : undefined
          }
          title={
            onOpenSettings
              ? t("fileSidebar.openSettings", "Open settings")
              : undefined
          }
          style={onOpenSettings ? { cursor: "pointer" } : undefined}
        >
          <div className="file-sidebar-bottom-avatar" title={displayName}>
            {displayName.charAt(0).toUpperCase()}
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
      </div>
    );
  },
);

export default FileSidebar;
