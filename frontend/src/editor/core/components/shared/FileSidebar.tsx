import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  forwardRef,
  type RefCallback,
} from "react";
import { Loader, Menu, Tooltip } from "@mantine/core";
import { useCreatePdfMenu } from "@editor/components/createPdf/useCreatePdfMenu";
import { CreatePdfSidebarRow } from "@editor/components/createPdf/CreatePdfSidebarRow";
import {
  CreatePdfMenuItems,
  RichMenuItem,
} from "@editor/components/createPdf/CreatePdfMenuItems";
import { useNavigate } from "react-router-dom";
import { useStableCallback } from "@editor/hooks/useStableCallback";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { NavSurface } from "@editor/ui/NavSurface";
import { Button } from "@editor/ui/Button";
import { Icon, type IconName } from "@editor/ui/Icon";
import { useTranslation } from "react-i18next";
import { useFileState, useFileActions } from "@editor/contexts/file/fileHooks";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import {
  useCloudFilePickers,
  type CloudFilePicker,
} from "@editor/hooks/useCloudFilePickers";
import {
  useNavigationState,
  useNavigationActions,
  useNavigationGuard,
} from "@editor/contexts/NavigationContext";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useFileHandler } from "@editor/hooks/useFileHandler";
import { openFilesFromDisk } from "@editor/services/openFilesFromDisk";
import { useAccountIdentity } from "@editor/hooks/useAccountIdentity";
import { useFreeCreditsSummary } from "@editor/hooks/useFreeCreditsSummary";
import { useOpenPlan } from "@editor/hooks/useOpenPlan";
import { NavFooter } from "@editor/components/shared/navFooter/NavFooter";
import {
  useIndexedDB,
  useIndexedDBRevision,
} from "@editor/contexts/IndexedDBContext";
import { SidebarHeader } from "@editor/components/shared/SidebarHeader";
import type { StirlingFileStub } from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";
import { FileItem } from "@editor/components/shared/FileSidebarFileItem";
import { useLabelName } from "@editor/data/labelDisplay";
import { useClassificationEnabled } from "@editor/hooks/useClassificationEnabled";
import {
  FileSidebarGroupControls,
  useFileSidebarGroups,
  type FileSidebarGroup,
} from "@editor/components/shared/fileSidebarGrouping";
import BulkUploadToServerModal from "@editor/components/shared/BulkUploadToServerModal";
import { getFileOrigin } from "@editor/components/filesPage/fileOrigin";
import { VersionHistoryModal } from "@editor/components/filesPage/VersionHistoryModal";
import { DeleteFilesDialog } from "@editor/components/filesPage/DeleteFilesDialog";
import { ClearRecentsDialog } from "@editor/components/shared/ClearRecentsDialog";
import { useFileSources } from "@editor/components/shared/useFileSources";
import { RenameFileDialog } from "@editor/components/shared/RenameFileDialog";
import { duplicateStoredFile } from "@editor/utils/duplicateFile";
import { SidebarChecklistSlot } from "@editor/components/shared/SidebarChecklistSlot";
import { SidebarChat } from "@editor/components/chat/SidebarChat";
import {
  deleteServerFile,
  type DeleteScope,
} from "@editor/services/serverStorageDelete";
import { fileStorage, onRecordUnreadable } from "@editor/services/fileStorage";
import { renameStoredFile } from "@editor/services/renameStoredFile";
import { downloadFileWithPolicy } from "@editor/services/exportWithPolicy";
import { useOpenInNewWindow } from "@editor/extensions/openInNewWindow";
import { openSuperSearch } from "@editor/components/shared/superSearch/openSuperSearch";
import { alert } from "@editor/components/toast";
import { libraryFileDate } from "@editor/components/filesPage/libraryFileDate";
import { useVisibleBulkAddProgress } from "@editor/services/bulkAddProgress";
import { BulkAddProgressBar } from "@editor/components/shared/BulkAddProgressBar";
import { useIsScrolled } from "@editor/hooks/useIsScrolled";
import { usePolicyFileBadges } from "@editor/hooks/usePolicyFileBadges";
import { useCoalescedCallback } from "@editor/hooks/useCoalescedCallback";
import { FolderTreeSidebar } from "@editor/components/filesPage/FolderTreeSidebar";
import { useFilesPage } from "@editor/contexts/FilesPageContext";
import type { FolderId, FolderRecord } from "@editor/types/folder";
import { useToolEligibleFileIds } from "@editor/contexts/ToolFileEligibilityContext";
import { useWorkbenchFileDrop } from "@editor/components/layout/useWorkbenchFileDrop";
import { useDamagedFileRepair } from "@editor/contexts/DamagedFileRepairContext";
import "@editor/components/shared/FileSidebar.css";
import {
  CONNECTED_ACCOUNTS_SETTINGS_PATH,
  useOneDriveSave,
} from "@editor/hooks/useOneDriveSave";
import { hasUnsavedCloudChanges } from "@editor/services/oneDriveSave";

// Shared with the processor sidebar via tokens, so the two cannot drift.
const SIDEBAR_WIDTH = "var(--sidebar-w)";

// Stable empty props for rows without policies, so the memoized
// FileItem isn't re-rendered by a fresh `?? []` identity on every list render.
const NO_POLICIES: never[] = [];

export interface FileSidebarProps {
  onOpenSettings?: () => void;
  /** The quick nav rail owns the account control, so the footer drops its own row. */
  accountHoisted?: boolean;
  /** Override the Open-from-computer handler (e.g. upload to /files folder). */
  onUploadFiles?: (files: File[]) => void | Promise<void>;
  /** Publishes the sidebar's picker so the quick navigation rail can reuse it. */
  onRegisterOpenFromComputer?: (open: (() => void) | null) => void;
  onPickCloudFiles?: (files: File[]) => void | Promise<void>;
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
  const progress = useVisibleBulkAddProgress();
  return progress ? (
    <BulkAddProgressBar
      progress={progress}
      className="file-sidebar-bulk-add"
      announce
    />
  ) : null;
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

function ClearRecentsButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <ActionIcon
      variant="quiet"
      className={`file-sidebar-section-btn${className ? ` ${className}` : ""}`}
      onClick={onClick}
      title={t("fileSidebar.clearRecents.button", "Clear recents")}
      aria-label={t("fileSidebar.clearRecents.button", "Clear recents")}
      data-testid="file-sidebar-clear-recents"
    >
      <Icon name="trash" size={"1rem"} />
    </ActionIcon>
  );
}

interface LibraryHeaderProps {
  stubs: StirlingFileStub[];
  scrolled: boolean;
  cloudPickers: CloudFilePicker[];
  onCloudPick: (picker: CloudFilePicker) => void;
  onAddFiles: () => void;
  onOpenFilesPage: () => void;
  /** Set only for a flat list; a grouped list carries it on its Recent group. */
  onClearRecents?: () => void;
}

function LibraryHeader({
  stubs,
  scrolled,
  cloudPickers,
  onCloudPick,
  onAddFiles,
  onOpenFilesPage,
  onClearRecents,
}: LibraryHeaderProps) {
  const { t } = useTranslation();
  const createPdf = useCreatePdfMenu();
  const { sources, pickers } = useFileSources(onAddFiles);
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
      {onClearRecents && <ClearRecentsButton onClick={onClearRecents} />}
      <Menu position="bottom-end" withinPortal shadow="md" width={300}>
        <Menu.Target>
          <ActionIcon
            variant="quiet"
            className="file-sidebar-section-btn file-sidebar-section-btn-add"
            data-testid="pdf-library-add-files"
            loading={createPdf.busyLabel !== null}
            title={t("fileSidebar.addFiles", "Add files")}
            aria-label={t("fileSidebar.addFiles", "Add files")}
          >
            <Icon name="plus" size={"1rem"} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{t("fileSidebar.addFiles", "Add files")}</Menu.Label>
          {sources.map((source) => (
            <RichMenuItem
              key={source.key}
              icon={<Icon name={source.icon} size={16} />}
              label={source.menuLabel}
              onClick={source.onClick}
              testId={source.testId}
            />
          ))}
          {cloudPickers.map((picker) => (
            <RichMenuItem
              key={picker.id}
              icon={<Icon name={picker.icon} size={16} />}
              label={picker.actionLabel}
              onClick={() => onCloudPick(picker)}
              testId={picker.testId}
            />
          ))}
          <Menu.Divider />
          <Menu.Label>{t("createPdf.button", "Create PDF")}</Menu.Label>
          <CreatePdfMenuItems items={createPdf.items} />
        </Menu.Dropdown>
      </Menu>
      {createPdf.dialogs}
      {pickers}
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
  /** A control beside the header; the header is itself a button, so it can't nest. */
  action?: React.ReactNode;
  /** Shown under the header, open or collapsed. */
  status?: React.ReactNode;
}

function FileGroup({
  group,
  isOpen,
  onToggle,
  renderFileRow,
  action,
  status,
}: FileGroupProps) {
  return (
    <div className="file-sidebar-group">
      <div className="file-sidebar-group-header-row">
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
            <span className="file-sidebar-group-count">
              {group.stubs.length}
            </span>
          }
        >
          <span className="file-sidebar-group-label">{group.label}</span>
        </Button>
        {action}
      </div>
      {status}
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
  /** Absent when nothing is clearable, which hides the button. */
  onClearRecents?: () => void;
  /** The group that shows upload progress under its header. */
  progressGroupId?: string;
}

function GroupedFileList({
  groups,
  groupOpen,
  onGroupOpenChange,
  renderFileRow,
  total,
  onViewAll,
  onClearRecents,
  progressGroupId,
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
            action={
              group.id === "recent" && onClearRecents ? (
                <ClearRecentsButton
                  onClick={onClearRecents}
                  className="file-sidebar-group-action"
                />
              ) : undefined
            }
            status={
              group.id === progressGroupId ? <BulkAddProgressRow /> : undefined
            }
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
  "scrollRef" | "progressGroupId"
> {
  cloudPickers: CloudFilePicker[];
  onCloudPick: (picker: CloudFilePicker) => void;
  onAddFiles: () => void;
}

function FileLibrarySection({
  cloudPickers,
  onCloudPick,
  onAddFiles,
  ...list
}: FileLibrarySectionProps) {
  const { scrolled, scrollRef } = useIsScrolled();
  // Under Recent when the list has one, as the newest files land there;
  // otherwise above the list.
  const progressGroupId = list.groups?.find((g) => g.id === "recent")?.id;
  return (
    <div className="file-sidebar-files-section sidebar-content-fade">
      <LibraryHeader
        stubs={list.stubs}
        scrolled={scrolled}
        cloudPickers={cloudPickers}
        onCloudPick={onCloudPick}
        onAddFiles={onAddFiles}
        onOpenFilesPage={list.onOpenFilesPage}
        onClearRecents={list.groups ? undefined : list.onClearRecents}
      />
      {!progressGroupId && <BulkAddProgressRow />}
      <LibraryFileList
        scrollRef={scrollRef}
        progressGroupId={progressGroupId}
        {...list}
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
      onPickCloudFiles,
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
    const cloudPickers = useCloudFilePickers();
    const navigate = useNavigate();
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
    const [ingestsInFlight, setIngestsInFlight] = useState(0);
    const trackIngest = useCallback(async (ingest: () => Promise<void>) => {
      setIngestsInFlight((n) => n + 1);
      try {
        await ingest();
      } finally {
        setIngestsInFlight((n) => n - 1);
      }
    }, []);
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
    // Fixed when the dialog opens, so files added while it is up aren't cleared.
    const [clearTargets, setClearTargets] = useState<StirlingFileStub[] | null>(
      null,
    );
    const [renameTarget, setRenameTarget] = useState<StirlingFileStub | null>(
      null,
    );
    // Storage gate: only offer Save-to-cloud when the server allows it and
    // the user is signed in (guests have no cloud library).
    const storageEnabled = config?.storageEnabled === true && !isAnonymous;

    // Coalesced refreshes overlap when a scan outlasts the window. A read may
    // publish unless a newer one already has: dropping every superseded read
    // would leave the list frozen for as long as a long upload keeps them coming.
    const stubsGenRef = useRef(0);
    const publishedGenRef = useRef(0);
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
      if (gen <= publishedGenRef.current) return;
      publishedGenRef.current = gen;

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
            (a, b) =>
              libraryFileDate(b, "recent") - libraryFileDate(a, "recent"),
          ),
        );
      } finally {
        setStubsLoaded(true);
      }
    }, [indexedDB, state.files.ids, state.files.byId]);

    const indexedDBRevision = useIndexedDBRevision();
    useCoalescedCallback(refreshStubs, indexedDBRevision);

    // The hook cancels timers but cannot cancel a started run, so unmount has to
    // invalidate it here or a late scan would publish into a gone tree.
    useEffect(() => {
      publishedGenRef.current = stubsGenRef.current;
      return () => {
        publishedGenRef.current = Infinity;
      };
    }, []);

    // Server copies require a deletion-scope choice; local-only files delete immediately.
    const handleSidebarDelete = useStableCallback(async (fileId: FileId) => {
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
    });

    const handleConfirmSidebarDelete = useStableCallback(
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
    );

    const handleSaveToCloud = useStableCallback((fileId: FileId) => {
      const stub = allFileStubs.find((s) => s.id === fileId);
      if (stub) setSaveToServerTarget([stub]);
    });

    const handleVersionHistory = useStableCallback((fileId: FileId) => {
      const stub = allFileStubs.find((s) => s.id === fileId);
      if (stub) setVersionHistoryTarget(stub);
    });

    const warnDataUnavailable = useStableCallback(() => {
      alert({
        alertType: "warning",
        title: t("fileSidebar.dataLostTitle", "File data is unavailable"),
        body: t(
          "fileSidebar.dataLostBody",
          "Couldn't find this file's contents. Add it again to keep working with it.",
        ),
        expandable: false,
        durationMs: 6000,
      });
    });

    // Kebab: download a copy (desktop saves via the native dialog). Routed
    // through the policy wrapper so export policies enforce here too.
    const handleDownload = useStableCallback(async (fileId: FileId) => {
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
    });

    const oneDriveSave = useOneDriveSave();
    const oneDriveHandlers = useMemo(() => {
      const forStub =
        (act: (stub: StirlingFileStub) => unknown) => (fileId: FileId) => {
          const stub = allFileStubs.find((s) => s.id === fileId);
          if (stub) void act(stub);
        };
      return {
        save: forStub(oneDriveSave.save),
        saveCopy: forStub(oneDriveSave.saveCopy),
        saveToFolder: forStub(oneDriveSave.saveToFolder),
        open: forStub(oneDriveSave.openInOneDrive),
      };
    }, [allFileStubs, oneDriveSave]);

    const handleDuplicate = useStableCallback(async (fileId: FileId) => {
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
    });

    const handleRename = useStableCallback((fileId: FileId) => {
      const stub = allFileStubs.find((s) => s.id === fileId);
      if (stub) setRenameTarget(stub);
    });

    const handleConfirmRename = useStableCallback(async (name: string) => {
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
    });

    // Desktop-only; a no-op stub on web, where this stays hidden.
    const { canOpenInNewWindow, openInNewWindow } = useOpenInNewWindow();
    const handleOpenInNewWindow = useStableCallback((fileId: FileId) => {
      const stub = allFileStubs.find((s) => s.id === fileId);
      if (stub) openInNewWindow(stub);
    });

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
    // Foldered files are kept: the user filed them deliberately.
    const clearableStubs = useMemo(
      () => allFileStubs.filter((s) => s.folderId == null),
      [allFileStubs],
    );
    const openClearTargetIds = useMemo(() => {
      const open = new Set(state.files.ids.map(String));
      return new Set(
        (clearTargets ?? []).filter((s) => open.has(s.id)).map((s) => s.id),
      );
    }, [clearTargets, state.files.ids]);
    const handleConfirmClearRecents = useCallback(
      async (skipOpen: boolean) => {
        const removed = await fileActions.clearRecentFiles(
          (clearTargets ?? []).map((s) => s.id),
          skipOpen ? new Set(state.files.ids.map(String)) : undefined,
        );
        // A cleared file's unsaved changes went with it; left set, the flag would
        // prompt about them on the next navigation.
        if (activeFileId && removed.includes(activeFileId as FileId)) {
          navActions.setHasUnsavedChanges(false);
        }
        await refreshStubs();
      },
      [
        clearTargets,
        state.files.ids,
        fileActions,
        refreshStubs,
        activeFileId,
        navActions,
      ],
    );

    const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
    const setGroupOpenState = useCallback(
      (id: string, open: boolean) =>
        setGroupOpen((prev) => ({ ...prev, [id]: open })),
      [],
    );

    const reportUploadFailure = useCallback(
      (err: unknown) =>
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
        }),
      [t],
    );

    const handleCloudPick = useCallback(
      async (picker: CloudFilePicker) => {
        const files = await picker.openPicker({ multiple: true });
        if (files.length === 0) return;
        try {
          await trackIngest(async () => {
            if (onPickCloudFiles) {
              await onPickCloudFiles(files);
              return;
            }
            await addFiles(files);
            if (!staysOnAdd) {
              navActions.setWorkbench(
                files.length === 1 ? "viewer" : "fileEditor",
              );
            }
          });
        } catch (err) {
          console.error("[FileSidebar] Cloud file ingest failed", err);
          reportUploadFailure(err);
        }
      },
      [
        trackIngest,
        addFiles,
        navActions,
        staysOnAdd,
        onPickCloudFiles,
        reportUploadFailure,
      ],
    );

    const failedPicker = cloudPickers.find((picker) => picker.error);
    useEffect(() => {
      if (!failedPicker?.error) return;
      alert({
        alertType: "error",
        title: failedPicker.failedTitle,
        body: failedPicker.error,
        expandable: false,
        durationMs: 8000,
        ...(failedPicker.reconnectNeeded
          ? {
              buttonText: t("oneDriveSave.reconnect", "Reconnect"),
              buttonCallback: () => navigate(CONNECTED_ACCOUNTS_SETTINGS_PATH),
            }
          : {}),
      });
      failedPicker.clearError();
    }, [failedPicker, navigate, t]);

    const handleFileClick = useStableCallback(async (fileId: FileId) => {
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
            "Couldn't find this file's contents. Add it again to keep working with it.",
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

        await fileActions.addStirlingFileStubs([stub], { selectFiles: true });

        if (!staysOnAdd) {
          if (workbenchCount === 0) {
            navActions.setWorkbench("viewer");
          } else {
            navActions.setWorkbench("fileEditor");
          }
        }
      }
    });

    // Which file is currently open in the viewer - stable ID, never index-derived.
    const viewedWorkbenchId =
      currentWorkbench === "viewer" ? activeFileId : null;

    const handleEyeClick = useStableCallback(
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
            await fileActions.addStirlingFileStubs([stub], {
              selectFiles: true,
            });
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
    );

    // Shared ingest path for both the native picker and drag-and-drop.
    // Per-tool validation happens downstream.
    const ingestFiles = useStableCallback(async (files: File[]) => {
      if (files.length === 0) return;
      await trackIngest(async () => {
        if (onUploadFiles) {
          await onUploadFiles(files);
          return;
        }
        await addFiles(files);
        // A tool that pinned its own workbench surface owns it - switching to
        // the viewer here strands the upload outside the tool being used.
        if (!staysOnAdd && !currentWorkbench.startsWith("custom:")) {
          navActions.setWorkbench(files.length === 1 ? "viewer" : "fileEditor");
        }
      });
    });

    const handleNativeFilePick = useStableCallback(
      async (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.target;
        try {
          await ingestFiles(Array.from(input.files ?? []));
        } catch (err) {
          console.error("[FileSidebar] Native file pick failed", err);
          reportUploadFailure(err);
        } finally {
          input.value = "";
        }
      },
    );

    const openNativeFilePicker = useStableCallback(() => {
      void openFilesFromDisk({
        onFallbackOpen: () => nativeFileInputRef.current?.click(),
      })
        .then(ingestFiles)
        .catch((err) => {
          console.error("[FileSidebar] Native file pick failed", err);
          reportUploadFailure(err);
        });
    });

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
          isSelected={isInWorkbench}
          isActive={isActive}
          isViewedInViewer={isViewedInViewer}
          thumbnailUrl={thumbnailUrl}
          isEncrypted={isEncryptedFile}
          onClick={handleFileClick}
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
          hasOneDriveOrigin={Boolean(stub.cloudOrigin)}
          oneDriveUnsaved={
            oneDriveSave.available && hasUnsavedCloudChanges(stub)
          }
          oneDriveName={stub.cloudOrigin?.name}
          onOpenInOneDrive={
            stub.cloudOrigin?.webUrl ? oneDriveHandlers.open : undefined
          }
          savingToOneDrive={oneDriveSave.saving === stub.id}
          onSaveToOneDrive={
            oneDriveSave.available ? oneDriveHandlers.save : undefined
          }
          onSaveCopyToOneDrive={
            oneDriveSave.available ? oneDriveHandlers.saveCopy : undefined
          }
          onSaveToOneDriveFolder={
            oneDriveSave.canSaveToFolder
              ? oneDriveHandlers.saveToFolder
              : undefined
          }
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
            {
              icon: null,
              label: t("createPdf.button", "Create PDF"),
              onClick: () => undefined,
              render: () => <CreatePdfSidebarRow />,
            },
            ...cloudPickers.map((picker) => ({
              icon: <Icon name={picker.icon} />,
              label: picker.actionLabel,
              onClick: () => void handleCloudPick(picker),
              testId: picker.testId,
            })),
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
            <div
              className="file-sidebar-scroll"
              aria-busy={ingestsInFlight > 0}
            >
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
                  cloudPickers={cloudPickers}
                  onCloudPick={(picker) => void handleCloudPick(picker)}
                  onAddFiles={openNativeFilePicker}
                  onOpenFilesPage={() => navActions.setWorkbench("myFiles")}
                  onClearRecents={
                    clearableStubs.length > 0
                      ? () => setClearTargets(clearableStubs)
                      : undefined
                  }
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
          opened={Boolean(deleteTarget)}
          files={deleteTarget ? [deleteTarget] : []}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmSidebarDelete}
        />

        <ClearRecentsDialog
          opened={clearTargets !== null}
          clearCount={clearTargets?.length ?? 0}
          openCount={openClearTargetIds.size}
          onClose={() => setClearTargets(null)}
          onConfirm={handleConfirmClearRecents}
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
