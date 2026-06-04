import { useState, useCallback, useEffect } from "react";
import {
  Box,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  Loader,
  ScrollArea,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import CloseIcon from "@mui/icons-material/Close";
import FolderPlusIcon from "@mui/icons-material/CreateNewFolder";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutlined";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutlined";
import { useWatchedFolders } from "@app/hooks/useWatchedFolders";
import { useFolderRunStatuses } from "@app/hooks/useFolderRunStatuses";
import {
  useFolderAutomation,
  resolveInputFile,
} from "@app/hooks/useFolderAutomation";
import { WatchedFolder } from "@app/types/watchedFolders";
import { type FileId } from "@app/types/file";
import { AutomationConfig } from "@app/types/automation";
import { automationStorage } from "@app/services/automationStorage";
import { watchedFolderFileStorage } from "@app/services/watchedFolderFileStorage";
import { getWatchedFolderDraggedFileIds } from "@app/components/watchedFolders/watchedFolderDragState";
import { fileStorage } from "@app/services/fileStorage";
import { FolderThumbnail } from "@app/components/filesPage/FolderThumbnail";
import { WatchedFolderManagementModal } from "@app/components/watchedFolders/WatchedFolderManagementModal";
import { DeleteFolderConfirmModal } from "@app/components/watchedFolders/DeleteFolderConfirmModal";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import {
  WATCHED_FOLDER_VIEW_ID,
  WATCHED_FOLDER_WORKBENCH_ID,
} from "@app/components/watchedFolders/WatchedFoldersRegistration";
import { timeAgo } from "@app/components/watchedFolders/WatchedFolderWorkbenchView";
import "@app/components/watchedFolders/WatchedFolders.css";

export function humaniseOp(op: string): string {
  return op
    .replace(/-pdf$|-pages$|-documents?$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\bocr\b/gi, "OCR")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

interface FolderCardProps {
  folder: WatchedFolder;
  status: "idle" | "processing" | "done";
  isProcessing: boolean;
  onEdit: (folder: WatchedFolder) => void;
  onDelete: (folder: WatchedFolder) => void;
  onOpen: (folderId: string) => void;
  onDropFiles: (folder: WatchedFolder, files: File[]) => void;
  onDropSidebarFile: (folder: WatchedFolder, fileIds: string[]) => void;
  onTogglePause: (folder: WatchedFolder) => void;
}

function FolderCard({
  folder,
  status,
  isProcessing,
  onEdit,
  onDelete,
  onOpen,
  onDropFiles,
  onDropSidebarFile,
  onTogglePause,
}: FolderCardProps) {
  const { t } = useTranslation();
  const [automation, setAutomation] = useState<AutomationConfig | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const [lastAdded, setLastAdded] = useState<Date | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // True while a drag hovers this card AND every dragged file is already in it
  // (so the drop would be a no-op — see the guard in processFiles).
  const [dragAlreadyPresent, setDragAlreadyPresent] = useState(false);
  // Ids of files currently in this folder, used for the live dragover check.
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    automationStorage.getAutomation(folder.automationId).then(setAutomation);

    const loadData = () =>
      watchedFolderFileStorage.getFolderData(folder.id).then((record) => {
        if (!record) {
          setFileCount(0);
          setLastAdded(null);
          setMemberIds(new Set());
          return;
        }
        const files = Object.values(record.files);
        setFileCount(files.length);
        setMemberIds(new Set(Object.keys(record.files)));
        const dates = files
          .map((f) => new Date(f.addedAt))
          .filter((d) => !isNaN(d.getTime()));
        setLastAdded(
          dates.length
            ? new Date(Math.max(...dates.map((d) => d.getTime())))
            : null,
        );
      });
    loadData();

    const unsub = watchedFolderFileStorage.onFolderChange((changedId) => {
      if (changedId === folder.id) loadData();
    });
    return unsub;
  }, [folder.id, folder.automationId]);

  const isPaused = folder.isPaused ?? false;
  const isActive = !isPaused && (isProcessing || status === "processing");
  const isDone = !isPaused && status === "done" && !isActive;

  const statusDotColor = isPaused
    ? "var(--mantine-color-dimmed)"
    : isActive
      ? "var(--mantine-color-blue-filled)"
      : isDone
        ? "var(--color-green-500)"
        : "var(--text-muted)";
  const statusDotPulse = isActive;

  const statusLabel = isPaused
    ? t("watchedFolders.status.paused", "Paused")
    : isActive
      ? t("watchedFolders.status.processing", "Processing")
      : isDone
        ? t("watchedFolders.status.done", "Done")
        : t("watchedFolders.status.active", "Active");

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
    // Live feedback: are all the files being dragged already in this folder?
    const dragged = getWatchedFolderDraggedFileIds();
    setDragAlreadyPresent(
      dragged.length > 0 && dragged.every((id) => memberIds.has(id)),
    );
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
      setDragAlreadyPresent(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setDragAlreadyPresent(false);
    const multiRaw = e.dataTransfer.getData("watchedFolderFileIds");
    if (multiRaw) {
      try {
        const ids: string[] = JSON.parse(multiRaw);
        if (ids.length > 0) {
          onDropSidebarFile(folder, ids);
          return;
        }
      } catch {
        /* fall through */
      }
    }
    const sidebarFileId = e.dataTransfer.getData("watchedFolderFileId");
    if (sidebarFileId) {
      onDropSidebarFile(folder, [sidebarFileId]);
    } else if (e.dataTransfer.files.length > 0) {
      onDropFiles(folder, Array.from(e.dataTransfer.files));
    }
  };

  // `automation` is loaded by the per-card effect above; the steps it holds
  // are no longer rendered on the card but the load is preserved.
  void automation;

  return (
    <div
      className={`wf-card${isDragOver ? " is-drop-target" : ""}${
        isDragOver && dragAlreadyPresent ? " is-already-member" : ""
      }`}
      role="listitem"
      tabIndex={0}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => onOpen(folder.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(folder.id);
      }}
    >
      {isDragOver && dragAlreadyPresent && (
        <div className="wf-card-drag-message" aria-hidden="true">
          {t("watchedFolders.alreadyInFolder", "Already in this folder")}
        </div>
      )}
      <div
        className="wf-card-thumb"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${folder.accentColor} 18%, var(--bg-surface)), color-mix(in srgb, ${folder.accentColor} 6%, var(--bg-surface)))`,
        }}
      >
        <FolderThumbnail
          color={folder.accentColor}
          fileCount={fileCount}
          size="thumb"
        />
      </div>

      <div className="wf-card-body">
        <div className="wf-card-name" title={folder.name}>
          {folder.name}
        </div>
        <div className="wf-card-meta">
          <span>
            {fileCount}{" "}
            {fileCount === 1
              ? t("watchedFolders.home.file", "file")
              : t("watchedFolders.home.files", "files")}
          </span>
          {lastAdded && (
            <>
              <span>·</span>
              <span>{timeAgo(lastAdded, t)}</span>
            </>
          )}
          <span style={{ flex: 1 }} />
          <span
            className={`wf-card-status-dot${statusDotPulse ? " is-pulsing" : ""}`}
            style={{ backgroundColor: statusDotColor }}
          />
          <span style={{ fontSize: "0.7rem" }}>{statusLabel}</span>
        </div>
      </div>

      <div className="wf-card-actions" onClick={(e) => e.stopPropagation()}>
        <ActionIcon
          size="md"
          variant="subtle"
          onClick={() => onTogglePause(folder)}
          aria-label={
            isPaused
              ? t("watchedFolders.home.resume", "Resume")
              : t("watchedFolders.home.pause", "Pause")
          }
          title={
            isPaused
              ? t("watchedFolders.home.resume", "Resume")
              : t("watchedFolders.home.pause", "Pause")
          }
        >
          {isPaused ? (
            <PlayCircleOutlineIcon style={{ fontSize: "1.125rem" }} />
          ) : (
            <PauseCircleOutlineIcon style={{ fontSize: "1.125rem" }} />
          )}
        </ActionIcon>
        <ActionIcon
          size="md"
          variant="subtle"
          onClick={() => onEdit(folder)}
          aria-label={t("watchedFolders.home.editFolder", "Edit folder")}
        >
          <EditIcon style={{ fontSize: "1.125rem" }} />
        </ActionIcon>
        <ActionIcon
          size="md"
          variant="subtle"
          color="red"
          onClick={() => onDelete(folder)}
          aria-label={t("watchedFolders.home.deleteFolder", "Delete folder")}
        >
          <DeleteOutlineIcon style={{ fontSize: "1.125rem" }} />
        </ActionIcon>
      </div>
    </div>
  );
}

function HowItWorks() {
  const { t } = useTranslation();

  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem("wf_howItWorks_dismissed") === "1",
  );

  if (dismissed) return null;

  const steps = [
    {
      n: "1",
      title: t("watchedFolders.howItWorks.step1Title", "Drop files"),
      desc: t(
        "watchedFolders.howItWorks.step1Desc",
        "Drag PDFs onto any Watched Folder card — or send them from your file list",
      ),
    },
    {
      n: "2",
      title: t("watchedFolders.howItWorks.step2Title", "Pipeline runs"),
      desc: t(
        "watchedFolders.howItWorks.step2Desc",
        "Your configured tools process each file automatically",
      ),
    },
    {
      n: "3",
      title: t("watchedFolders.howItWorks.step3Title", "Output ready"),
      desc: t(
        "watchedFolders.howItWorks.step3Desc",
        "Download processed files from inside the folder",
      ),
    },
  ];

  return (
    <Box
      mt="lg"
      style={{
        padding: "1rem 1.25rem",
        borderRadius: "var(--mantine-radius-md)",
        border: "0.0625rem solid var(--border-subtle)",
        backgroundColor: "var(--bg-toolbar)",
      }}
    >
      <Group gap="xs" mb="sm" justify="space-between">
        <Group gap="xs">
          <InfoOutlinedIcon
            style={{
              fontSize: "1rem",
              color: "var(--mantine-color-blue-filled)",
            }}
          />
          <Text fw={600} size="xs">
            {t("watchedFolders.howItWorks.title", "How Watched Folders work")}
          </Text>
        </Group>
        <ActionIcon
          size="xs"
          variant="subtle"
          color="gray"
          onClick={() => {
            sessionStorage.setItem("wf_howItWorks_dismissed", "1");
            setDismissed(true);
          }}
          aria-label={t("watchedFolders.actions.dismiss", "Dismiss")}
        >
          <CloseIcon
            style={{ fontSize: "0.75rem", color: "var(--mantine-color-text)" }}
          />
        </ActionIcon>
      </Group>
      <Group gap="xl" wrap="nowrap" align="flex-start">
        {steps.map((step) => (
          <Group
            key={step.n}
            gap="sm"
            wrap="nowrap"
            align="flex-start"
            style={{ flex: 1 }}
          >
            <Box
              style={{
                width: "1.375rem",
                height: "1.375rem",
                borderRadius: "50%",
                backgroundColor: "var(--mantine-color-blue-light)",
                color: "var(--mantine-color-blue-filled)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.6875rem",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {step.n}
            </Box>
            <Stack gap={2}>
              <Text size="xs" fw={600}>
                {step.title}
              </Text>
              <Text size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
                {step.desc}
              </Text>
            </Stack>
          </Group>
        ))}
      </Group>
    </Box>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="wf-empty">
      <span className="wf-empty-icon">
        <FolderPlusIcon style={{ fontSize: "2.5rem" }} />
      </span>
      <div className="wf-empty-title">
        {t("watchedFolders.home.emptyTitle", "Automate your PDF workflows")}
      </div>
      <div className="wf-empty-hint">
        {t(
          "watchedFolders.home.emptyDesc",
          "Set up a Watched Folder once. Drop PDFs in and they're automatically compressed, OCR'd, split, merged — whatever your pipeline does.",
        )}
      </div>

      <Button
        size="md"
        leftSection={<AddIcon style={{ fontSize: "1.125rem" }} />}
        onClick={onCreate}
        mt="sm"
      >
        {t("watchedFolders.home.create", "Create your first Watched Folder")}
      </Button>

      <HowItWorks />
    </div>
  );
}

export function WatchedFolderHomePage() {
  const { t } = useTranslation();
  const { folders, loading, deleteFolder, updateFolder, refreshFolders } =
    useWatchedFolders();
  const statuses = useFolderRunStatuses(folders);
  const { toolRegistry, setCustomWorkbenchViewData } = useToolWorkflow();
  const { actions } = useNavigationActions();
  const { processBatch } = useFolderAutomation(toolRegistry);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editFolder, setEditFolder] = useState<WatchedFolder | null>(null);
  const [editAutomation, setEditAutomation] = useState<AutomationConfig | null>(
    null,
  );
  const [processingFolderIds, setProcessingFolderIds] = useState<Set<string>>(
    new Set(),
  );
  const [deleteTarget, setDeleteTarget] = useState<WatchedFolder | null>(null);

  const navigateToFolder = useCallback(
    (folderId: string) => {
      setCustomWorkbenchViewData(WATCHED_FOLDER_VIEW_ID, { folderId });
      actions.setWorkbench(WATCHED_FOLDER_WORKBENCH_ID);
    },
    [setCustomWorkbenchViewData, actions],
  );

  const handleEdit = useCallback(async (folder: WatchedFolder) => {
    setEditFolder(folder);
    const automation = await automationStorage.getAutomation(
      folder.automationId,
    );
    setEditAutomation(automation);
    setCreateModalOpen(true);
  }, []);

  const handleModalClose = () => {
    setCreateModalOpen(false);
    setEditFolder(null);
    setEditAutomation(null);
  };

  const processFiles = useCallback(
    async (folder: WatchedFolder, files: File[]) => {
      const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
      if (pdfs.length === 0) return;

      // Load existing folder data once so we can skip files already in the folder.
      const existingData = await watchedFolderFileStorage.getFolderData(
        folder.id,
      );
      // Register files sequentially — addFileToFolder/updateFileMetadata are read-modify-write
      // without IDB transactions, so concurrent calls on the same folder lose updates.
      const items: Array<{
        file: File;
        inputFileId: string;
        ownedByFolder: boolean;
      }> = [];
      for (const file of pdfs) {
        const { inputFileId, ownedByFolder } = await resolveInputFile(file);
        // Guard against multiple adds: if this file is already in the folder,
        // skip it entirely rather than resetting its status and reprocessing.
        // (Dropping the same sidebar file onto a card again is a no-op.)
        if (existingData?.files[inputFileId]) {
          continue;
        }
        await watchedFolderFileStorage.addFileToFolder(folder.id, inputFileId, {
          status: "pending",
          name: file.name,
          ownedByFolder: ownedByFolder || undefined,
        });
        items.push({ file, inputFileId, ownedByFolder });
      }

      // Nothing new to process (every dropped file was already in the folder).
      if (items.length === 0) return;

      if (folder.isPaused) return;

      setProcessingFolderIds((prev) => new Set([...prev, folder.id]));
      try {
        await processBatch(folder, items);
      } finally {
        setProcessingFolderIds((prev) => {
          const next = new Set(prev);
          next.delete(folder.id);
          return next;
        });
      }
    },
    [processBatch],
  );

  const handleTogglePause = useCallback(
    async (folder: WatchedFolder) => {
      const resuming = folder.isPaused;
      const updatedFolder = { ...folder, isPaused: !folder.isPaused };
      await updateFolder(updatedFolder);
      refreshFolders();

      if (resuming) {
        const record = await watchedFolderFileStorage.getFolderData(folder.id);
        if (record) {
          const pendingEntries = Object.entries(record.files).filter(
            ([, meta]) => meta.status === "pending",
          );
          if (pendingEntries.length > 0) {
            const items: Array<{
              file: File;
              inputFileId: string;
              ownedByFolder: boolean;
            }> = [];
            for (const [id, meta] of pendingEntries) {
              const stirlingFile = await fileStorage.getStirlingFile(
                id as FileId,
              );
              if (stirlingFile) {
                items.push({
                  file: stirlingFile,
                  inputFileId: id,
                  ownedByFolder: meta.ownedByFolder ?? false,
                });
              }
            }
            if (items.length > 0) processBatch(updatedFolder, items);
          }
        }
      }
    },
    [updateFolder, refreshFolders, processBatch],
  );

  const handleDropSidebarFile = useCallback(
    async (folder: WatchedFolder, fileIds: string[]) => {
      const results = await Promise.all(
        fileIds.map((id) => fileStorage.getStirlingFile(id as FileId)),
      );
      const stirlingFiles = results.filter(Boolean) as File[];
      if (stirlingFiles.length > 0) processFiles(folder, stirlingFiles);
    },
    [processFiles],
  );

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteFolder(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <Box
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <ScrollArea style={{ flex: 1 }}>
        <Box p="xl">
          {loading ? (
            <Box
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "4rem",
              }}
            >
              <Loader size="md" />
            </Box>
          ) : folders.length === 0 ? (
            <EmptyState onCreate={() => setCreateModalOpen(true)} />
          ) : (
            <Stack gap="md">
              <HowItWorks />

              <div className="wf-grid" role="list">
                {folders.map((folder) => {
                  const status = statuses[folder.id] ?? "idle";
                  const isProcessing =
                    processingFolderIds.has(folder.id) ||
                    status === "processing";
                  return (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      status={status}
                      isProcessing={isProcessing}
                      onEdit={handleEdit}
                      onDelete={setDeleteTarget}
                      onOpen={navigateToFolder}
                      onDropFiles={processFiles}
                      onDropSidebarFile={handleDropSidebarFile}
                      onTogglePause={handleTogglePause}
                    />
                  );
                })}

                <div
                  className="wf-new-tile"
                  role="button"
                  tabIndex={0}
                  onClick={() => setCreateModalOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      setCreateModalOpen(true);
                  }}
                >
                  <span className="wf-new-tile-icon">
                    <FolderPlusIcon style={{ fontSize: "1.5rem" }} />
                  </span>
                  <Text size="sm" fw={600}>
                    {t(
                      "watchedFolders.home.addAnother",
                      "Add another Watched Folder",
                    )}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {t(
                      "watchedFolders.home.addAnotherDesc",
                      "Automatically process files with a new pipeline",
                    )}
                  </Text>
                </div>
              </div>
            </Stack>
          )}
        </Box>
      </ScrollArea>

      <WatchedFolderManagementModal
        opened={createModalOpen}
        editFolder={editFolder}
        existingAutomation={editAutomation}
        onClose={handleModalClose}
        onSaved={refreshFolders}
      />
      <DeleteFolderConfirmModal
        opened={!!deleteTarget}
        folder={deleteTarget}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
}
