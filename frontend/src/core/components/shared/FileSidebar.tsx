import React, { useState, useCallback, useRef, useEffect, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { useFileState, useFileActions } from "@app/contexts/file/fileHooks";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useGoogleDrivePicker } from "@app/hooks/useGoogleDrivePicker";
import { useNavigationState, useNavigationActions } from "@app/contexts/NavigationContext";
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

const COLLAPSED_WIDTH = 56;
const EXPANDED_WIDTH = 260;

export interface FileSidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenSettings?: () => void;
}

const FileSidebar = forwardRef<HTMLDivElement, FileSidebarProps>(function FileSidebar(
  { collapsed = false, onToggleCollapse, onOpenSettings },
  ref,
) {
  const { t } = useTranslation();
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const nativeFileInputRef = useRef<HTMLInputElement>(null);

  const { openFilesModal } = useFilesModalContext();
  const { config } = useAppConfig();
  const { isEnabled: isGoogleDriveEnabled, openPicker: openGoogleDrivePicker } = useGoogleDrivePicker();
  const { state } = useFileState();
  const { actions: fileActions } = useFileActions();
  const { actions: navActions } = useNavigationActions();
  const { workbench: currentWorkbench } = useNavigationState();
  const { activeFileIndex, setActiveFileIndex } = useViewer();
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

  const refreshStubs = useCallback(async () => {
    const stubs = await indexedDB.loadLeafMetadata();
    const workbenchIdSet = new Set(state.files.ids);

    // Merge in workbench files that aren't persisted to IndexedDB yet
    const idbQuickKeys = new Set(stubs.map((s) => s.quickKey).filter(Boolean) as string[]);
    const pendingStubs = state.files.ids
      .map((id) => state.files.byId[id])
      .filter(
        (stub): stub is NonNullable<typeof stub> =>
          !!stub && stub.isLeaf !== false && (!stub.quickKey || !idbQuickKeys.has(stub.quickKey)),
      );

    const allStubs = [...stubs, ...pendingStubs];

    // Sort: workbench entries first (keep those on dedup collision), then newest first
    const sorted = [...allStubs].sort((a, b) => {
      const aW = workbenchIdSet.has(a.id) ? 1 : 0;
      const bW = workbenchIdSet.has(b.id) ? 1 : 0;
      if (bW !== aW) return bW - aW;
      return (b.lastModified ?? 0) - (a.lastModified ?? 0);
    });

    const seenKeys = new Set<string>();
    const toDelete: FileId[] = [];
    const deduped = sorted.filter((stub) => {
      if (!stub.quickKey) return true;
      if (seenKeys.has(stub.quickKey)) {
        toDelete.push(stub.id); // older / non-workbench duplicate
        return false;
      }
      seenKeys.add(stub.quickKey);
      return true;
    });

    // Purge duplicate IndexedDB entries so the file manager modal also shows clean list
    if (toDelete.length > 0) {
      await indexedDB.deleteMultiple(toDelete);
    }

    setAllFileStubs(deduped.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0)));
  }, [indexedDB, state.files.ids, state.files.byId]);

  // Refresh on mount, workbench changes, or external IndexedDB writes
  useEffect(() => {
    refreshStubs();
  }, [refreshStubs, state.files.ids.length, indexedDB.revision]);

  // quickKey is stable across re-adds (fileId changes, quickKey doesn't)
  const workbenchQuickKeySet = new Set(
    state.files.ids.map((id) => state.files.byId[id]?.quickKey).filter(Boolean) as string[],
  );

  const filteredFileStubs = searchQuery.trim()
    ? allFileStubs.filter((stub) => stub.name.toLowerCase().includes(searchQuery.toLowerCase()))
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
      addFiles(files);
    }
  }, [isGoogleDriveEnabled, openGoogleDrivePicker, addFiles]);

  // Toggle file in/out of workbench
  const handleFileClick = useCallback(
    async (fileId: FileId) => {
      const stub = allFileStubs.find((s) => s.id === fileId);
      if (!stub) return;

      // Find the workbench entry by quickKey (fileId may differ after re-adding)
      const workbenchFileId = state.files.ids.find((id) => state.files.byId[id]?.quickKey === stub.quickKey);

      if (workbenchFileId) {
        // Remove from workbench, keep in IndexedDB
        await fileActions.removeFiles([workbenchFileId], false);
      } else {
        // Load from IndexedDB and add to workbench
        const file = await indexedDB.loadFile(fileId);
        if (!file) return;

        const workbenchCount = state.files.ids.length;

        // If viewer is mounted and we're adding a 2nd+ file, navigate away first
        // so the viewer unmounts before FileContext updates (avoids PSPDFKit viewport crash)
        if (workbenchCount > 0 && currentWorkbench === "viewer") {
          navActions.setWorkbench("fileEditor");
        }

        await addFiles([file]);

        if (workbenchCount === 0) {
          navActions.setWorkbench("viewer");
        } else {
          navActions.setWorkbench("fileEditor");
        }
      }
    },
    [allFileStubs, state.files, fileActions, indexedDB, addFiles, navActions, currentWorkbench],
  );

  // Determine which stub is currently open in the viewer
  const viewedWorkbenchId = currentWorkbench === "viewer" ? state.files.ids[activeFileIndex] : undefined;
  const viewedQuickKey = viewedWorkbenchId ? state.files.byId[viewedWorkbenchId]?.quickKey : undefined;

  const handleEyeClick = useCallback(
    async (fileId: FileId, _e: React.MouseEvent) => {
      const stub = allFileStubs.find((s) => s.id === fileId);
      if (!stub) return;

      const isCurrentlyViewed = !!(viewedQuickKey && stub.quickKey === viewedQuickKey);

      if (isCurrentlyViewed) {
        // Close viewer: switch to file editor
        navActions.setWorkbench("fileEditor");
        return;
      }

      // Find if file is already in workbench
      const workbenchFileId = state.files.ids.find((id) => state.files.byId[id]?.quickKey === stub.quickKey);

      if (workbenchFileId) {
        // Already loaded — just switch to viewer and set active index
        const idx = state.files.ids.indexOf(workbenchFileId);
        setActiveFileIndex(idx);
        navActions.setWorkbench("viewer");
      } else {
        // Load from IndexedDB and add to workbench
        const file = await indexedDB.loadFile(fileId);
        if (!file) return;

        if (state.files.ids.length > 0 && currentWorkbench === "viewer") {
          navActions.setWorkbench("fileEditor");
        }

        await addFiles([file]);
        navActions.setWorkbench("viewer");
      }
    },
    [allFileStubs, viewedQuickKey, state.files, navActions, setActiveFileIndex, indexedDB, addFiles, currentWorkbench],
  );

  const handleNativeFilePick = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) {
        await addFiles(files);
      }
      e.target.value = "";
    },
    [addFiles],
  );

  const shouldHideGoogleDrive = !isGoogleDriveEnabled && config?.hideDisabledToolsGoogleDrive;

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
          aria-label={collapsed ? t("fileSidebar.expand", "Expand sidebar") : t("fileSidebar.collapse", "Collapse sidebar")}
        >
          {searchActive && !collapsed ? (
            <CloseIcon className="file-sidebar-menu-icon" />
          ) : (
            <MenuIcon className="file-sidebar-menu-icon" />
          )}
          {!collapsed && <span className="file-sidebar-brand-text sidebar-content-fade">Stirling PDF</span>}
        </div>

        {/* Search row */}
        <div
          className={`file-sidebar-search-row${searchActive && !collapsed ? " active" : ""}`}
          onClick={!searchActive ? handleSearchClick : undefined}
          role={!searchActive ? "button" : undefined}
          tabIndex={!searchActive ? 0 : undefined}
          onKeyDown={!searchActive ? (e) => e.key === "Enter" && handleSearchClick() : undefined}
        >
          <SearchIcon className="file-sidebar-search-icon" />
          {!collapsed &&
            (searchActive ? (
              <input
                ref={searchInputRef}
                className="file-sidebar-search-input sidebar-content-fade"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("fileSidebar.searchPlaceholder", "Search files...")}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="file-sidebar-search-label sidebar-content-fade">{t("fileSidebar.search", "Search")}</span>
            ))}
        </div>

        {/* Scrollable content */}
        <div className="file-sidebar-scroll">
          {/* Open from Computer */}
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

          {/* Google Drive */}
          {!shouldHideGoogleDrive && (
            <div
              className={`file-sidebar-cloud-row${!isGoogleDriveEnabled ? " disabled" : ""}`}
              onClick={handleGoogleDriveClick}
              role="button"
              tabIndex={isGoogleDriveEnabled ? 0 : -1}
              aria-disabled={!isGoogleDriveEnabled}
              title={
                !isGoogleDriveEnabled
                  ? t("fileSidebar.googleDriveDisabled", "Google Drive is not configured")
                  : t("fileSidebar.googleDrive", "Open from Google Drive")
              }
            >
              <div className="file-sidebar-cloud-icon-wrapper">
                <GoogleDriveIcon className="file-sidebar-cloud-icon-gray" style={{ color: "var(--text-secondary)" }} />
                {isGoogleDriveEnabled && <GoogleDriveIcon colored className="file-sidebar-cloud-icon-color" />}
              </div>
              {!collapsed && (
                <span className="file-sidebar-action-label sidebar-content-fade">
                  {t("fileSidebar.googleDrive", "Google Drive")}
                </span>
              )}
            </div>
          )}

          {/* Files section - always visible when expanded */}
          {!collapsed && (
            <div className="file-sidebar-files-section sidebar-content-fade">
              <div className="file-sidebar-section-header">
                <span className="file-sidebar-section-label">{t("fileSidebar.files", "Files")}</span>
                <button
                  className="file-sidebar-section-btn file-sidebar-section-btn-external"
                  onClick={() => openFilesModal()}
                  title={t("fileSidebar.openFileManager", "Open file manager")}
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

              {filteredFileStubs.length > 0 ? (
                <div className="file-sidebar-file-list">
                  {filteredFileStubs.map((stub) => {
                    const isInWorkbench = !!(stub.quickKey && workbenchQuickKeySet.has(stub.quickKey));
                    const workbenchFileId = state.files.ids.find((id) => state.files.byId[id]?.quickKey === stub.quickKey);
                    const workbenchIdx = workbenchFileId ? state.files.ids.indexOf(workbenchFileId) : -1;
                    const isActive = isInWorkbench && workbenchIdx === activeFileIndex;
                    const isViewedInViewer = !!(stub.quickKey && stub.quickKey === viewedQuickKey);
                    // In-memory thumbnail may be fresher than the IndexedDB stub.
                    const thumbnailUrl =
                      (workbenchFileId ? state.files.byId[workbenchFileId]?.thumbnailUrl : undefined) || stub.thumbnailUrl;
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
                    <p className="file-sidebar-empty-text">{t("fileSidebar.noFiles", "No files yet")}</p>
                    <p className="file-sidebar-empty-hint">{t("fileSidebar.dropHint", "Open files to get started")}</p>
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
        onKeyDown={onOpenSettings ? (e) => e.key === "Enter" && onOpenSettings() : undefined}
        aria-label={onOpenSettings ? t("fileSidebar.openSettings", "Open settings") : undefined}
        title={onOpenSettings ? t("fileSidebar.openSettings", "Open settings") : undefined}
        style={onOpenSettings ? { cursor: "pointer" } : undefined}
      >
        {!collapsed && (
          <div className="file-sidebar-bottom-avatar" title={displayName}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        {!collapsed && <span className="file-sidebar-bottom-name sidebar-content-fade">{displayName}</span>}
        {onOpenSettings && (
          <div className="file-sidebar-bottom-settings">
            <SettingsIcon sx={{ fontSize: "1.1rem" }} />
          </div>
        )}
      </div>
    </div>
  );
});

export default FileSidebar;
