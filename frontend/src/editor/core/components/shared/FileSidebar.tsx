import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  forwardRef,
  type RefCallback,
} from "react";
import { Loader, Tooltip } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { NavSurface } from "@app/ui/NavSurface";
import { Button } from "@app/ui/Button";
import { Checkbox } from "@app/ui/Checkbox";
import { Icon, type IconName } from "@app/ui/Icon";
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
  type FileSidebarGroup,
} from "@app/components/shared/fileSidebarGrouping";
import BulkUploadToServerModal from "@app/components/shared/BulkUploadToServerModal";
import { getFileOrigin } from "@app/components/filesPage/fileOrigin";
import { VersionHistoryModal } from "@app/components/filesPage/VersionHistoryModal";
import { DeleteFilesDialog } from "@app/components/filesPage/DeleteFilesDialog";
import { RenameFileDialog } from "@app/components/shared/RenameFileDialog";
import { duplicateStoredFile } from "@app/utils/duplicateFile";
import { SidebarChecklistSlot } from "@app/components/shared/SidebarChecklistSlot";
import { SidebarChat } from "@app/components/chat/SidebarChat";
import {
  deleteServerFile,
  type DeleteScope,
} from "@app/services/serverStorageDelete";
import { fileStorage, onRecordUnreadable } from "@app/services/fileStorage";
import { renameStoredFile } from "@app/services/renameStoredFile";
import { downloadFileWithPolicy } from "@app/services/exportWithPolicy";
import { useOpenInNewWindow } from "@app/extensions/openInNewWindow";
import { openSuperSearch } from "@app/components/shared/superSearch/openSuperSearch";
import { alert } from "@app/components/toast";
import { useBulkAddProgress } from "@app/services/bulkAddProgress";
import { useIsScrolled } from "@app/hooks/useIsScrolled";
import { usePolicyFileBadges } from "@app/hooks/usePolicyFileBadges";
import { useCoalescedCallback } from "@app/hooks/useCoalescedCallback";
import { FolderTreeSidebar } from "@app/components/filesPage/FolderTreeSidebar";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import type { FolderId, FolderRecord } from "@app/types/folder";
import { useToolEligibleFileIds } from "@app/contexts/ToolFileEligibilityContext";
import { useWorkbenchFileDrop } from "@app/components/layout/useWorkbenchFileDrop";
import { useDamagedFileRepair } from "@app/contexts/DamagedFileRepairContext";
import "@app/components/shared/FileSidebar.css";

// Shared with the processor sidebar via tokens, so the two cannot drift.
const SIDEBAR_WIDTH = "var(--sidebar-w)";

// Stable empty props for rows without policies, so the memoized
// FileItem isn't re-rendered by a fresh `?? []` identity on every list render.
const NO_POLICIES: never[] = [];

/** Show pre-dispatch progress only for large drops; small imports finish before it paints. */
const BULK_ADD_INDICATOR_MIN = 8;

/** A cloud copy this user may delete, which turns a delete into a scope choice. */
function hasDeletableCloudCopy(
  stub: StirlingFileStub,
): stub is StirlingFileStub & { remoteStorageId: number } {
  return (
    typeof stub.remoteStorageId === "number" &&
    stub.remoteOwnedByCurrentUser === true
  );
}

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

type SidebarAction = NonNullable<FileSidebarProps["extraActions"]>[number];

function SidebarActionRow({ action }: { action: SidebarAction }) {
  if (action.render) return <>{action.render()}</>;
  const explainsDisabled = Boolean(action.disabled && action.disabledTooltip);
  return (
    <Tooltip
      label={action.disabledTooltip ?? action.label}
      position="right"
      withinPortal
      multiline={explainsDisabled}
      w={explainsDisabled ? 220 : undefined}
      // The tooltip explains why an already-labelled action is disabled.
      disabled={!explainsDisabled}
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
        <span className="file-sidebar-action-icon">{action.icon}</span>
        <span className="file-sidebar-action-label sidebar-content-fade">
          {action.label}
        </span>
      </div>
    </Tooltip>
  );
}

interface LibrarySelection {
  active: boolean;
  selectedCount: number;
  onStart: () => void;
  onSelectAll: () => void;
  onClear: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

interface LibraryHeaderProps {
  stubs: StirlingFileStub[];
  scrolled: boolean;
  isGoogleDriveEnabled: boolean;
  onGoogleDrive: () => void;
  onAddFiles: () => void;
  onOpenFilesPage: () => void;
  selection: LibrarySelection;
}

function SelectionHeader({
  scrolled,
  total,
  selection,
}: {
  scrolled: boolean;
  total: number;
  selection: LibrarySelection;
}) {
  const { t } = useTranslation();
  const { selectedCount } = selection;
  const allSelected = total > 0 && selectedCount === total;
  return (
    <div
      className="file-sidebar-section-header"
      data-scrolled={scrolled || undefined}
      data-testid="file-sidebar-selection-header"
    >
      <Checkbox
        checked={allSelected}
        indeterminate={selectedCount > 0 && !allSelected}
        onChange={allSelected ? selection.onClear : selection.onSelectAll}
        aria-label={t("fileSidebar.selection.selectAll", "Select all")}
        data-testid="file-sidebar-select-all"
      />
      <span className="file-sidebar-section-label">
        {t("fileSidebar.selection.count", "{{count}} selected", {
          count: selectedCount,
        })}
      </span>
      <div className="file-sidebar-selection-actions">
        <ActionIcon
          variant="quiet"
          className="file-sidebar-section-btn"
          onClick={selection.onDelete}
          disabled={selectedCount === 0}
          title={t("fileSidebar.selection.delete", "Delete selected")}
          aria-label={t("fileSidebar.selection.delete", "Delete selected")}
          data-testid="file-sidebar-delete-selected"
        >
          <Icon name="trash" size={"1rem"} />
        </ActionIcon>
        <ActionIcon
          variant="quiet"
          className="file-sidebar-section-btn"
          onClick={selection.onCancel}
          title={t("fileSidebar.selection.cancel", "Cancel selection")}
          aria-label={t("fileSidebar.selection.cancel", "Cancel selection")}
          data-testid="file-sidebar-cancel-selection"
        >
          <Icon name="x" size={"1rem"} />
        </ActionIcon>
      </div>
    </div>
  );
}

function LibraryHeader({
  stubs,
  scrolled,
  isGoogleDriveEnabled,
  onGoogleDrive,
  onAddFiles,
  onOpenFilesPage,
  selection,
}: LibraryHeaderProps) {
  const { t } = useTranslation();
  if (selection.active) {
    return (
      <SelectionHeader
        scrolled={scrolled}
        total={stubs.length}
        selection={selection}
      />
    );
  }
  return (
    <div
      className="file-sidebar-section-header"
      data-scrolled={scrolled || undefined}
    >
      <span className="file-sidebar-section-label">
        {t("fileSidebar.library", "PDF Library")}
      </span>
      <FileSidebarGroupControls stubs={stubs} />
      <ActionIcon
        variant="quiet"
        className="file-sidebar-section-btn file-sidebar-section-btn-external"
        onClick={onOpenFilesPage}
        title={t("fileSidebar.openFileManager", "Browse all files & folders")}
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
      {stubs.length > 0 && (
        <ActionIcon
          variant="quiet"
          className="file-sidebar-section-btn"
          onClick={selection.onStart}
          title={t("fileSidebar.selection.start", "Select files")}
          aria-label={t("fileSidebar.selection.start", "Select files")}
          data-testid="file-sidebar-start-selection"
        >
          <Icon name="list-checks" size={"1rem"} />
        </ActionIcon>
      )}
      {isGoogleDriveEnabled && (
        <ActionIcon
          variant="quiet"
          className="file-sidebar-section-btn file-sidebar-section-btn-drive"
          onClick={onGoogleDrive}
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
        onClick={onAddFiles}
        title={t("fileSidebar.addFiles", "Add files")}
        aria-label={t("fileSidebar.addFiles", "Add files")}
      >
        <Icon name="plus" size={"1rem"} />
      </ActionIcon>
    </div>
  );
}

interface FileGroupSymbolProps {
  icon?: IconName;
  color?: string;
  isOpen: boolean;
}

function FileGroupSymbol({ icon, color, isOpen }: FileGroupSymbolProps) {
  return (
    <span
      className="file-sidebar-group-symbol"
      data-has-icon={!!icon}
      aria-hidden="true"
    >
      {icon && (
        <Icon
          name={icon}
          size="1.05rem"
          className="file-sidebar-group-icon"
          style={color ? { color } : undefined}
        />
      )}
      <Icon
        name={isOpen ? "chevron-down" : "chevron-right"}
        size="1.1rem"
        className="file-sidebar-group-disclosure"
      />
    </span>
  );
}

type RenderFileRow = (stub: StirlingFileStub) => React.ReactNode;

interface FileGroupProps {
  group: FileSidebarGroup;
  isOpen: boolean;
  onToggle: () => void;
  renderFileRow: RenderFileRow;
}

function FileGroup({ group, isOpen, onToggle, renderFileRow }: FileGroupProps) {
  return (
    <div className="file-sidebar-group">
      <Button
        variant="quiet"
        fullWidth
        justify="between"
        className="file-sidebar-group-header"
        onClick={onToggle}
        aria-expanded={isOpen}
        leftSection={
          <FileGroupSymbol
            icon={group.icon}
            color={group.color}
            isOpen={isOpen}
          />
        }
        rightSection={
          <span className="file-sidebar-group-count">{group.stubs.length}</span>
        }
      >
        <span className="file-sidebar-group-label">{group.label}</span>
      </Button>
      <div className="file-sidebar-group-items">
        {isOpen && group.stubs.map(renderFileRow)}
      </div>
    </div>
  );
}

interface GroupedFileListProps {
  groups: FileSidebarGroup[];
  /** Owned by the sidebar so collapse state survives visits to the files page. */
  groupOpen: Record<string, boolean>;
  onGroupOpenChange: (id: string, open: boolean) => void;
  renderFileRow: RenderFileRow;
  total: number;
  onViewAll: () => void;
}

function GroupedFileList({
  groups,
  groupOpen,
  onGroupOpenChange,
  renderFileRow,
  total,
  onViewAll,
}: GroupedFileListProps) {
  const { t } = useTranslation();
  return (
    <>
      {groups.map((group) => {
        const isOpen = groupOpen[group.id] ?? group.defaultExpanded;
        return (
          <FileGroup
            key={group.id}
            group={group}
            isOpen={isOpen}
            onToggle={() => onGroupOpenChange(group.id, !isOpen)}
            renderFileRow={renderFileRow}
          />
        );
      })}
      <Button
        variant="quiet"
        fullWidth
        justify="between"
        className="file-sidebar-view-all"
        onClick={onViewAll}
        rightSection={<Icon name="chevron-right" size={"1rem"} />}
      >
        {t("fileSidebar.viewAll", "View all {{count}} files", {
          count: total,
        })}
      </Button>
    </>
  );
}

interface LibraryFileListProps extends Omit<
  GroupedFileListProps,
  "groups" | "total" | "onViewAll"
> {
  loaded: boolean;
  stubs: StirlingFileStub[];
  groups: FileSidebarGroup[] | null;
  scrollRef: RefCallback<HTMLElement>;
  onOpenFilesPage: () => void;
}

function LibraryFileList({
  loaded,
  stubs,
  groups,
  scrollRef,
  onOpenFilesPage,
  ...grouping
}: LibraryFileListProps) {
  const { t } = useTranslation();
  if (!loaded) {
    return (
      <div className="file-sidebar-loading">
        <Loader size="sm" color="var(--c-text-subtle)" />
      </div>
    );
  }
  if (stubs.length === 0) {
    return (
      <div className="file-sidebar-empty">
        <p className="file-sidebar-empty-text">
          {t("fileSidebar.noFiles", "No files yet")}
        </p>
        <p className="file-sidebar-empty-hint">
          {t("fileSidebar.dropHint", "Open files to get started")}
        </p>
      </div>
    );
  }
  return (
    <div className="file-sidebar-file-list" ref={scrollRef}>
      {groups ? (
        <GroupedFileList
          groups={groups}
          total={stubs.length}
          onViewAll={onOpenFilesPage}
          {...grouping}
        />
      ) : (
        stubs.map(grouping.renderFileRow)
      )}
    </div>
  );
}

interface FileLibrarySectionProps extends Omit<
  LibraryFileListProps,
  "scrollRef"
> {
  isGoogleDriveEnabled: boolean;
  onGoogleDrive: () => void;
  onAddFiles: () => void;
  selection: LibrarySelection;
}

function FileLibrarySection({
  isGoogleDriveEnabled,
  onGoogleDrive,
  onAddFiles,
  selection,
  ...list
}: FileLibrarySectionProps) {
  const { scrolled, scrollRef } = useIsScrolled();
  return (
    <div className="file-sidebar-files-section sidebar-content-fade">
      <LibraryHeader
        stubs={list.stubs}
        scrolled={scrolled}
        isGoogleDriveEnabled={isGoogleDriveEnabled}
        onGoogleDrive={onGoogleDrive}
        onAddFiles={onAddFiles}
        onOpenFilesPage={list.onOpenFilesPage}
        selection={selection}
      />
      <BulkAddProgressRow />
      <LibraryFileList scrollRef={scrollRef} {...list} />
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

    const { config } = useAppConfig();
    const {
      isEnabled: isGoogleDriveEnabled,
      openPicker: openGoogleDrivePicker,
    } = useGoogleDrivePicker();
    const { state } = useFileState();
    const { actions: fileActions } = useFileActions();
    const damagedRepair = useDamagedFileRepair();
    const { actions: navActions } = useNavigationActions();
    const { workbench: currentWorkbench } = useNavigationState();
    const policyFileBadges = usePolicyFileBadges();
    // The page editor lays out every open file, so an added file belongs there.
    const staysOnAdd = currentWorkbench === "pageEditor";
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
    // Files awaiting the delete dialog: a cloud-backed kebab delete (local-only
    // files delete immediately) or a bulk selection, which always confirms.
    const [deleteTargets, setDeleteTargets] = useState<
      StirlingFileStub[] | null
    >(null);
    const [selecting, setSelecting] = useState(false);
    const [bulkSelectedIds, setBulkSelectedIds] = useState<ReadonlySet<FileId>>(
      () => new Set(),
    );
    const [renameTarget, setRenameTarget] = useState<StirlingFileStub | null>(
      null,
    );
    // Storage gate: only offer Save-to-cloud when the server allows it and
    // the user is signed in (guests have no cloud library).
    const storageEnabled = config?.storageEnabled === true && !isAnonymous;

    // Only the newest read may publish: coalesced refreshes overlap when a scan
    // outlasts the window, and a slow one finishing last would otherwise
    // overwrite the newer library with the state it started from.
    const stubsGenRef = useRef(0);
    const refreshStubs = useCallback(async () => {
      const gen = ++stubsGenRef.current;
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
      if (gen !== stubsGenRef.current) return;

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
        if (gen === stubsGenRef.current) setStubsLoaded(true);
      }
    }, [indexedDB, state.files.ids, state.files.byId]);

    const indexedDBRevision = useIndexedDBRevision();
    useCoalescedCallback(refreshStubs, indexedDBRevision);

    // The hook cancels timers but cannot cancel a started run, so unmount has to
    // invalidate it here or a late scan would publish into a gone tree.
    useEffect(() => {
      return () => {
        stubsGenRef.current++;
      };
    }, []);

    // Server copies require a deletion-scope choice; local-only files delete immediately.
    const handleSidebarDelete = useCallback(
      async (fileId: FileId) => {
        const stub = allFileStubs.find((s) => s.id === fileId);
        if (stub && hasDeletableCloudCopy(stub)) {
          setDeleteTargets([stub]);
          return;
        }
        // Its superseded versions go too - see orphanedAncestorIds.
        const orphans = await fileStorage.orphanedAncestorIds([fileId]);
        await fileActions.removeFiles([fileId, ...orphans], true);
        await refreshStubs();
      },
      [allFileStubs, fileActions, refreshStubs],
    );

    const exitSelection = useCallback(() => {
      setSelecting(false);
      setBulkSelectedIds(new Set());
    }, []);

    const handleConfirmSidebarDelete = useCallback(
      async (scope: DeleteScope) => {
        const stubs = deleteTargets ?? [];
        if (stubs.length === 0) return;
        const cloudStubs = stubs.filter(hasDeletableCloudCopy);
        if (scope === "cloud" || scope === "everywhere") {
          await Promise.all(
            cloudStubs.map((s) => deleteServerFile(s.remoteStorageId)),
          );
        }
        if (scope === "device" || scope === "everywhere") {
          const ids = stubs.map((s) => s.id);
          const orphans = await fileStorage.orphanedAncestorIds(ids);
          await fileActions.removeFiles([...ids, ...orphans], true);
        } else if (scope === "cloud") {
          // Local copies kept - drop the dead remote pointers so the cloud badges
          // clear (the sidebar doesn't reconcile with the server itself).
          const cleared = {
            remoteStorageId: undefined,
            remoteStorageUpdatedAt: undefined,
            remoteOwnedByCurrentUser: undefined,
            remoteSharedViaLink: false,
            remoteHasShareLinks: undefined,
          };
          for (const stub of cloudStubs) {
            fileActions.updateStirlingFileStub(stub.id, cleared);
            await fileStorage.updateFileMetadata(stub.id, cleared);
          }
        }
        setDeleteTargets(null);
        exitSelection();
        await refreshStubs();
      },
      [deleteTargets, exitSelection, fileActions, refreshStubs],
    );

    const toggleBulkSelected = useCallback((fileId: FileId) => {
      setBulkSelectedIds((prev) => {
        const next = new Set(prev);
        if (!next.delete(fileId)) next.add(fileId);
        return next;
      });
    }, []);

    // Ids are kept as clicked; files deleted elsewhere drop out here, so the
    // count and the delete never include a row that has gone.
    const bulkSelectedStubs = useMemo(
      () => allFileStubs.filter((s) => bulkSelectedIds.has(s.id)),
      [allFileStubs, bulkSelectedIds],
    );

    const librarySelection: LibrarySelection = {
      active: selecting,
      selectedCount: bulkSelectedStubs.length,
      onStart: () => setSelecting(true),
      onSelectAll: () =>
        setBulkSelectedIds(new Set(allFileStubs.map((s) => s.id))),
      onClear: () => setBulkSelectedIds(new Set()),
      onDelete: () => setDeleteTargets(bulkSelectedStubs),
      onCancel: exitSelection,
    };

    useEffect(() => {
      if (!selecting || deleteTargets) return;
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") exitSelection();
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [selecting, deleteTargets, exitSelection]);

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

    const handleConfirmRename = useCallback(
      async (name: string) => {
        const stub = renameTarget;
        if (!stub) return;
        const saved = await renameStoredFile(
          stub,
          name,
          fileActions.updateStirlingFileStub,
        );
        if (!saved) {
          throw new Error(
            t("fileSidebar.rename.error", "Could not rename the file."),
          );
        }
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
      if (!staysOnAdd) {
        navActions.setWorkbench(files.length === 1 ? "viewer" : "fileEditor");
      }
    }, [
      isGoogleDriveEnabled,
      openGoogleDrivePicker,
      addFiles,
      navActions,
      staysOnAdd,
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

          if (staysOnAdd) {
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
        staysOnAdd,
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
          if (!staysOnAdd && !currentWorkbench.startsWith("custom:")) {
            navActions.setWorkbench(
              files.length === 1 ? "viewer" : "fileEditor",
            );
          }
        }
      },
      [addFiles, navActions, staysOnAdd, onUploadFiles, currentWorkbench],
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

    // Drops here go through the workbench's target, whose overlay covers the
    // workbench rather than this sidebar.
    const dropHandlers = useWorkbenchFileDrop(true);

    const eligibleFileIds = useToolEligibleFileIds();

    const renderFileRow = (stub: StirlingFileStub) => {
      const isInWorkbench = workbenchIds.has(stub.id);
      const workbenchFileId = isInWorkbench ? stub.id : undefined;
      const isViewedInViewer = !!(
        viewedWorkbenchId && viewedWorkbenchId === (stub.id as string)
      );
      const isActive = isViewedInViewer;
      const isEncryptedFile = stub.processedFile?.isEncrypted === true;
      const thumbnailUrl =
        (workbenchFileId
          ? state.files.byId[workbenchFileId]?.thumbnailUrl
          : undefined) || stub.thumbnailUrl;
      const fileOrigin = getFileOrigin(stub);
      const dataUnavailable =
        stub.dataUnavailable === true || lostFileIds.has(stub.id);
      // Damage is detected while hydrating, so only workbench files carry it.
      const isDamaged = workbenchFileId
        ? state.files.byId[workbenchFileId]?.processedFile?.isDamaged === true
        : false;
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
          isSelected={selecting ? bulkSelectedIds.has(stub.id) : isInWorkbench}
          selectionMode={selecting}
          isActive={isActive}
          isViewedInViewer={isViewedInViewer}
          thumbnailUrl={thumbnailUrl}
          isEncrypted={isEncryptedFile}
          onClick={selecting ? toggleBulkSelected : handleFileClick}
          onEyeClick={handleEyeClick}
          dataUnavailable={dataUnavailable}
          isDamaged={isDamaged}
          onRepair={damagedRepair?.repair}
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
        {...dropHandlers}
      >
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
              <SidebarActionRow key={action.label} action={action} />
            ))}
          </NavSurface>

          <NavSurface className="file-sidebar-files-box">
            <div className="file-sidebar-scroll">
              {currentWorkbench === "myFiles" ? (
                <FolderTreeSection />
              ) : (
                <FileLibrarySection
                  loaded={stubsLoaded}
                  stubs={allFileStubs}
                  groups={fileGroups}
                  groupOpen={groupOpen}
                  onGroupOpenChange={setGroupOpenState}
                  renderFileRow={renderFileRow}
                  isGoogleDriveEnabled={isGoogleDriveEnabled}
                  onGoogleDrive={handleGoogleDriveClick}
                  onAddFiles={openNativeFilePicker}
                  onOpenFilesPage={() => navActions.setWorkbench("myFiles")}
                  selection={librarySelection}
                />
              )}
            </div>
          </NavSurface>
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
          opened={Boolean(deleteTargets?.length)}
          files={deleteTargets ?? []}
          onClose={() => setDeleteTargets(null)}
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

        {currentWorkbench !== "myFiles" && <SidebarChat />}
      </div>
    );
  },
);

export default FileSidebar;
