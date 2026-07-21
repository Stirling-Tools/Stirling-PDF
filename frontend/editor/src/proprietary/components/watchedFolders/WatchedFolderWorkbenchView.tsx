import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import {
  Box,
  Text,
  Stack,
  Group,
  Modal,
  ScrollArea,
  Loader,
  TextInput,
  Select,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from "@app/styles/zIndex";

import { useCardModalAnimation } from "@app/hooks/useCardModalAnimation";
import { CardExpansionModal } from "@app/components/watchedFolders/CardExpansionModal";
import { StatCard } from "@app/components/watchedFolders/StatCard";
import { useTranslation } from "react-i18next";
import SearchIcon from "@mui/icons-material/Search";
import DownloadIcon from "@mui/icons-material/Download";
import HistoryIcon from "@mui/icons-material/History";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import ReplayIcon from "@mui/icons-material/Replay";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import VisibilityIcon from "@mui/icons-material/Visibility";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import CloseIcon from "@mui/icons-material/Close";
import JSZip from "jszip";
import { useWatchedFolders } from "@app/hooks/useWatchedFolders";
import { useFolderData } from "@app/hooks/useFolderData";
import type { TFunction } from "i18next";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import {
  WATCHED_FOLDER_VIEW_ID,
  WATCHED_FOLDER_WORKBENCH_ID,
} from "@app/components/watchedFolders/WatchedFoldersRegistration";
import { automationStorage } from "@app/services/automationStorage";
import {
  useFolderAutomation,
  resolveInputFile,
} from "@app/hooks/useFolderAutomation";
import { useLocalFolderPoller } from "@app/hooks/useLocalFolderPoller";
import { AutomationConfig } from "@app/types/automation";
import { iconMap } from "@app/components/tools/automate/iconMap";
import { fileStorage } from "@app/services/fileStorage";
import { FileId, StirlingFile } from "@app/types/fileContext";
import {
  WatchedFolderHomePage,
  humaniseOp,
} from "@app/components/watchedFolders/WatchedFolderHomePage";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { FilePreviewModal } from "@app/components/watchedFolders/FilePreviewModal";
import { folderDirectoryHandleStorage } from "@app/services/folderDirectoryHandleStorage";

const SORT_OPTIONS = [
  {
    value: "newest",
    labelKey: "watchedFolders.workbench.sortNewest",
    labelDefault: "Newest",
  },
  {
    value: "oldest",
    labelKey: "watchedFolders.workbench.sortOldest",
    labelDefault: "Oldest",
  },
  {
    value: "name-asc",
    labelKey: "watchedFolders.workbench.sortNameAsc",
    labelDefault: "A → Z",
  },
  {
    value: "name-desc",
    labelKey: "watchedFolders.workbench.sortNameDesc",
    labelDefault: "Z → A",
  },
];

const ACTIVITY_STATUS_OPTIONS = [
  {
    value: "all",
    labelKey: "watchedFolders.workbench.filterAll",
    labelDefault: "All",
  },
  {
    value: "processed",
    labelKey: "watchedFolders.status.done",
    labelDefault: "Done",
  },
  {
    value: "processing",
    labelKey: "watchedFolders.status.active",
    labelDefault: "Active",
  },
  {
    value: "error",
    labelKey: "watchedFolders.workbench.failed",
    labelDefault: "Failed",
  },
  {
    value: "pending",
    labelKey: "watchedFolders.workbench.filterPending",
    labelDefault: "Pending",
  },
];

function FilterSortBar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  extra,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  sort: string;
  onSortChange: (v: string) => void;
  extra?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Box
      style={{
        display: "flex",
        gap: "0.5rem",
        alignItems: "center",
        padding: "0.5rem 0.75rem",
      }}
    >
      <TextInput
        size="xs"
        placeholder={t("watchedFolders.workbench.search", "Search…")}
        value={search}
        onChange={(e) => onSearchChange(e.currentTarget.value)}
        leftSection={<SearchIcon style={{ fontSize: "0.875rem" }} />}
        style={{ flex: 1 }}
        styles={{ input: { fontSize: "0.75rem" } }}
      />
      {extra}
      <Select
        size="xs"
        value={sort}
        onChange={(v) => v && onSortChange(v)}
        data={SORT_OPTIONS.map((o) => ({
          value: o.value,
          label: t(o.labelKey, o.labelDefault),
        }))}
        style={{ width: "6.5rem" }}
        styles={{ input: { fontSize: "0.75rem" } }}
        comboboxProps={{ withinPortal: true, zIndex: 400 }}
      />
    </Box>
  );
}

interface WatchedFolderWorkbenchViewProps {
  data: {
    folderId: string | null;
    pendingFileId?: string;
    pendingFileIds?: string[];
  };
}

export function timeAgo(date: Date, t: TFunction): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return t("watchedFolders.time.justNow", "just now");
  const mins = Math.floor(secs / 60);
  if (mins < 60)
    return t("watchedFolders.time.minutesAgo", {
      count: mins,
      defaultValue: `${mins}m ago`,
    });
  const hours = Math.floor(mins / 60);
  if (hours < 24)
    return t("watchedFolders.time.hoursAgo", {
      count: hours,
      defaultValue: `${hours}h ago`,
    });
  const days = Math.floor(hours / 24);
  return t("watchedFolders.time.daysAgo", {
    count: days,
    defaultValue: `${days}d ago`,
  });
}

function RetryCountdown({
  nextRetryAt,
  t,
}: {
  nextRetryAt: number;
  t: TFunction;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, nextRetryAt - Date.now()),
  );
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, nextRetryAt - Date.now()));
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [nextRetryAt]);
  const mins = Math.ceil(remaining / 60_000);
  return (
    <Text size="xs" c="yellow.6" style={{ flexShrink: 0 }}>
      {remaining <= 0
        ? t("watchedFolders.workbench.retryingSoon", "retrying…")
        : t("watchedFolders.workbench.retryIn", {
            count: mins,
            defaultValue: `retry in ${mins}m`,
          })}
    </Text>
  );
}

export function WatchedFolderWorkbenchView({
  data,
}: WatchedFolderWorkbenchViewProps) {
  const { folderId } = data;
  const { t } = useTranslation();
  const { toolRegistry, setCustomWorkbenchViewData } = useToolWorkflow();
  const { actions } = useNavigationActions();
  const { folders, updateFolder } = useWatchedFolders();
  const folder = folders.find((f) => f.id === folderId);
  const { runPipeline } = useFolderAutomation(toolRegistry);
  useLocalFolderPoller(runPipeline);

  const {
    folderRecord,
    fileIds,
    processingFileIds,
    addFile,
    updateFileMetadata,
    removeFile,
  } = useFolderData(folderId ?? "");

  const isLocalFolder = folder?.inputSource === "local-folder";

  const [isDragOver, setIsDragOver] = useState(false);
  const [localInputFolderName, setLocalInputFolderName] = useState<
    string | null
  >(null);
  const [outputFiles, setOutputFiles] = useState<StirlingFile[]>([]);
  const [inputFiles, setInputFiles] = useState<StirlingFile[]>([]);
  const [previewFileId, setPreviewFileId] = useState<FileId | null>(null);
  const [previewFileName, setPreviewFileName] = useState("");
  const [previewFile, setPreviewFile] = useState<File | null>(null);

  // Filter / sort state
  const [activitySearch, setActivitySearch] = useState("");
  const [activitySort, setActivitySort] = useState("newest");
  const [activityStatusFilter, setActivityStatusFilter] = useState("all");
  const [automation, setAutomation] = useState<AutomationConfig | null>(null);
  const handledPendingRef = useRef<string | null>(null);

  // Load input/output blobs from the main file store whenever folderRecord changes.
  useEffect(() => {
    if (!folderRecord) {
      setInputFiles([]);
      setOutputFiles([]);
      return;
    }
    const inputIds = Object.keys(folderRecord.files);
    Promise.all(
      inputIds.map((id) => fileStorage.getStirlingFile(id as FileId)),
    ).then((files) => setInputFiles(files.filter(Boolean) as StirlingFile[]));

    const outputIds = Object.values(folderRecord.files).flatMap(
      (m) => m.displayFileIds ?? (m.displayFileId ? [m.displayFileId] : []),
    );
    Promise.all(
      outputIds.map((id) => fileStorage.getStirlingFile(id as FileId)),
    ).then((files) => setOutputFiles(files.filter(Boolean) as StirlingFile[]));
  }, [folderRecord]);

  useEffect(() => {
    if (folder?.automationId) {
      automationStorage.getAutomation(folder.automationId).then(setAutomation);
    }
  }, [folder?.automationId]);

  useEffect(() => {
    if (isLocalFolder && folderId) {
      folderDirectoryHandleStorage
        .getInput(folderId)
        .then((h) => setLocalInputFolderName(h?.name ?? null));
    } else {
      setLocalInputFolderName(null);
    }
  }, [isLocalFolder, folderId]);

  const handleFiles = useCallback(
    async (files: FileList | File[], sourceFileId?: string) => {
      if (!folder) return;
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        if (!file.name.toLowerCase().endsWith(".pdf")) continue;

        let inputFileId: string;
        let ownedByFolder = false;
        if (sourceFileId) {
          // File from sidebar — already in stirling-pdf-files; user still owns it
          inputFileId = sourceFileId;
        } else {
          const resolved = await resolveInputFile(file);
          inputFileId = resolved.inputFileId;
          ownedByFolder = resolved.ownedByFolder;
        }

        if (folderRecord?.files[inputFileId]) {
          // Re-processing an existing file — reset status without losing addedAt/ownedByFolder
          await updateFileMetadata(inputFileId, {
            status: "pending",
            errorMessage: undefined,
          });
        } else {
          await addFile(inputFileId, {
            status: "pending",
            name: file.name,
            ownedByFolder: ownedByFolder || undefined,
          });
        }

        // Only run immediately if not paused; pending files will run when folder is resumed
        if (!folder.isPaused) {
          runPipeline(folder, file, inputFileId, ownedByFolder);
        }
      }
    },
    [folder, folderRecord, addFile, updateFileMetadata, runPipeline],
  );

  useEffect(() => {
    const { pendingFileId, pendingFileIds } = data;

    // Multi-file pending (from sidebar multi-select drag to sidebar folder card)
    if (pendingFileIds && pendingFileIds.length > 0) {
      const key = pendingFileIds.join(",");
      if (handledPendingRef.current === key) return;
      handledPendingRef.current = key;
      setCustomWorkbenchViewData(WATCHED_FOLDER_VIEW_ID, { folderId });
      Promise.all(
        pendingFileIds.map((id) => fileStorage.getStirlingFile(id as FileId)),
      ).then(async (results) => {
        for (let i = 0; i < results.length; i++) {
          if (results[i]) await handleFiles([results[i]!], pendingFileIds[i]);
        }
      });
      return;
    }

    // Single pending file (legacy path)
    if (!pendingFileId || handledPendingRef.current === pendingFileId) return;
    handledPendingRef.current = pendingFileId;
    setCustomWorkbenchViewData(WATCHED_FOLDER_VIEW_ID, { folderId });
    fileStorage
      .getStirlingFile(pendingFileId as FileId)
      .then((stirlingFile) => {
        if (stirlingFile) handleFiles([stirlingFile], pendingFileId);
      });
  }, [data, folderId, handleFiles, setCustomWorkbenchViewData]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      // Multi-file sidebar drag
      const multiRaw = e.dataTransfer.getData("watchedFolderFileIds");
      if (multiRaw) {
        try {
          const ids: string[] = JSON.parse(multiRaw);
          Promise.all(
            ids.map((id) => fileStorage.getStirlingFile(id as FileId)),
          ).then(async (results) => {
            for (let i = 0; i < results.length; i++) {
              if (results[i]) await handleFiles([results[i]!], ids[i]);
            }
          });
          return;
        } catch {
          /* fall through */
        }
      }

      // Single sidebar drag
      const sidebarFileId = e.dataTransfer.getData("watchedFolderFileId");
      if (sidebarFileId) {
        fileStorage
          .getStirlingFile(sidebarFileId as FileId)
          .then((stirlingFile) => {
            if (stirlingFile) handleFiles([stirlingFile], sidebarFileId);
          });
      } else if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0)
        handleFiles(e.target.files);
      e.target.value = "";
    },
    [handleFiles],
  );

  const handleView = useCallback((file: StirlingFile) => {
    setPreviewFileId(file.fileId);
    setPreviewFileName(file.name);
  }, []);

  const handleDownload = useCallback(async (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const goHome = useCallback(() => {
    setCustomWorkbenchViewData(WATCHED_FOLDER_VIEW_ID, { folderId: null });
    actions.setWorkbench(WATCHED_FOLDER_WORKBENCH_ID);
  }, [setCustomWorkbenchViewData, actions]);

  const handlePauseResume = useCallback(async () => {
    if (!folder) return;
    const nowPaused = !folder.isPaused;
    await updateFolder({ ...folder, isPaused: nowPaused });
    // When resuming, run all files that were queued while paused
    if (!nowPaused) {
      const pendingIds = fileIds.filter(
        (id) => folderRecord?.files[id]?.status === "pending",
      );
      for (const fileId of pendingIds) {
        const file = inputFiles.find((f) => f.fileId === fileId);
        if (file) {
          runPipeline(
            { ...folder, isPaused: false },
            file,
            fileId,
            folderRecord?.files[fileId]?.ownedByFolder ?? false,
          );
        }
      }
    }
  }, [folder, updateFolder, fileIds, folderRecord, inputFiles, runPipeline]);

  const {
    phase: statsModalPhase,
    cardRect: statsCardRect,
    textExpanded: statsTextExpanded,
    openModal: openStatsModal,
    closeModal: closeStatsModal,
  } = useCardModalAnimation();
  const [statsPeriod, setStatsPeriod] = useState<"24h" | "7d" | "30d" | "all">(
    "7d",
  );

  const dashboardStats = useMemo(() => {
    const getTs = (d: Date | string | number | undefined): number =>
      !d
        ? 0
        : d instanceof Date
          ? d.getTime()
          : typeof d === "number"
            ? d
            : new Date(d).getTime();
    const now = Date.now();
    const cutoff =
      statsPeriod === "24h"
        ? now - 86_400_000
        : statsPeriod === "7d"
          ? now - 7 * 86_400_000
          : statsPeriod === "30d"
            ? now - 30 * 86_400_000
            : 0;
    const entries = Object.entries(folderRecord?.files ?? {}).filter(
      ([, m]) => getTs(m.addedAt) >= cutoff,
    );
    const processed = entries.filter(
      ([, m]) => m.status === "processed",
    ).length;
    const failed = entries.filter(([, m]) => m.status === "error").length;
    const pending = entries.filter(
      ([, m]) => m.status === "pending" || m.status === "processing",
    ).length;
    const totalIn = entries.reduce(
      (s, [id]) => s + (inputFiles.find((f) => f.fileId === id)?.size ?? 0),
      0,
    );
    const totalOut = entries
      .filter(([, m]) => m.status === "processed")
      .reduce((s, [, m]) => {
        const ids =
          m.displayFileIds ?? (m.displayFileId ? [m.displayFileId] : []);
        return (
          s +
          ids.reduce(
            (ss, oid) =>
              ss + (outputFiles.find((f) => f.fileId === oid)?.size ?? 0),
            0,
          )
        );
      }, 0);
    const isHourly = statsPeriod === "24h";
    const bucketMs = isHourly ? 3_600_000 : 86_400_000;
    const bucketCount = isHourly
      ? 24
      : statsPeriod === "7d"
        ? 7
        : statsPeriod === "30d"
          ? 30
          : 30;
    const buckets: Array<{ processed: number; failed: number }> = Array.from(
      { length: bucketCount },
      () => ({ processed: 0, failed: 0 }),
    );
    for (const [, m] of Object.entries(folderRecord?.files ?? {})) {
      const ts = getTs(m.processedAt ?? m.addedAt);
      if (!ts) continue;
      const idx = Math.floor((now - ts) / bucketMs);
      if (idx >= 0 && idx < bucketCount) {
        const b = buckets[bucketCount - 1 - idx];
        if (m.status === "processed") b.processed++;
        else if (m.status === "error") b.failed++;
      }
    }
    const maxBucket = Math.max(
      ...buckets.map((b) => b.processed + b.failed),
      1,
    );
    return {
      processed,
      failed,
      pending,
      totalIn,
      totalOut,
      saved: totalIn - totalOut,
      buckets,
      maxBucket,
    };
  }, [folderRecord, inputFiles, outputFiles, statsPeriod]);

  const [expandedActivityIds, setExpandedActivityIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<string>>(
    new Set(),
  );
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const [chartHover, setChartHover] = useState<{
    i: number;
    relX: number;
    relY: number;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[] } | null>(
    null,
  );
  const listRef = useRef<HTMLDivElement>(null);
  const toggleActivityRow = useCallback((id: string) => {
    setExpandedActivityIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent, ids: string[]) => {
      if (ids.length === 0) return;
      const cur = focusedRowIndex ?? -1;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedRowIndex(Math.min(cur + 1, ids.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedRowIndex(Math.max(cur - 1, 0));
      } else if (e.key === " " && cur >= 0) {
        e.preventDefault();
        const id = ids[cur];
        setSelectedActivityIds((prev) => {
          const n = new Set(prev);
          if (n.has(id)) n.delete(id);
          else n.add(id);
          return n;
        });
      } else if (e.key === "Enter" && cur >= 0) {
        e.preventDefault();
        toggleActivityRow(ids[cur]);
      } else if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSelectedActivityIds(new Set(ids));
      } else if (e.key === "Escape") {
        setSelectedActivityIds(new Set());
        setFocusedRowIndex(null);
      }
    },
    [focusedRowIndex, toggleActivityRow],
  );

  // input fileId → output StirlingFiles produced by that run
  const activityOutputMap = useMemo(() => {
    const map = new Map<string, StirlingFile[]>();
    for (const [id, meta] of Object.entries(folderRecord?.files ?? {})) {
      const ids =
        meta.displayFileIds ?? (meta.displayFileId ? [meta.displayFileId] : []);
      const files = ids
        .map((oid) => outputFiles.find((f) => f.fileId === oid))
        .filter((f): f is StirlingFile => !!f);
      if (files.length > 0) map.set(id, files);
    }
    return map;
  }, [folderRecord, outputFiles]);

  const execDelete = useCallback(
    async (ids: string[], withOutputFiles: boolean) => {
      await Promise.all(
        ids.map(async (id) => {
          if (withOutputFiles) {
            const meta = folderRecord?.files[id];
            const outputIds =
              meta?.displayFileIds ??
              (meta?.displayFileId ? [meta.displayFileId] : []);
            await Promise.all(
              outputIds.map((oid) =>
                fileStorage.deleteStirlingFile(oid as FileId).catch(() => {}),
              ),
            );
          }
          await removeFile(id);
        }),
      );
      setSelectedActivityIds((prev) => {
        const n = new Set(prev);
        ids.forEach((id) => n.delete(id));
        return n;
      });
      setDeleteConfirm(null);
    },
    [folderRecord, removeFile],
  );

  const handleDeleteOne = useCallback((fileId: string) => {
    setDeleteConfirm({ ids: [fileId] });
  }, []);

  const handleBatchDelete = useCallback(() => {
    setDeleteConfirm({ ids: [...selectedActivityIds] });
  }, [selectedActivityIds]);

  const doRetryIds = useCallback(
    (ids: Iterable<string>) => {
      if (!folder) return;
      for (const id of ids) {
        const meta = folderRecord?.files[id];
        if (meta?.status !== "error") continue;
        const inputFile = inputFiles.find((f) => f.fileId === id);
        if (!inputFile) continue;
        updateFileMetadata(id, { status: "pending", errorMessage: undefined });
        void runPipeline(folder, inputFile, id, meta?.ownedByFolder ?? false);
      }
    },
    [folder, folderRecord, inputFiles, updateFileMetadata, runPipeline],
  );

  const handleBatchRetry = useCallback(() => {
    const hasMixed = [...selectedActivityIds].some(
      (id) => folderRecord?.files[id]?.status !== "error",
    );
    if (
      hasMixed &&
      !window.confirm(
        t(
          "watchedFolders.workbench.retryMixedConfirm",
          "Some selected files have already completed and will be skipped. Only failed files will be retried. Continue?",
        ),
      )
    )
      return;
    doRetryIds(selectedActivityIds);
  }, [selectedActivityIds, folderRecord, doRetryIds]);

  const collectExportFiles = useCallback(
    (ids: Iterable<string>): StirlingFile[] => {
      const files: StirlingFile[] = [];
      for (const id of ids) {
        const outputs = activityOutputMap.get(id);
        const toAdd =
          outputs && outputs.length > 0
            ? outputs
            : ([inputFiles.find((f) => f.fileId === id)].filter(
                Boolean,
              ) as StirlingFile[]);
        files.push(...toAdd);
      }
      return files;
    },
    [activityOutputMap, inputFiles],
  );

  const handleBatchDownload = useCallback(
    async (ids: Iterable<string> = selectedActivityIds) => {
      const zip = new JSZip();
      let count = 0;
      for (const f of collectExportFiles(ids)) {
        zip.file(f.name, await f.arrayBuffer());
        count++;
      }
      if (count === 0) return;
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${folder?.name ?? "watch-folder"}-export.zip`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [selectedActivityIds, collectExportFiles, folder],
  );

  const handleBatchDownloadSeparate = useCallback(
    async (ids: Iterable<string> = selectedActivityIds) => {
      for (const f of collectExportFiles(ids)) {
        const url = URL.createObjectURL(f);
        const a = document.createElement("a");
        a.href = url;
        a.download = f.name;
        a.click();
        URL.revokeObjectURL(url);
        await new Promise((res) => setTimeout(res, 150));
      }
    },
    [selectedActivityIds, collectExportFiles],
  );

  // ── Filtered + sorted lists — all before early returns ──

  const filteredActivityIds = useMemo(() => {
    const q = activitySearch.toLowerCase();
    let items = fileIds.map((id) => {
      const meta = folderRecord?.files[id];
      const name =
        meta?.name ?? inputFiles.find((f) => f.fileId === id)?.name ?? id;
      const status = meta?.status ?? "pending";
      const time = meta?.processedAt
        ? new Date(meta.processedAt).getTime()
        : meta?.addedAt
          ? new Date(meta.addedAt).getTime()
          : 0;
      return { id, name, status, time };
    });
    if (q) items = items.filter((i) => i.name.toLowerCase().includes(q));
    if (activityStatusFilter !== "all")
      items = items.filter((i) => i.status === activityStatusFilter);
    if (activitySort === "newest") items = [...items].reverse();
    else if (activitySort === "name-asc")
      items = [...items].sort((a, b) => a.name.localeCompare(b.name));
    else if (activitySort === "name-desc")
      items = [...items].sort((a, b) => b.name.localeCompare(a.name));
    // 'oldest' keeps the original order (insertion order = oldest first)
    return items.map((i) => i.id);
  }, [
    fileIds,
    folderRecord,
    inputFiles,
    activitySearch,
    activityStatusFilter,
    activitySort,
  ]);

  const handleRetryAllFiltered = useCallback(() => {
    doRetryIds(filteredActivityIds);
  }, [filteredActivityIds, doRetryIds]);

  // Early returns — after all hooks
  if (!folderId) return <WatchedFolderHomePage />;

  const FolderIcon = folder
    ? iconMap[folder.icon as keyof typeof iconMap] || iconMap.FolderIcon
    : iconMap.FolderIcon;

  if (!folder) {
    return (
      <Box
        p="xl"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <Text c="dimmed">
          {t("watchedFolders.folderNotFound", "Folder not found")}
        </Text>
      </Box>
    );
  }

  const failedFileIds = fileIds.filter(
    (id) => folderRecord?.files[id]?.status === "error",
  );
  const isProcessingAny = processingFileIds.length > 0;
  const ops = automation?.operations ?? [];

  const hasCompressStep = ops.some((op) => op.operation === "compress");
  const totalInputBytes = inputFiles.reduce((sum, f) => sum + f.size, 0);
  const totalOutputBytes = outputFiles.reduce((sum, f) => sum + f.size, 0);
  const dataSavedBytes = totalInputBytes - totalOutputBytes;

  function formatBytes(bytes: number): string {
    const abs = Math.abs(bytes);
    if (abs >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (abs >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (abs >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  }

  const daysRunning = folder.createdAt
    ? Math.floor((Date.now() - new Date(folder.createdAt).getTime()) / 86400000)
    : null;

  return (
    <Box
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <Box
        px="xl"
        py="md"
        style={{
          borderBottom: "0.0625rem solid var(--border-subtle)",
          backgroundColor: "var(--bg-toolbar)",
          flexShrink: 0,
        }}
      >
        <Group justify="space-between" align="center">
          <Group gap="md" align="center">
            <ActionIcon
              variant="tertiary"
              size="sm"
              onClick={goHome}
              aria-label={t("watchedFolders.actions.back", "Back")}
            >
              <ArrowBackIcon style={{ fontSize: "1rem" }} />
            </ActionIcon>

            {/* Icon with status dot */}
            <Box style={{ position: "relative", flexShrink: 0 }}>
              <Box
                style={{
                  width: "2.5rem",
                  height: "2.5rem",
                  borderRadius: "0.625rem",
                  backgroundColor: `${folder.accentColor}18`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FolderIcon
                  style={{ fontSize: "1.25rem", color: folder.accentColor }}
                />
              </Box>
              <Box
                style={{
                  position: "absolute",
                  bottom: "-0.1875rem",
                  right: "-0.1875rem",
                  width: "0.75rem",
                  height: "0.75rem",
                  borderRadius: "50%",
                  backgroundColor: "var(--bg-toolbar)",
                  textAlign: "center",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Box
                  style={{
                    width: "0.4375rem",
                    height: "0.4375rem",
                    borderRadius: "50%",
                    backgroundColor: folder.isPaused
                      ? "var(--color-yellow-500)"
                      : isProcessingAny
                        ? "var(--mantine-color-blue-filled)"
                        : "var(--color-green-500)",
                  }}
                />
              </Box>
            </Box>

            <Stack gap={2}>
              <Text
                fw={700}
                size="md"
                style={{ letterSpacing: "-0.01em", lineHeight: 1.2 }}
              >
                {folder.name}
              </Text>
              {/* Pipeline summary */}
              {ops.length > 0 && (
                <Group gap={4} wrap="nowrap">
                  {ops.map((op, i) => (
                    <Group key={i} gap={4} wrap="nowrap" align="center">
                      {i > 0 && (
                        <ChevronRightIcon
                          style={{
                            fontSize: "0.625rem",
                            color: "var(--mantine-color-gray-5)",
                          }}
                        />
                      )}
                      <Text
                        size="xs"
                        c="dimmed"
                        style={{ fontSize: "0.6875rem" }}
                      >
                        {humaniseOp(op.operation)}
                      </Text>
                    </Group>
                  ))}
                </Group>
              )}
              {folder.description && !ops.length && (
                <Text size="xs" c="dimmed">
                  {folder.description}
                </Text>
              )}
              {isLocalFolder && (
                <Text
                  size="xs"
                  c={localInputFolderName ? "green" : "yellow"}
                  style={{ fontSize: "0.6875rem" }}
                >
                  {localInputFolderName
                    ? t("watchedFolders.workbench.watching", {
                        name: localInputFolderName,
                        defaultValue: `Watching: ${localInputFolderName}`,
                      })
                    : t(
                        "watchedFolders.workbench.noInputFolder",
                        "No input folder — edit to configure",
                      )}
                </Text>
              )}
            </Stack>
          </Group>

          {/* Add files + pause/resume */}
          <Group gap="sm" align="center">
            {folder.isPaused ? (
              <Button
                size="sm"
                variant="secondary"
                accent="success"
                onClick={handlePauseResume}
                leftSection={<PlayArrowIcon style={{ fontSize: "0.875rem" }} />}
              >
                {t("watchedFolders.workbench.resume", "Resume")}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="tertiary"
                onClick={handlePauseResume}
                leftSection={<PauseIcon style={{ fontSize: "0.875rem" }} />}
              >
                {t("watchedFolders.workbench.pause", "Pause")}
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                document
                  .getElementById(`folder-file-input-${folderId}`)
                  ?.click()
              }
            >
              {t("watchedFolders.workbench.addFiles", "Add files")}
            </Button>
            <input
              id={`folder-file-input-${folderId}`}
              type="file"
              accept=".pdf"
              multiple
              style={{ display: "none" }}
              onChange={handleFileInput}
            />
          </Group>
        </Group>
      </Box>

      {/* ── Body ── */}
      <Box style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left: Activity */}
        <Box
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            outline: isDragOver
              ? "0.125rem dashed var(--mantine-color-blue-filled)"
              : "none",
            outlineOffset: "-0.25rem",
            backgroundColor: isDragOver
              ? "var(--mantine-color-blue-light)"
              : "transparent",
            transition: "background-color 0.15s ease",
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node))
              setIsDragOver(false);
          }}
          onDrop={handleDrop}
        >
          {/* Storage cards */}
          <Box style={{ padding: "0.5rem 1rem 0", flexShrink: 0 }}>
            <Box
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(4.5rem, 1fr))",
                gap: "0.5rem",
                marginBottom: "0.5rem",
              }}
            >
              {/* Inputs */}
              <StatCard
                icon={
                  <FolderOpenIcon
                    style={{
                      fontSize: "1.125rem",
                      color: "var(--mantine-color-blue-filled)",
                    }}
                  />
                }
                count={inputFiles.length}
                label={t("watchedFolders.workbench.inputs", "Inputs")}
                hoverColor="var(--mantine-color-blue-filled)"
                isActive={activityStatusFilter === "all"}
                onClick={() => {
                  if (
                    activityStatusFilter === "all" &&
                    expandedActivityIds.size > 0
                  ) {
                    setExpandedActivityIds(new Set());
                  } else {
                    setActivityStatusFilter("all");
                    setExpandedActivityIds(new Set(fileIds));
                  }
                }}
              />

              {/* Outputs */}
              <StatCard
                icon={
                  <TaskAltIcon
                    style={{
                      fontSize: "1.125rem",
                      color: "var(--color-green-500)",
                    }}
                  />
                }
                count={outputFiles.length}
                label={t("watchedFolders.workbench.outputs", "Outputs")}
                hoverColor="var(--color-green-500)"
                isActive={activityStatusFilter === "processed"}
                onClick={() => {
                  setActivityStatusFilter(
                    activityStatusFilter === "processed" ? "all" : "processed",
                  );
                  setExpandedActivityIds(new Set());
                }}
              />

              {/* Failed */}
              <StatCard
                icon={
                  <ErrorOutlineIcon
                    style={{
                      fontSize: "1.125rem",
                      color:
                        failedFileIds.length > 0
                          ? "var(--color-red-500)"
                          : "var(--mantine-color-dimmed)",
                    }}
                  />
                }
                count={failedFileIds.length}
                label={t("watchedFolders.workbench.failed", "Failed")}
                hoverColor="var(--color-red-500)"
                isActive={activityStatusFilter === "error"}
                onClick={
                  failedFileIds.length > 0
                    ? () => {
                        setActivityStatusFilter(
                          activityStatusFilter === "error" ? "all" : "error",
                        );
                        setExpandedActivityIds(new Set());
                      }
                    : undefined
                }
              />

              {/* Data saved — only when compress is in pipeline */}
              {hasCompressStep && (
                <StatCard
                  icon={
                    <DownloadIcon
                      style={{
                        fontSize: "1.125rem",
                        color:
                          dataSavedBytes > 0
                            ? "var(--color-green-500)"
                            : "var(--mantine-color-dimmed)",
                      }}
                    />
                  }
                  count={dataSavedBytes > 0 ? formatBytes(dataSavedBytes) : "—"}
                  label={t("watchedFolders.workbench.dataSaved", "Saved")}
                />
              )}

              {/* Days running */}
              <StatCard
                icon={
                  <HistoryIcon
                    style={{
                      fontSize: "1.125rem",
                      color: "var(--mantine-color-dimmed)",
                    }}
                  />
                }
                count={
                  daysRunning !== null && daysRunning > 0
                    ? `${daysRunning}d`
                    : "—"
                }
                label={t("watchedFolders.workbench.running", "Running")}
                hoverColor="var(--mantine-color-dimmed)"
                onClick={openStatsModal}
              />
            </Box>
          </Box>

          {/* Queue depth indicator */}
          {(processingFileIds.length > 0 ||
            fileIds.filter(
              (id) => folderRecord?.files[id]?.status === "pending",
            ).length > 0) &&
            (() => {
              const queuedCount = fileIds.filter(
                (id) => folderRecord?.files[id]?.status === "pending",
              ).length;
              const activeCount = processingFileIds.length;
              const totalWidth = activeCount + queuedCount;
              return (
                <Box style={{ padding: "0 1rem 0.5rem", flexShrink: 0 }}>
                  <Box
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {activeCount > 0 && (
                      <Text
                        style={{
                          fontSize: "0.625rem",
                          color: "var(--mantine-color-blue-filled)",
                        }}
                      >
                        {t("watchedFolders.workbench.countProcessing", {
                          count: activeCount,
                          defaultValue: `${activeCount} processing`,
                        })}
                      </Text>
                    )}
                    {queuedCount > 0 && (
                      <Text style={{ fontSize: "0.625rem" }} c="dimmed">
                        {t("watchedFolders.workbench.countQueued", {
                          count: queuedCount,
                          defaultValue: `${queuedCount} queued`,
                        })}
                      </Text>
                    )}
                  </Box>
                  <Box
                    style={{
                      height: "0.1875rem",
                      borderRadius: "999px",
                      backgroundColor: "var(--border-subtle)",
                      overflow: "hidden",
                    }}
                  >
                    <Box
                      style={{
                        display: "flex",
                        height: "100%",
                        width: `${(activeCount / totalWidth) * 100}%`,
                      }}
                    >
                      <div
                        style={{
                          flex: activeCount,
                          backgroundColor: "var(--mantine-color-blue-filled)",
                          borderRadius: "999px",
                          animation: "pulse 1.5s ease-in-out infinite",
                        }}
                      />
                    </Box>
                  </Box>
                </Box>
              );
            })()}

          {/* Activity label */}
          <Box
            style={{
              padding: "1rem 1rem 0.5rem",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Text
              fw={600}
              style={{
                fontSize: "0.75rem",
                flex: 1,
                color: isDragOver
                  ? "var(--mantine-color-blue-filled)"
                  : "var(--tool-subcategory-text-color)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {isDragOver
                ? t("watchedFolders.workbench.dropToProcess", "Drop to process")
                : t("watchedFolders.workbench.activity", "Activity")}
            </Text>
            {activityStatusFilter === "error" &&
              filteredActivityIds.length > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleRetryAllFiltered}
                  leftSection={<ReplayIcon style={{ fontSize: "0.75rem" }} />}
                >
                  {t("watchedFolders.workbench.retryAll", "Retry all")}
                </Button>
              )}
            {activityStatusFilter === "processed" &&
              filteredActivityIds.length > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void handleBatchDownload(filteredActivityIds)
                    }
                    leftSection={
                      <DownloadIcon style={{ fontSize: "0.75rem" }} />
                    }
                  >
                    {t("watchedFolders.workbench.exportZip", "Export zip")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void handleBatchDownloadSeparate(filteredActivityIds)
                    }
                    leftSection={
                      <DownloadIcon style={{ fontSize: "0.75rem" }} />
                    }
                  >
                    {t(
                      "watchedFolders.workbench.exportSeparately",
                      "Export separately",
                    )}
                  </Button>
                </>
              )}
          </Box>

          {/* Activity filter/sort toolbar */}
          {fileIds.length > 0 && (
            <FilterSortBar
              search={activitySearch}
              onSearchChange={setActivitySearch}
              sort={activitySort}
              onSortChange={setActivitySort}
              extra={
                <Select
                  size="xs"
                  value={activityStatusFilter}
                  onChange={(v) => v && setActivityStatusFilter(v)}
                  data={ACTIVITY_STATUS_OPTIONS.map((o) => ({
                    value: o.value,
                    label: t(o.labelKey, o.labelDefault),
                  }))}
                  style={{ width: "5.5rem" }}
                  styles={{ input: { fontSize: "0.75rem" } }}
                  comboboxProps={{ withinPortal: true, zIndex: 400 }}
                />
              }
            />
          )}

          {selectedActivityIds.size > 0 &&
            (() => {
              const hasAnyFailed = [...selectedActivityIds].some(
                (id) =>
                  folderRecord?.files[id]?.status === "error" &&
                  inputFiles.some((f) => f.fileId === id),
              );
              const hasDownloadable = [...selectedActivityIds].some(
                (id) =>
                  (activityOutputMap.get(id)?.length ?? 0) > 0 ||
                  inputFiles.some((f) => f.fileId === id),
              );
              const showRetry =
                hasAnyFailed && activityStatusFilter !== "processed";
              const showExport =
                hasDownloadable && activityStatusFilter !== "error";
              return (
                <Box
                  style={{
                    padding: "0.375rem 0.75rem",
                    borderTop: "0.0625rem solid var(--border-subtle)",
                    borderBottom: "0.0625rem solid var(--border-subtle)",
                    backgroundColor: "var(--mantine-color-blue-light)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    flexShrink: 0,
                  }}
                >
                  <Text
                    size="xs"
                    fw={600}
                    style={{ color: "var(--mantine-color-blue-filled)" }}
                  >
                    {t("watchedFolders.workbench.countSelected", {
                      count: selectedActivityIds.size,
                      defaultValue: `${selectedActivityIds.size} selected`,
                    })}
                  </Text>
                  {selectedActivityIds.size < filteredActivityIds.length && (
                    <Button
                      size="sm"
                      variant="tertiary"
                      onClick={() =>
                        setSelectedActivityIds(new Set(filteredActivityIds))
                      }
                    >
                      {t("watchedFolders.workbench.selectAll", {
                        count: filteredActivityIds.length,
                        defaultValue: `Select all ${filteredActivityIds.length}`,
                      })}
                    </Button>
                  )}
                  <Box style={{ flex: 1 }} />
                  {showRetry && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleBatchRetry}
                      leftSection={
                        <ReplayIcon style={{ fontSize: "0.75rem" }} />
                      }
                    >
                      {t("watchedFolders.actions.retry", "Retry")}
                    </Button>
                  )}
                  {showExport && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleBatchDownload()}
                        leftSection={
                          <DownloadIcon style={{ fontSize: "0.75rem" }} />
                        }
                      >
                        {t("watchedFolders.workbench.exportZip", "Export zip")}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleBatchDownloadSeparate()}
                        leftSection={
                          <DownloadIcon style={{ fontSize: "0.75rem" }} />
                        }
                      >
                        {t(
                          "watchedFolders.workbench.exportSeparately",
                          "Export separately",
                        )}
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    accent="danger"
                    onClick={() => void handleBatchDelete()}
                    leftSection={
                      <DeleteOutlineIcon style={{ fontSize: "0.75rem" }} />
                    }
                  >
                    {t("watchedFolders.workbench.delete", "Delete")}
                  </Button>
                  <ActionIcon
                    variant="tertiary"
                    size="sm"
                    onClick={() => setSelectedActivityIds(new Set())}
                    aria-label={t(
                      "watchedFolders.workbench.clearSelection",
                      "Clear selection",
                    )}
                  >
                    <CloseIcon style={{ fontSize: "0.875rem" }} />
                  </ActionIcon>
                </Box>
              );
            })()}

          <ScrollArea
            style={{ flex: 1 }}
            viewportRef={listRef}
            onKeyDown={(e) => handleListKeyDown(e, filteredActivityIds)}
            tabIndex={0}
            styles={{ viewport: { outline: "none" } }}
          >
            <Stack gap="xs" px="md" pb="md">
              {fileIds.length === 0 ? (
                <Text size="xs" c="dimmed" ta="center" py="lg">
                  {t(
                    "watchedFolders.workbench.noActivity",
                    "No activity yet — drop a PDF to start",
                  )}
                </Text>
              ) : filteredActivityIds.length === 0 ? (
                <Text size="xs" c="dimmed" ta="center" py="lg">
                  {t(
                    "watchedFolders.workbench.noActivityMatch",
                    "No matching activity",
                  )}
                </Text>
              ) : (
                <>
                  {filteredActivityIds.map((fileId, rowIdx) => {
                    const meta = folderRecord?.files[fileId];
                    const status = meta?.status ?? "pending";
                    const inputFile = inputFiles.find(
                      (f) => f.fileId === fileId,
                    );
                    const filename = meta?.name ?? inputFile?.name ?? fileId;
                    const isExpanded = expandedActivityIds.has(fileId);
                    const isSelected = selectedActivityIds.has(fileId);
                    const isHovered = hoveredRowId === fileId;
                    const isFocused = focusedRowIndex === rowIdx;
                    const outputs = activityOutputMap.get(fileId) ?? [];
                    const primaryFile = outputs[0] ?? inputFile;
                    return (
                      <Box
                        key={fileId}
                        style={{
                          borderRadius: "var(--mantine-radius-sm)",
                          border: `0.0625rem solid ${isFocused ? "var(--mantine-color-blue-4)" : isSelected ? "var(--mantine-color-blue-filled)" : status === "error" ? "var(--mantine-color-red-light)" : "var(--border-subtle)"}`,
                          backgroundColor: isSelected
                            ? "var(--mantine-color-blue-light)"
                            : "var(--bg-toolbar)",
                          overflow: "hidden",
                          outline: "none",
                        }}
                        onMouseEnter={() => setHoveredRowId(fileId)}
                        onMouseLeave={() => setHoveredRowId(null)}
                        onMouseDown={() => setFocusedRowIndex(rowIdx)}
                      >
                        {/* Row header */}
                        <Box
                          style={{
                            padding: "0.375rem 0.5rem 0.375rem 0.25rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                          onClick={() =>
                            setSelectedActivityIds((prev) => {
                              const n = new Set(prev);
                              if (n.has(fileId)) n.delete(fileId);
                              else n.add(fileId);
                              return n;
                            })
                          }
                        >
                          <ActionIcon
                            variant="tertiary"
                            size="sm"
                            style={{ flexShrink: 0 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleActivityRow(fileId);
                            }}
                            aria-label={
                              isExpanded
                                ? t(
                                    "watchedFolders.actions.collapse",
                                    "Collapse",
                                  )
                                : t("watchedFolders.actions.expand", "Expand")
                            }
                          >
                            <ChevronRightIcon
                              style={{
                                fontSize: "0.75rem",
                                transform: isExpanded
                                  ? "rotate(90deg)"
                                  : "none",
                                transition: "transform 0.15s",
                              }}
                            />
                          </ActionIcon>
                          {status === "processed" && (
                            <CheckCircleOutlineIcon
                              style={{
                                fontSize: "0.875rem",
                                color: "var(--color-green-500)",
                                flexShrink: 0,
                              }}
                            />
                          )}
                          {status === "processing" && (
                            <Loader size="0.625rem" style={{ flexShrink: 0 }} />
                          )}
                          {status === "error" && !meta?.nextRetryAt && (
                            <ErrorOutlineIcon
                              style={{
                                fontSize: "0.875rem",
                                color: "var(--color-red-500)",
                                flexShrink: 0,
                              }}
                            />
                          )}
                          {status === "error" && meta?.nextRetryAt && (
                            <ReplayIcon
                              style={{
                                fontSize: "0.875rem",
                                color: "var(--color-yellow-500)",
                                flexShrink: 0,
                              }}
                            />
                          )}
                          {status === "pending" && (
                            <Box
                              style={{
                                width: "0.5rem",
                                height: "0.5rem",
                                borderRadius: "50%",
                                backgroundColor:
                                  "var(--mantine-color-yellow-5)",
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <Text
                            size="xs"
                            lineClamp={1}
                            style={{ flex: 1, minWidth: 0 }}
                          >
                            {filename}
                          </Text>
                          {status === "error" &&
                            (meta?.failedAttempts ?? 0) > 0 && (
                              <Box
                                style={{
                                  padding: "0.0625rem 0.3rem",
                                  borderRadius: "0.25rem",
                                  backgroundColor:
                                    "var(--mantine-color-red-light)",
                                  border:
                                    "0.0625rem solid var(--mantine-color-red-light)",
                                  flexShrink: 0,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: "0.625rem",
                                    fontWeight: 700,
                                    color: "var(--color-red-500)",
                                    letterSpacing: "0.03em",
                                  }}
                                >
                                  {meta!.failedAttempts}×
                                </Text>
                              </Box>
                            )}
                          {meta?.nextRetryAt && (
                            <RetryCountdown
                              nextRetryAt={meta.nextRetryAt}
                              t={t}
                            />
                          )}
                          <Text
                            size="xs"
                            c="dimmed"
                            style={{ fontSize: "0.6875rem", flexShrink: 0 }}
                          >
                            {meta?.processedAt || meta?.addedAt
                              ? timeAgo(
                                  new Date(meta.processedAt ?? meta.addedAt),
                                  t,
                                )
                              : ""}
                          </Text>
                          {isHovered && (
                            <Box
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.125rem",
                                flexShrink: 0,
                              }}
                            >
                              {!isExpanded && primaryFile && (
                                <ActionIcon
                                  variant="tertiary"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleView(primaryFile);
                                  }}
                                  aria-label={t(
                                    "watchedFolders.workbench.preview",
                                    "Preview",
                                  )}
                                >
                                  <VisibilityIcon
                                    style={{ fontSize: "0.875rem" }}
                                  />
                                </ActionIcon>
                              )}
                              {!isExpanded && primaryFile && (
                                <ActionIcon
                                  variant="tertiary"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleDownload(
                                      primaryFile,
                                      primaryFile.name,
                                    );
                                  }}
                                  aria-label={t(
                                    "watchedFolders.workbench.export",
                                    "Export",
                                  )}
                                >
                                  <DownloadIcon
                                    style={{ fontSize: "0.875rem" }}
                                  />
                                </ActionIcon>
                              )}
                              <ActionIcon
                                variant="tertiary"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDeleteOne(fileId);
                                }}
                                aria-label={t(
                                  "watchedFolders.workbench.delete",
                                  "Delete",
                                )}
                              >
                                <DeleteOutlineIcon
                                  style={{ fontSize: "0.875rem" }}
                                />
                              </ActionIcon>
                            </Box>
                          )}
                        </Box>
                        {/* Expanded panel */}
                        {isExpanded && (
                          <Box
                            style={{
                              borderTop: `0.0625rem solid ${status === "error" ? "var(--mantine-color-red-light)" : "var(--border-subtle)"}`,
                              padding: "0.375rem 0.625rem 0.375rem 2rem",
                              backgroundColor: "var(--bg-app)",
                            }}
                          >
                            {/* Input file row */}
                            {inputFile && (
                              <Box
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.5rem",
                                  padding: "0.2rem 0",
                                  marginBottom:
                                    outputs.length > 0 || status === "error"
                                      ? "0.25rem"
                                      : 0,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: "0.625rem",
                                    letterSpacing: "0.04em",
                                    color: "var(--mantine-color-dimmed)",
                                    textTransform: "uppercase",
                                    flexShrink: 0,
                                  }}
                                >
                                  {t(
                                    "watchedFolders.workbench.directionIn",
                                    "in",
                                  )}
                                </Text>
                                <Text
                                  size="xs"
                                  style={{ flex: 1, minWidth: 0 }}
                                  lineClamp={1}
                                >
                                  {inputFile.name}
                                </Text>
                                <Text
                                  size="xs"
                                  c="dimmed"
                                  style={{ flexShrink: 0 }}
                                >
                                  {formatBytes(inputFile.size)}
                                </Text>
                                <ActionIcon
                                  variant="tertiary"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleView(inputFile);
                                  }}
                                  aria-label={t(
                                    "watchedFolders.workbench.previewInput",
                                    "Preview input",
                                  )}
                                >
                                  <VisibilityIcon
                                    style={{ fontSize: "0.875rem" }}
                                  />
                                </ActionIcon>
                                <ActionIcon
                                  variant="tertiary"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(inputFile, inputFile.name);
                                  }}
                                  aria-label={t(
                                    "watchedFolders.actions.downloadInput",
                                    "Download input",
                                  )}
                                >
                                  <DownloadIcon
                                    style={{ fontSize: "0.875rem" }}
                                  />
                                </ActionIcon>
                              </Box>
                            )}
                            {/* Output files (stored in IDB) */}
                            {outputs.map((out) => (
                              <Box
                                key={out.fileId}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.5rem",
                                  padding: "0.2rem 0",
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: "0.625rem",
                                    letterSpacing: "0.04em",
                                    color: "var(--color-green-500)",
                                    textTransform: "uppercase",
                                    flexShrink: 0,
                                  }}
                                >
                                  {t(
                                    "watchedFolders.workbench.directionOut",
                                    "out",
                                  )}
                                </Text>
                                <Text
                                  size="xs"
                                  style={{ flex: 1, minWidth: 0 }}
                                  lineClamp={1}
                                >
                                  {out.name}
                                </Text>
                                <Text
                                  size="xs"
                                  c="dimmed"
                                  style={{ flexShrink: 0 }}
                                >
                                  {formatBytes(out.size)}
                                </Text>
                                <ActionIcon
                                  variant="tertiary"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleView(out);
                                  }}
                                  aria-label={t(
                                    "watchedFolders.workbench.previewOutput",
                                    "Preview output",
                                  )}
                                >
                                  <VisibilityIcon
                                    style={{ fontSize: "0.875rem" }}
                                  />
                                </ActionIcon>
                                <ActionIcon
                                  variant="tertiary"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(out, out.name);
                                  }}
                                  aria-label={t(
                                    "watchedFolders.actions.downloadOutput",
                                    "Download output",
                                  )}
                                >
                                  <DownloadIcon
                                    style={{ fontSize: "0.875rem" }}
                                  />
                                </ActionIcon>
                              </Box>
                            ))}
                            {/* Error detail + retry */}
                            {status === "error" && (
                              <Box
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: "0.5rem",
                                  paddingTop: "0.25rem",
                                }}
                              >
                                {meta?.errorMessage && (
                                  <Text
                                    size="xs"
                                    c="red"
                                    style={{
                                      flex: 1,
                                      minWidth: 0,
                                      wordBreak: "break-word",
                                      opacity: 0.85,
                                      fontFamily: "monospace",
                                      fontSize: "0.6875rem",
                                    }}
                                  >
                                    {meta.errorMessage}
                                  </Text>
                                )}
                                {inputFile && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    style={{ flexShrink: 0 }}
                                    leftSection={
                                      <ReplayIcon
                                        style={{ fontSize: "0.75rem" }}
                                      />
                                    }
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateFileMetadata(fileId, {
                                        status: "pending",
                                        errorMessage: undefined,
                                      });
                                      runPipeline(
                                        folder,
                                        inputFile,
                                        fileId,
                                        folderRecord?.files[fileId]
                                          ?.ownedByFolder ?? false,
                                      );
                                    }}
                                  >
                                    {t("watchedFolders.actions.retry", "Retry")}
                                  </Button>
                                )}
                              </Box>
                            )}
                            {status === "processing" && (
                              <Group gap="xs">
                                <Loader size={8} />
                                <Text size="xs" c="dimmed">
                                  {t(
                                    "watchedFolders.status.processing",
                                    "Processing…",
                                  )}
                                </Text>
                              </Group>
                            )}
                            {status === "pending" && (
                              <Text size="xs" c="dimmed">
                                {t(
                                  "watchedFolders.workbench.queuedWaiting",
                                  "Queued — waiting to run",
                                )}
                              </Text>
                            )}
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </>
              )}
            </Stack>
          </ScrollArea>
        </Box>
      </Box>

      {/* Stats modal */}
      <CardExpansionModal
        phase={statsModalPhase}
        cardRect={statsCardRect}
        textExpanded={statsTextExpanded}
        onClose={closeStatsModal}
        icon={
          <HistoryIcon
            style={{
              fontSize: "1.125rem",
              color: "var(--mantine-color-dimmed)",
            }}
          />
        }
        count={daysRunning !== null && daysRunning > 0 ? daysRunning : 0}
        labelSingular={t("watchedFolders.workbench.dayRunning", "day running")}
        labelPlural={t("watchedFolders.workbench.daysRunning", "days running")}
        widthRem={72}
        heightRem={48}
        fillHeight
        toolbar={
          <Box style={{ padding: "0.625rem 0.75rem" }}>
            <Group gap="0.375rem">
              {(["24h", "7d", "30d", "all"] as const).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={statsPeriod === p ? "secondary" : "tertiary"}
                  onClick={() => setStatsPeriod(p)}
                >
                  {p === "all"
                    ? t("watchedFolders.workbench.allTime", "All time")
                    : p}
                </Button>
              ))}
            </Group>
          </Box>
        }
      >
        <Stack gap="lg" style={{ flex: 1, minHeight: 0 }}>
          {/* Stat numbers */}
          <Group gap="xl">
            <Box>
              <Text
                style={{ fontSize: "0.625rem", letterSpacing: "0.05em" }}
                c="dimmed"
                tt="uppercase"
                fw={600}
              >
                {t("watchedFolders.status.done", "Done")}
              </Text>
              <Text size="xl" fw={800} c="var(--color-green-500)">
                {dashboardStats.processed}
              </Text>
            </Box>
            {dashboardStats.failed > 0 && (
              <Box>
                <Text
                  style={{ fontSize: "0.625rem", letterSpacing: "0.05em" }}
                  c="dimmed"
                  tt="uppercase"
                  fw={600}
                >
                  {t("watchedFolders.workbench.failed", "Failed")}
                </Text>
                <Text size="xl" fw={800} c="red">
                  {dashboardStats.failed}
                </Text>
              </Box>
            )}
            {dashboardStats.pending > 0 && (
              <Box>
                <Text
                  style={{ fontSize: "0.625rem", letterSpacing: "0.05em" }}
                  c="dimmed"
                  tt="uppercase"
                  fw={600}
                >
                  {t("watchedFolders.workbench.queued", "Queued")}
                </Text>
                <Text size="xl" fw={800}>
                  {dashboardStats.pending}
                </Text>
              </Box>
            )}
            {dashboardStats.totalIn > 0 && (
              <Box>
                <Text
                  style={{ fontSize: "0.625rem", letterSpacing: "0.05em" }}
                  c="dimmed"
                  tt="uppercase"
                  fw={600}
                >
                  {t("watchedFolders.workbench.inputSize", "Input size")}
                </Text>
                <Text size="xl" fw={800}>
                  {formatBytes(dashboardStats.totalIn)}
                </Text>
              </Box>
            )}
            {dashboardStats.saved > 0 && (
              <Box>
                <Text
                  style={{ fontSize: "0.625rem", letterSpacing: "0.05em" }}
                  c="dimmed"
                  tt="uppercase"
                  fw={600}
                >
                  {t("watchedFolders.workbench.dataSaved", "Saved")}
                </Text>
                <Text size="xl" fw={800} c="var(--color-green-500)">
                  ↓ {formatBytes(dashboardStats.saved)}
                </Text>
              </Box>
            )}
          </Group>

          {/* Bar chart */}
          {(() => {
            const isHourly = statsPeriod === "24h";
            const bucketMs2 = isHourly ? 3_600_000 : 86_400_000;
            const count = dashboardStats.buckets.length;
            const nowMs = Date.now();
            const stride = isHourly ? 6 : statsPeriod === "7d" ? 1 : 5;
            const bucketLabel = (i: number) => {
              const ts = nowMs - (count - 1 - i) * bucketMs2;
              const d = new Date(ts);
              if (isHourly) {
                const h = d.getHours();
                if (h === 0)
                  return `${d.getDate()} ${d.toLocaleDateString("en", { month: "short" })}`;
                return h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
              }
              if (statsPeriod === "7d")
                return d.toLocaleDateString("en", { weekday: "short" });
              return `${d.getDate()} ${d.toLocaleDateString("en", { month: "short" })}`;
            };
            const bucketTooltipLabel = (
              i: number,
              b: { processed: number; failed: number },
            ) => {
              const ts = nowMs - (count - 1 - i) * bucketMs2;
              const d = new Date(ts);
              let dateStr: string;
              if (isHourly) {
                const h = d.getHours();
                const hEnd = (h + 1) % 24;
                const fmt = (n: number) =>
                  n === 0
                    ? "12am"
                    : n < 12
                      ? `${n}am`
                      : n === 12
                        ? "12pm"
                        : `${n - 12}pm`;
                dateStr = `${fmt(h)} – ${fmt(hEnd)}, ${d.getDate()} ${d.toLocaleDateString("en", { month: "short" })}`;
              } else if (statsPeriod === "7d") {
                dateStr = d.toLocaleDateString("en", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                });
              } else {
                dateStr = d.toLocaleDateString("en", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                });
              }
              return `${dateStr}\n${t("watchedFolders.workbench.chartTooltipComplete", { count: b.processed, defaultValue: `${b.processed} complete` })}  ${t("watchedFolders.workbench.chartTooltipFailed", { count: b.failed, defaultValue: `${b.failed} failed` })}`;
            };
            const yMax = Math.max(dashboardStats.maxBucket, 10);
            const yTicks = [
              yMax,
              Math.round(yMax * 0.75),
              Math.round(yMax * 0.5),
              Math.round(yMax * 0.25),
              0,
            ];
            const yAxisWidth = `${Math.max(...yTicks.map((v) => String(v).length)) * 0.5 + 0.25}rem`;
            return (
              <Box
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Text size="xs" c="dimmed" mb="0.5rem">
                  {t(
                    "watchedFolders.workbench.filesProcessedOverTime",
                    "Files processed over time",
                  )}
                </Text>
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                    gap: "0.5rem",
                  }}
                >
                  {/* Y-axis labels */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      alignItems: "flex-end",
                      flexShrink: 0,
                      width: yAxisWidth,
                      paddingBottom: "0.0625rem",
                    }}
                  >
                    {yTicks.map((v, i) => (
                      <Text
                        key={i}
                        style={{ fontSize: "0.625rem", lineHeight: 1 }}
                        c="dimmed"
                      >
                        {v}
                      </Text>
                    ))}
                  </div>
                  {/* Bars + gridlines */}
                  <div
                    style={{
                      flex: 1,
                      position: "relative",
                      borderBottom: "0.0625rem solid var(--border-subtle)",
                    }}
                  >
                    {[0, 25, 50, 75].map((pct) => (
                      <div
                        key={pct}
                        style={{
                          position: "absolute",
                          top: `${pct}%`,
                          left: 0,
                          right: 0,
                          borderTop: "0.0625rem dashed var(--border-subtle)",
                          pointerEvents: "none",
                        }}
                      />
                    ))}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-end",
                        gap: "2px",
                        height: "100%",
                      }}
                      onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const relX = e.clientX - rect.left;
                        const relY = e.clientY - rect.top;
                        const i = Math.min(
                          Math.floor((relX / rect.width) * count),
                          count - 1,
                        );
                        setChartHover({ i, relX, relY });
                      }}
                      onMouseLeave={() => setChartHover(null)}
                    >
                      {chartHover &&
                        (() => {
                          const b = dashboardStats.buckets[chartHover.i];
                          const label = bucketTooltipLabel(chartHover.i, b);
                          const flipLeft = chartHover.relX > 200;
                          return (
                            <div
                              style={{
                                position: "absolute",
                                left: flipLeft
                                  ? undefined
                                  : chartHover.relX + 12,
                                right: flipLeft
                                  ? `calc(100% - ${chartHover.relX}px + 12px)`
                                  : undefined,
                                top: Math.max(chartHover.relY - 36, 4),
                                backgroundColor: "var(--bg-toolbar)",
                                border: "0.0625rem solid var(--border-subtle)",
                                borderRadius: "var(--mantine-radius-sm)",
                                padding: "0.3rem 0.5rem",
                                pointerEvents: "none",
                                zIndex: 10,
                                whiteSpace: "pre-line",
                                fontSize: "0.75rem",
                                lineHeight: 1.5,
                                boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                              }}
                            >
                              {label}
                            </div>
                          );
                        })()}
                      {dashboardStats.buckets.map((b, i) => {
                        const total = b.processed + b.failed;
                        const h =
                          total === 0 ? 0 : Math.max((total / yMax) * 100, 2);
                        return (
                          <div
                            key={i}
                            style={{
                              flex: 1,
                              height: `${Math.max(h, total > 0 ? 2 : 0)}%`,
                              display: "flex",
                              flexDirection: "column",
                              borderRadius: "2px 2px 0 0",
                              overflow: "hidden",
                              cursor: "default",
                            }}
                          >
                            {b.failed > 0 && (
                              <div
                                style={{
                                  flex: b.failed,
                                  backgroundColor: "var(--color-red-500)",
                                  minHeight: "2px",
                                }}
                              />
                            )}
                            {b.processed > 0 && (
                              <div
                                style={{
                                  flex: b.processed,
                                  backgroundColor: "var(--color-green-500)",
                                  minHeight: "2px",
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                {/* X-axis labels */}
                <div
                  style={{
                    display: "flex",
                    gap: "2px",
                    marginTop: "0.25rem",
                    paddingLeft: `calc(${yAxisWidth} + 0.5rem)`,
                  }}
                >
                  {dashboardStats.buckets.map((_, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        textAlign: "center",
                        overflow: "hidden",
                      }}
                    >
                      {i % stride === 0 && (
                        <Text
                          style={{
                            fontSize: "0.6875rem",
                            whiteSpace: "nowrap",
                          }}
                          c="dimmed"
                        >
                          {bucketLabel(i)}
                        </Text>
                      )}
                    </div>
                  ))}
                </div>
                <Group gap="md" mt="0.625rem">
                  <Group gap="0.3rem">
                    <div
                      style={{
                        width: "0.5rem",
                        height: "0.5rem",
                        borderRadius: "2px",
                        backgroundColor: "var(--color-green-500)",
                      }}
                    />
                    <Text size="xs" c="dimmed">
                      {t("watchedFolders.workbench.legendComplete", "Complete")}
                    </Text>
                  </Group>
                  <Group gap="0.3rem">
                    <div
                      style={{
                        width: "0.5rem",
                        height: "0.5rem",
                        borderRadius: "2px",
                        backgroundColor: "var(--color-red-500)",
                      }}
                    />
                    <Text size="xs" c="dimmed">
                      {t("watchedFolders.workbench.failed", "Failed")}
                    </Text>
                  </Group>
                </Group>
              </Box>
            );
          })()}
        </Stack>
      </CardExpansionModal>

      <FilePreviewModal
        fileId={previewFileId}
        file={previewFile}
        fileName={previewFileName}
        onClose={() => {
          setPreviewFileId(null);
          setPreviewFile(null);
        }}
      />

      {/* Delete confirmation */}
      <Modal
        opened={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title={
          deleteConfirm && deleteConfirm.ids.length === 1
            ? t("watchedFolders.workbench.removeEntry", "Remove entry")
            : t("watchedFolders.workbench.removeEntries", {
                count: deleteConfirm?.ids.length ?? 0,
                defaultValue: `Remove ${deleteConfirm?.ids.length ?? 0} entries`,
              })
        }
        zIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {t(
              "watchedFolders.workbench.deleteConfirmBody",
              "Remove notifications only clears the activity log. Delete outputs also removes the processed files from storage. Your original input files are never touched.",
            )}
          </Text>
          <Group justify="flex-end">
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
              {t("watchedFolders.workbench.cancel", "Cancel")}
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                deleteConfirm && void execDelete(deleteConfirm.ids, false)
              }
            >
              {t(
                "watchedFolders.workbench.removeNotificationsOnly",
                "Remove notifications only",
              )}
            </Button>
            <Button
              variant="primary"
              accent="danger"
              onClick={() =>
                deleteConfirm && void execDelete(deleteConfirm.ids, true)
              }
            >
              {t("watchedFolders.workbench.deleteOutputs", "Delete outputs")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
