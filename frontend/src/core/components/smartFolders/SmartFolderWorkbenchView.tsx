import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Box,
  Text,
  Stack,
  Group,
  Button,
  ScrollArea,
  Loader,
  TextInput,
  Select,
} from '@mantine/core';

import { useCardModalAnimation } from '@app/hooks/useCardModalAnimation';
import { CardExpansionModal } from '@app/components/smartFolders/CardExpansionModal';
import { StatCard } from '@app/components/smartFolders/StatCard';
import { useTranslation } from 'react-i18next';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import HistoryIcon from '@mui/icons-material/History';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import VisibilityIcon from '@mui/icons-material/Visibility';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useSmartFolders } from '@app/hooks/useSmartFolders';
import { useFolderData } from '@app/hooks/useFolderData';
import { useFolderRunState } from '@app/hooks/useFolderRunState';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { SMART_FOLDER_VIEW_ID, SMART_FOLDER_WORKBENCH_ID } from '@app/components/smartFolders/SmartFoldersRegistration';
import { automationStorage } from '@app/services/automationStorage';
import { useFolderAutomation, resolveInputFile } from '@app/hooks/useFolderAutomation';
import { AutomationConfig } from '@app/types/automation';
import { iconMap } from '@app/components/tools/automate/iconMap';
import { fileStorage } from '@app/services/fileStorage';
import {
  FileId,
  StirlingFile,
} from '@app/types/fileContext';
import { SmartFolderHomePage, humaniseOp } from '@app/components/smartFolders/SmartFolderHomePage';
import { useNavigationActions } from '@app/contexts/NavigationContext';
import { FilePreviewModal } from '@app/components/smartFolders/FilePreviewModal';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'name-asc', label: 'A → Z' },
  { value: 'name-desc', label: 'Z → A' },
];

const ACTIVITY_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'processed', label: 'Done' },
  { value: 'processing', label: 'Active' },
  { value: 'error', label: 'Failed' },
  { value: 'pending', label: 'Pending' },
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
  return (
    <Box style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.5rem 0.75rem' }}>
      <TextInput
        size="xs"
        placeholder="Search…"
        value={search}
        onChange={e => onSearchChange(e.currentTarget.value)}
        leftSection={<SearchIcon style={{ fontSize: '0.875rem' }} />}
        style={{ flex: 1 }}
        styles={{ input: { fontSize: '0.75rem' } }}
      />
      {extra}
      <Select
        size="xs"
        value={sort}
        onChange={v => v && onSortChange(v)}
        data={SORT_OPTIONS}
        style={{ width: '6.5rem' }}
        styles={{ input: { fontSize: '0.75rem' } }}
        comboboxProps={{ withinPortal: true, zIndex: 400 }}
      />
    </Box>
  );
}

interface SmartFolderWorkbenchViewProps {
  data: { folderId: string | null; pendingFileId?: string; pendingFileIds?: string[] };
}

export function timeAgo(date: Date, t: (key: string, options?: any) => string): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return t('smartFolders.time.justNow', 'just now');
  const mins = Math.floor(secs / 60);
  if (mins < 60) return t('smartFolders.time.minutesAgo', { count: mins, defaultValue: `${mins}m ago` });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('smartFolders.time.hoursAgo', { count: hours, defaultValue: `${hours}h ago` });
  const days = Math.floor(hours / 24);
  return t('smartFolders.time.daysAgo', { count: days, defaultValue: `${days}d ago` });
}

function RetryCountdown({ nextRetryAt, t }: { nextRetryAt: number; t: (key: string, opts?: any) => string }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, nextRetryAt - Date.now()));
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, nextRetryAt - Date.now()));
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [nextRetryAt]);
  const mins = Math.ceil(remaining / 60_000);
  return (
    <Text size="xs" c="yellow.6" style={{ flexShrink: 0 }}>
      {remaining <= 0
        ? t('smartFolders.workbench.retryingSoon', 'retrying…')
        : t('smartFolders.workbench.retryIn', { count: mins, defaultValue: `retry in ${mins}m` })}
    </Text>
  );
}

export function SmartFolderWorkbenchView({ data }: SmartFolderWorkbenchViewProps) {
  const { folderId } = data;
  const { t } = useTranslation();
  const { toolRegistry, setCustomWorkbenchViewData } = useToolWorkflow();
  const { actions } = useNavigationActions();
  const { folders, updateFolder } = useSmartFolders();
  const folder = folders.find(f => f.id === folderId);
  const { runPipeline } = useFolderAutomation(toolRegistry);

  const {
    folderRecord,
    fileIds,
    processingFileIds,
    processedFileIds,
    addFile,
    updateFileMetadata,
  } = useFolderData(folderId ?? '');

  const { recentRuns } = useFolderRunState(folderId ?? '');

  const [isDragOver, setIsDragOver] = useState(false);
  const [outputFiles, setOutputFiles] = useState<StirlingFile[]>([]);
  const [inputFiles, setInputFiles] = useState<StirlingFile[]>([]);
  const [previewFileId, setPreviewFileId] = useState<FileId | null>(null);
  const [previewFileName, setPreviewFileName] = useState('');

  // Filter / sort state
  const [activitySearch, setActivitySearch] = useState('');
  const [activitySort, setActivitySort] = useState('newest');
  const [activityStatusFilter, setActivityStatusFilter] = useState('all');
  const [automation, setAutomation] = useState<AutomationConfig | null>(null);
  const handledPendingRef = useRef<string | null>(null);

  // Load input/output blobs from the main file store whenever folderRecord changes
  useEffect(() => {
    if (!folderRecord) {
      setInputFiles([]);
      setOutputFiles([]);
      return;
    }
    const inputIds = Object.keys(folderRecord.files);
    const outputIds = Object.values(folderRecord.files)
      .flatMap(m => m.displayFileIds ?? (m.displayFileId ? [m.displayFileId] : []));

    Promise.all(inputIds.map(id => fileStorage.getStirlingFile(id as FileId)))
      .then(files => setInputFiles(files.filter(Boolean) as StirlingFile[]));

    Promise.all(outputIds.map(id => fileStorage.getStirlingFile(id as FileId)))
      .then(files => setOutputFiles(files.filter(Boolean) as StirlingFile[]));
  }, [folderRecord]);

  useEffect(() => {
    if (folder?.automationId) {
      automationStorage.getAutomation(folder.automationId).then(setAutomation);
    }
  }, [folder?.automationId]);


  const handleFiles = useCallback(
    async (files: FileList | File[], sourceFileId?: string) => {
      if (!folder) return;
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        if (!file.name.toLowerCase().endsWith('.pdf')) continue;

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
          await updateFileMetadata(inputFileId, { status: 'pending', errorMessage: undefined });
        } else {
          await addFile(inputFileId, { status: 'pending', name: file.name, ownedByFolder: ownedByFolder || undefined });
        }

        // Only run immediately if not paused; pending files will run when folder is resumed
        if (!folder.isPaused) {
          runPipeline(folder, file, inputFileId, ownedByFolder);
        }
      }
    },
    [folder, addFile, runPipeline]
  );

  useEffect(() => {
    const { pendingFileId, pendingFileIds } = data;

    // Multi-file pending (from sidebar multi-select drag to sidebar folder card)
    if (pendingFileIds && pendingFileIds.length > 0) {
      const key = pendingFileIds.join(',');
      if (handledPendingRef.current === key) return;
      handledPendingRef.current = key;
      setCustomWorkbenchViewData(SMART_FOLDER_VIEW_ID, { folderId });
      Promise.all(
        pendingFileIds.map(id => fileStorage.getStirlingFile(id as FileId))
      ).then(async results => {
        for (let i = 0; i < results.length; i++) {
          if (results[i]) await handleFiles([results[i]!], pendingFileIds[i]);
        }
      });
      return;
    }

    // Single pending file (legacy path)
    if (!pendingFileId || handledPendingRef.current === pendingFileId) return;
    handledPendingRef.current = pendingFileId;
    setCustomWorkbenchViewData(SMART_FOLDER_VIEW_ID, { folderId });
    fileStorage.getStirlingFile(pendingFileId as FileId).then((stirlingFile) => {
      if (stirlingFile) handleFiles([stirlingFile], pendingFileId);
    });
  }, [data, folderId, handleFiles, setCustomWorkbenchViewData]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      // Multi-file sidebar drag
      const multiRaw = e.dataTransfer.getData('watchFolderFileIds');
      if (multiRaw) {
        try {
          const ids: string[] = JSON.parse(multiRaw);
          Promise.all(ids.map(id => fileStorage.getStirlingFile(id as FileId))).then(async results => {
            for (let i = 0; i < results.length; i++) {
              if (results[i]) await handleFiles([results[i]!], ids[i]);
            }
          });
          return;
        } catch { /* fall through */ }
      }

      // Single sidebar drag
      const sidebarFileId = e.dataTransfer.getData('watchFolderFileId');
      if (sidebarFileId) {
        fileStorage.getStirlingFile(sidebarFileId as FileId).then((stirlingFile) => {
          if (stirlingFile) handleFiles([stirlingFile], sidebarFileId);
        });
      } else if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
      e.target.value = '';
    },
    [handleFiles]
  );

  const handleView = useCallback((file: StirlingFile) => {
    setPreviewFileId(file.fileId as FileId);
    setPreviewFileName(file.name);
  }, []);

  const handleDownload = useCallback(async (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const goHome = useCallback(() => {
    setCustomWorkbenchViewData(SMART_FOLDER_VIEW_ID, { folderId: null });
    actions.setWorkbench(SMART_FOLDER_WORKBENCH_ID);
  }, [setCustomWorkbenchViewData, actions]);

  const handlePauseResume = useCallback(async () => {
    if (!folder) return;
    const nowPaused = !folder.isPaused;
    await updateFolder({ ...folder, isPaused: nowPaused });
    // When resuming, run all files that were queued while paused
    if (!nowPaused) {
      const pendingIds = fileIds.filter(id => folderRecord?.files[id]?.status === 'pending');
      for (const fileId of pendingIds) {
        const file = inputFiles.find(f => f.fileId === fileId);
        if (file) {
          runPipeline(
            { ...folder, isPaused: false },
            file,
            fileId,
            folderRecord?.files[fileId]?.ownedByFolder ?? false
          );
        }
      }
    }
  }, [folder, updateFolder, fileIds, folderRecord, inputFiles, runPipeline]);

  const { phase: statsModalPhase, cardRect: statsCardRect, textExpanded: statsTextExpanded, openModal: openStatsModal, closeModal: closeStatsModal } = useCardModalAnimation();
  const [statsPeriod, setStatsPeriod] = useState<'24h' | '7d' | '30d' | 'all'>('7d');

  const dashboardStats = useMemo(() => {
    const getTs = (d: Date | string | number | undefined): number =>
      !d ? 0 : d instanceof Date ? d.getTime() : typeof d === 'number' ? d : new Date(d as string).getTime();
    const now = Date.now();
    const cutoff = statsPeriod === '24h' ? now - 86_400_000
      : statsPeriod === '7d' ? now - 7 * 86_400_000
      : statsPeriod === '30d' ? now - 30 * 86_400_000
      : 0;
    const entries = Object.entries(folderRecord?.files ?? {})
      .filter(([, m]) => getTs(m.addedAt) >= cutoff);
    const processed = entries.filter(([, m]) => m.status === 'processed').length;
    const failed = entries.filter(([, m]) => m.status === 'error').length;
    const pending = entries.filter(([, m]) => m.status === 'pending' || m.status === 'processing').length;
    const totalIn = entries.reduce((s, [id]) => s + (inputFiles.find(f => f.fileId === id)?.size ?? 0), 0);
    const totalOut = entries
      .filter(([, m]) => m.status === 'processed')
      .reduce((s, [, m]) => {
        const ids = m.displayFileIds ?? (m.displayFileId ? [m.displayFileId] : []);
        return s + ids.reduce((ss, oid) => ss + (outputFiles.find(f => f.fileId === oid)?.size ?? 0), 0);
      }, 0);
    const isHourly = statsPeriod === '24h';
    const bucketMs = isHourly ? 3_600_000 : 86_400_000;
    const bucketCount = isHourly ? 24 : statsPeriod === '7d' ? 7 : statsPeriod === '30d' ? 30 : 30;
    const buckets: Array<{ processed: number; failed: number }> = Array.from({ length: bucketCount }, () => ({ processed: 0, failed: 0 }));
    for (const [, m] of Object.entries(folderRecord?.files ?? {})) {
      const ts = getTs(m.processedAt ?? m.addedAt);
      if (!ts) continue;
      const idx = Math.floor((now - ts) / bucketMs);
      if (idx >= 0 && idx < bucketCount) {
        const b = buckets[bucketCount - 1 - idx];
        if (m.status === 'processed') b.processed++;
        else if (m.status === 'error') b.failed++;
      }
    }
    const maxBucket = Math.max(...buckets.map(b => b.processed + b.failed), 1);
    return { processed, failed, pending, totalIn, totalOut, saved: totalIn - totalOut, buckets, maxBucket };
  }, [folderRecord, inputFiles, outputFiles, statsPeriod]);

  const [expandedActivityIds, setExpandedActivityIds] = useState<Set<string>>(new Set());
  const toggleActivityRow = useCallback((id: string) => {
    setExpandedActivityIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // input fileId → output StirlingFiles produced by that run
  const activityOutputMap = useMemo(() => {
    const map = new Map<string, StirlingFile[]>();
    for (const [id, meta] of Object.entries(folderRecord?.files ?? {})) {
      const ids = meta.displayFileIds ?? (meta.displayFileId ? [meta.displayFileId] : []);
      const files = ids.map(oid => outputFiles.find(f => f.fileId === oid)).filter((f): f is StirlingFile => !!f);
      if (files.length > 0) map.set(id, files);
    }
    return map;
  }, [folderRecord, outputFiles]);

  // ── Filtered + sorted lists — all before early returns ──

  const filteredActivityIds = useMemo(() => {
    const q = activitySearch.toLowerCase();
    let items = fileIds.map(id => {
      const meta = folderRecord?.files[id];
      const name = meta?.name ?? inputFiles.find(f => f.fileId === id)?.name ?? id;
      const status = meta?.status ?? 'pending';
      const time = meta?.processedAt
        ? new Date(meta.processedAt).getTime()
        : meta?.addedAt ? new Date(meta.addedAt).getTime() : 0;
      return { id, name, status, time };
    });
    if (q) items = items.filter(i => i.name.toLowerCase().includes(q));
    if (activityStatusFilter !== 'all') items = items.filter(i => i.status === activityStatusFilter);
    if (activitySort === 'newest') items = [...items].reverse();
    else if (activitySort === 'name-asc') items = [...items].sort((a, b) => a.name.localeCompare(b.name));
    else if (activitySort === 'name-desc') items = [...items].sort((a, b) => b.name.localeCompare(a.name));
    // 'oldest' keeps the original order (insertion order = oldest first)
    return items.map(i => i.id);
  }, [fileIds, folderRecord, inputFiles, activitySearch, activityStatusFilter, activitySort]);


  // Early returns — after all hooks
  if (!folderId) return <SmartFolderHomePage />;

  const FolderIcon = folder
    ? (iconMap[folder.icon as keyof typeof iconMap] || iconMap.FolderIcon)
    : iconMap.FolderIcon;

  if (!folder) {
    return (
      <Box p="xl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Text c="dimmed">{t('smartFolders.folderNotFound', 'Folder not found')}</Text>
      </Box>
    );
  }

  const failedFileIds = fileIds.filter(id => folderRecord?.files[id]?.status === 'error');
  const isProcessingAny = processingFileIds.length > 0;
  const ops = automation?.operations ?? [];

  const hasCompressStep = ops.some(op => op.operation === 'compress');
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
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <Box
        px="xl"
        py="md"
        style={{
          borderBottom: '0.0625rem solid var(--border-subtle)',
          backgroundColor: 'var(--bg-toolbar)',
          flexShrink: 0,
        }}
      >
        <Group justify="space-between" align="center">
          <Group gap="md" align="center">
            <button onClick={goHome} aria-label={t('smartFolders.actions.back', 'Back')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', borderRadius: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mantine-color-dimmed)' }}>
              <ArrowBackIcon style={{ fontSize: '1rem' }} />
            </button>

            {/* Icon with status dot */}
            <Box style={{ position: 'relative', flexShrink: 0 }}>
              <Box
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: '0.625rem',
                  backgroundColor: `${folder.accentColor}18`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FolderIcon style={{ fontSize: '1.25rem', color: folder.accentColor }} />
              </Box>
              <Box
                style={{
                  position: 'absolute',
                  bottom: '-0.1875rem',
                  right: '-0.1875rem',
                  width: '0.75rem',
                  height: '0.75rem',
                  borderRadius: '50%',
                  backgroundColor: 'var(--bg-toolbar)',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Box
                  style={{
                    width: '0.4375rem',
                    height: '0.4375rem',
                    borderRadius: '50%',
                    backgroundColor: folder.isPaused ? '#f59e0b' : isProcessingAny ? '#3b82f6' : '#22c55e',
                  }}
                />
              </Box>
            </Box>

            <Stack gap={2}>
              <Text fw={700} size="md" style={{ letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                {folder.name}
              </Text>
              {/* Pipeline summary */}
              {ops.length > 0 && (
                <Group gap={4} wrap="nowrap">
                  {ops.map((op, i) => (
                    <Group key={i} gap={4} wrap="nowrap" align="center">
                      {i > 0 && (
                        <ChevronRightIcon style={{ fontSize: '0.625rem', color: 'var(--mantine-color-gray-5)' }} />
                      )}
                      <Text size="xs" c="dimmed" style={{ fontSize: '0.6875rem' }}>
                        {humaniseOp(op.operation)}
                      </Text>
                    </Group>
                  ))}
                </Group>
              )}
              {folder.description && !ops.length && (
                <Text size="xs" c="dimmed">{folder.description}</Text>
              )}
            </Stack>
          </Group>

          {/* Add files + pause/resume */}
          <Group gap="sm" align="center">
            <button
              onClick={handlePauseResume}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                fontSize: '0.75rem', padding: '0.25rem 0.625rem', borderRadius: '0.25rem',
                cursor: 'pointer', border: '0.0625rem solid',
                ...(folder.isPaused
                  ? { backgroundColor: '#22c55e', borderColor: '#22c55e', color: '#fff' }
                  : { backgroundColor: 'transparent', borderColor: 'var(--border-subtle)', color: 'var(--mantine-color-dimmed)' }
                ),
              }}
            >
              {folder.isPaused
                ? <><PlayArrowIcon style={{ fontSize: '0.875rem' }} />{t('smartFolders.workbench.resume', 'Resume')}</>
                : <><PauseIcon style={{ fontSize: '0.875rem' }} />{t('smartFolders.workbench.pause', 'Pause')}</>}
            </button>
            <Button
              size="xs"
              variant="light"
              onClick={() => document.getElementById(`folder-file-input-${folderId}`)?.click()}
            >
              {t('smartFolders.workbench.addFiles', 'Add files')}
            </Button>
            <input
              id={`folder-file-input-${folderId}`}
              type="file"
              accept=".pdf"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
          </Group>
        </Group>
      </Box>

      {/* ── Body ── */}
      <Box style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Left: Activity */}
        <Box
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            outline: isDragOver ? '0.125rem dashed rgba(59,130,246,0.6)' : 'none',
            outlineOffset: '-0.25rem',
            backgroundColor: isDragOver ? 'rgba(59,130,246,0.10)' : 'transparent',
            transition: 'background-color 0.15s ease',
          }}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
          onDrop={handleDrop}
        >
          {/* Storage cards */}
          <Box style={{ padding: '0.5rem 1rem 0', flexShrink: 0 }}>
            <Box
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(4.5rem, 1fr))',
                gap: '0.5rem',
                marginBottom: '0.5rem',
              }}
            >
              {/* Inputs */}
              <StatCard
                icon={<FolderOpenIcon style={{ fontSize: '1.125rem', color: 'var(--mantine-color-blue-filled)' }} />}
                count={inputFiles.length}
                label={t('smartFolders.workbench.inputs', 'Inputs')}
                hoverColor="var(--mantine-color-blue-filled)"
                isActive={activityStatusFilter === 'all'}
                onClick={() => { setActivityStatusFilter('all'); setExpandedActivityIds(new Set(fileIds)); }}
              />

              {/* Outputs */}
              <StatCard
                icon={<TaskAltIcon style={{ fontSize: '1.125rem', color: '#22c55e' }} />}
                count={outputFiles.length}
                label={t('smartFolders.workbench.outputs', 'Outputs')}
                hoverColor="#22c55e"
                isActive={activityStatusFilter === 'processed'}
                onClick={() => setActivityStatusFilter('processed')}
              />

              {/* Failed */}
              <StatCard
                icon={<ErrorOutlineIcon style={{ fontSize: '1.125rem', color: failedFileIds.length > 0 ? '#ef4444' : 'var(--mantine-color-dimmed)' }} />}
                count={failedFileIds.length}
                label={t('smartFolders.workbench.failed', 'Failed')}
                hoverColor="#ef4444"
                isActive={activityStatusFilter === 'error'}
                onClick={failedFileIds.length > 0 ? () => setActivityStatusFilter('error') : undefined}
              />

              {/* Data saved — only when compress is in pipeline */}
              {hasCompressStep && (
                <StatCard
                  icon={<DownloadIcon style={{ fontSize: '1.125rem', color: dataSavedBytes > 0 ? '#22c55e' : 'var(--mantine-color-dimmed)' }} />}
                  count={dataSavedBytes > 0 ? formatBytes(dataSavedBytes) : '—'}
                  label={t('smartFolders.workbench.dataSaved', 'Saved')}
                />
              )}

              {/* Days running */}
              <StatCard
                icon={<HistoryIcon style={{ fontSize: '1.125rem', color: 'var(--mantine-color-dimmed)' }} />}
                count={daysRunning !== null && daysRunning > 0 ? `${daysRunning}d` : '—'}
                label={t('smartFolders.workbench.running', 'Running')}
                hoverColor="var(--mantine-color-dimmed)"
                onClick={openStatsModal}
              />
            </Box>

          </Box>

          {/* Activity label */}
          <Box
            style={{
              padding: '1rem 1rem 0.5rem',
              flexShrink: 0,
            }}
          >
            <Text
              fw={600}
              style={{
                fontSize: '0.75rem',
                color: isDragOver ? '#3b82f6' : 'var(--tool-subcategory-text-color)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {isDragOver
                ? t('smartFolders.workbench.dropToProcess', 'Drop to process')
                : t('smartFolders.workbench.activity', 'Activity')}
            </Text>
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
                  onChange={v => v && setActivityStatusFilter(v)}
                  data={ACTIVITY_STATUS_OPTIONS}
                  style={{ width: '5.5rem' }}
                  styles={{ input: { fontSize: '0.75rem' } }}
                  comboboxProps={{ withinPortal: true, zIndex: 400 }}
                />
              }
            />
          )}

          <ScrollArea style={{ flex: 1 }}>
            <Stack gap="xs" px="md" pb="md">
              {fileIds.length === 0 ? (
                <Text size="xs" c="dimmed" ta="center" py="lg">
                  {t('smartFolders.workbench.noActivity', 'No activity yet — drop a PDF to start')}
                </Text>
              ) : filteredActivityIds.length === 0 ? (
                <Text size="xs" c="dimmed" ta="center" py="lg">
                  {t('smartFolders.workbench.noActivityMatch', 'No matching activity')}
                </Text>
              ) : (
                <>
                  {filteredActivityIds.map((fileId) => {
                    const meta = folderRecord?.files[fileId];
                    const status = meta?.status ?? 'pending';
                    const inputFile = inputFiles.find(f => f.fileId === fileId);
                    const filename = meta?.name ?? inputFile?.name ?? fileId;
                    const isExpanded = expandedActivityIds.has(fileId);
                    const outputs = activityOutputMap.get(fileId) ?? [];
                    return (
                      <Box
                        key={fileId}
                        style={{
                          borderRadius: 'var(--mantine-radius-sm)',
                          border: `0.0625rem solid ${status === 'error' ? 'rgba(239,68,68,0.45)' : 'var(--border-subtle)'}`,
                          backgroundColor: 'var(--bg-toolbar)',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Row header */}
                        <Box
                          style={{ padding: '0.375rem 0.5rem 0.375rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                          onClick={() => toggleActivityRow(fileId)}
                        >
                          <ChevronRightIcon style={{ fontSize: '0.75rem', color: 'var(--mantine-color-dimmed)', flexShrink: 0, transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                          {status === 'processed' && <CheckCircleOutlineIcon style={{ fontSize: '0.875rem', color: '#22c55e', flexShrink: 0 }} />}
                          {status === 'processing' && <Loader size="0.625rem" style={{ flexShrink: 0 }} />}
                          {status === 'error' && !meta?.nextRetryAt && <ErrorOutlineIcon style={{ fontSize: '0.875rem', color: '#ef4444', flexShrink: 0 }} />}
                          {status === 'error' && meta?.nextRetryAt && <ReplayIcon style={{ fontSize: '0.875rem', color: '#f59e0b', flexShrink: 0 }} />}
                          {status === 'pending' && <Box style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', backgroundColor: 'var(--mantine-color-yellow-5)', flexShrink: 0 }} />}
                          <Text size="xs" lineClamp={1} style={{ flex: 1, minWidth: 0 }}>{filename}</Text>
                          {status === 'error' && (meta?.failedAttempts ?? 0) > 0 && (
                            <Box style={{ padding: '0.0625rem 0.3rem', borderRadius: '0.25rem', backgroundColor: 'rgba(239,68,68,0.22)', border: '0.0625rem solid rgba(239,68,68,0.45)', flexShrink: 0 }}>
                              <Text style={{ fontSize: '0.625rem', fontWeight: 700, color: '#ef4444', letterSpacing: '0.03em' }}>{meta!.failedAttempts}×</Text>
                            </Box>
                          )}
                          {meta?.nextRetryAt && <RetryCountdown nextRetryAt={meta.nextRetryAt} t={t} />}
                          <Text size="xs" c="dimmed" style={{ fontSize: '0.6875rem', flexShrink: 0 }}>
                            {(meta?.processedAt || meta?.addedAt) ? timeAgo(new Date((meta.processedAt ?? meta.addedAt)!), t) : ''}
                          </Text>
                        </Box>
                        {/* Expanded panel */}
                        {isExpanded && (
                          <Box style={{ borderTop: `0.0625rem solid ${status === 'error' ? 'rgba(239,68,68,0.25)' : 'var(--border-subtle)'}`, padding: '0.375rem 0.625rem 0.375rem 2rem', backgroundColor: 'var(--bg-app)' }}>
                            {/* Input file row */}
                            {inputFile && (
                              <Box style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.2rem 0', marginBottom: outputs.length > 0 || status === 'error' ? '0.25rem' : 0 }}>
                                <Text style={{ fontSize: '0.625rem', letterSpacing: '0.04em', color: 'var(--mantine-color-dimmed)', textTransform: 'uppercase', flexShrink: 0 }}>in</Text>
                                <Text size="xs" style={{ flex: 1, minWidth: 0 }} lineClamp={1}>{inputFile.name}</Text>
                                <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{formatBytes(inputFile.size)}</Text>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', borderRadius: '0.25rem', display: 'flex', alignItems: 'center', color: 'var(--mantine-color-dimmed)' }} onClick={(e) => { e.stopPropagation(); handleView(inputFile); }} title="Preview input"><VisibilityIcon style={{ fontSize: '0.875rem' }} /></button>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', borderRadius: '0.25rem', display: 'flex', alignItems: 'center', color: 'var(--mantine-color-dimmed)' }} onClick={(e) => { e.stopPropagation(); handleDownload(inputFile, inputFile.name); }} title="Download input"><DownloadIcon style={{ fontSize: '0.875rem' }} /></button>
                              </Box>
                            )}
                            {/* Output files */}
                            {outputs.map(out => (
                              <Box key={out.fileId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.2rem 0' }}>
                                <Text style={{ fontSize: '0.625rem', letterSpacing: '0.04em', color: '#22c55e', textTransform: 'uppercase', flexShrink: 0 }}>out</Text>
                                <Text size="xs" style={{ flex: 1, minWidth: 0 }} lineClamp={1}>{out.name}</Text>
                                <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{formatBytes(out.size)}</Text>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', borderRadius: '0.25rem', display: 'flex', alignItems: 'center', color: 'var(--mantine-color-dimmed)' }} onClick={(e) => { e.stopPropagation(); handleView(out); }} title="Preview output"><VisibilityIcon style={{ fontSize: '0.875rem' }} /></button>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', borderRadius: '0.25rem', display: 'flex', alignItems: 'center', color: 'var(--mantine-color-dimmed)' }} onClick={(e) => { e.stopPropagation(); handleDownload(out, out.name); }} title="Download output"><DownloadIcon style={{ fontSize: '0.875rem' }} /></button>
                              </Box>
                            ))}
                            {/* Error detail + retry */}
                            {status === 'error' && (
                              <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', paddingTop: '0.25rem' }}>
                                {meta?.errorMessage && <Text size="xs" c="red" style={{ flex: 1, minWidth: 0, wordBreak: 'break-word', opacity: 0.85, fontFamily: 'monospace', fontSize: '0.6875rem' }}>{meta.errorMessage}</Text>}
                                {inputFile && (
                                  <button
                                    style={{ background: 'rgba(59,130,246,0.12)', border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem', borderRadius: '0.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.6875rem', color: '#3b82f6', flexShrink: 0 }}
                                    onClick={(e) => { e.stopPropagation(); updateFileMetadata(fileId, { status: 'pending', errorMessage: undefined }); runPipeline(folder!, inputFile, fileId, folderRecord?.files[fileId]?.ownedByFolder ?? false); }}
                                  >
                                    <ReplayIcon style={{ fontSize: '0.75rem' }} /> Retry
                                  </button>
                                )}
                              </Box>
                            )}
                            {status === 'processing' && (
                              <Group gap="xs"><Loader size={8} /><Text size="xs" c="dimmed">Processing…</Text></Group>
                            )}
                            {status === 'pending' && (
                              <Text size="xs" c="dimmed">Queued — waiting to run</Text>
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
        icon={<HistoryIcon style={{ fontSize: '1.125rem', color: 'var(--mantine-color-dimmed)' }} />}
        count={daysRunning !== null && daysRunning > 0 ? daysRunning : 0}
        labelSingular={t('smartFolders.workbench.dayRunning', 'day running')}
        labelPlural={t('smartFolders.workbench.daysRunning', 'days running')}
        widthRem={72}
        heightRem={48}
        fillHeight
        toolbar={
          <Box style={{ padding: '0.625rem 0.75rem' }}>
            <Group gap="0.375rem">
              {(['24h', '7d', '30d', 'all'] as const).map(p => (
                <button key={p} onClick={() => setStatsPeriod(p)} style={{ padding: '0.125rem 0.5rem', borderRadius: '999px', border: `0.0625rem solid ${statsPeriod === p ? 'var(--mantine-color-blue-filled)' : 'var(--border-subtle)'}`, backgroundColor: statsPeriod === p ? 'var(--mantine-color-blue-light-hover)' : 'transparent', color: statsPeriod === p ? 'var(--mantine-color-blue-filled)' : 'var(--mantine-color-dimmed)', fontSize: '0.6875rem', fontWeight: statsPeriod === p ? 600 : 400, cursor: 'pointer' }}>
                  {p === 'all' ? 'All time' : p}
                </button>
              ))}
            </Group>
          </Box>
        }
      >
        <Stack gap="lg" style={{ flex: 1, minHeight: 0 }}>
          {/* Stat numbers */}
          <Group gap="xl">
            <Box>
              <Text style={{ fontSize: '0.625rem', letterSpacing: '0.05em' }} c="dimmed" tt="uppercase" fw={600}>Done</Text>
              <Text size="xl" fw={800} c="#22c55e">{dashboardStats.processed}</Text>
            </Box>
            {dashboardStats.failed > 0 && (
              <Box>
                <Text style={{ fontSize: '0.625rem', letterSpacing: '0.05em' }} c="dimmed" tt="uppercase" fw={600}>Failed</Text>
                <Text size="xl" fw={800} c="red">{dashboardStats.failed}</Text>
              </Box>
            )}
            {dashboardStats.pending > 0 && (
              <Box>
                <Text style={{ fontSize: '0.625rem', letterSpacing: '0.05em' }} c="dimmed" tt="uppercase" fw={600}>Queued</Text>
                <Text size="xl" fw={800}>{dashboardStats.pending}</Text>
              </Box>
            )}
            {dashboardStats.totalIn > 0 && (
              <Box>
                <Text style={{ fontSize: '0.625rem', letterSpacing: '0.05em' }} c="dimmed" tt="uppercase" fw={600}>Input size</Text>
                <Text size="xl" fw={800}>{formatBytes(dashboardStats.totalIn)}</Text>
              </Box>
            )}
            {dashboardStats.saved > 0 && (
              <Box>
                <Text style={{ fontSize: '0.625rem', letterSpacing: '0.05em' }} c="dimmed" tt="uppercase" fw={600}>Saved</Text>
                <Text size="xl" fw={800} c="#22c55e">↓ {formatBytes(dashboardStats.saved)}</Text>
              </Box>
            )}
          </Group>

          {/* Bar chart */}
          {(() => {
            const isHourly = statsPeriod === '24h';
            const bucketMs2 = isHourly ? 3_600_000 : 86_400_000;
            const count = dashboardStats.buckets.length;
            const nowMs = Date.now();
            const stride = isHourly ? 6 : statsPeriod === '7d' ? 1 : 5;
            const bucketLabel = (i: number) => {
              const ts = nowMs - (count - 1 - i) * bucketMs2;
              const d = new Date(ts);
              if (isHourly) {
                const h = d.getHours();
                if (h === 0) return `${d.getDate()} ${d.toLocaleDateString('en', { month: 'short' })}`;
                return h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
              }
              if (statsPeriod === '7d') return d.toLocaleDateString('en', { weekday: 'short' });
              return `${d.getDate()} ${d.toLocaleDateString('en', { month: 'short' })}`;
            };
            const yMax = Math.max(dashboardStats.maxBucket, 10);
            const yTicks = [yMax, Math.round(yMax * 0.75), Math.round(yMax * 0.5), Math.round(yMax * 0.25), 0];
            const yAxisWidth = `${Math.max(...yTicks.map(v => String(v).length)) * 0.5 + 0.25}rem`;
            return (
              <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <Text size="xs" c="dimmed" mb="0.5rem">Files processed over time</Text>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: '0.5rem' }}>
                  {/* Y-axis labels */}
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', flexShrink: 0, width: yAxisWidth, paddingBottom: '0.0625rem' }}>
                    {yTicks.map((v, i) => (
                      <Text key={i} style={{ fontSize: '0.625rem', lineHeight: 1 }} c="dimmed">{v}</Text>
                    ))}
                  </div>
                  {/* Bars + gridlines */}
                  <div style={{ flex: 1, position: 'relative', borderBottom: '0.0625rem solid var(--border-subtle)' }}>
                    {[0, 25, 50, 75].map(pct => (
                      <div key={pct} style={{ position: 'absolute', top: `${pct}%`, left: 0, right: 0, borderTop: '0.0625rem dashed var(--border-subtle)', pointerEvents: 'none' }} />
                    ))}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '100%' }}>
                      {dashboardStats.buckets.map((b, i) => {
                        const total = b.processed + b.failed;
                        const h = total === 0 ? 0 : Math.max((total / yMax) * 100, 2);
                        return (
                          <div key={i} title={total > 0 ? `${b.processed} done, ${b.failed} failed` : undefined} style={{ flex: 1, height: `${h}%`, display: 'flex', flexDirection: 'column', borderRadius: '2px 2px 0 0', overflow: 'hidden', opacity: total === 0 ? 0.12 : 1 }}>
                            {b.failed > 0 && <div style={{ flex: b.failed, backgroundColor: '#ef4444', minHeight: '2px' }} />}
                            {b.processed > 0 && <div style={{ flex: b.processed, backgroundColor: '#22c55e', minHeight: '2px' }} />}
                            {total === 0 && <div style={{ flex: 1, backgroundColor: 'var(--border-subtle)' }} />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                {/* X-axis labels */}
                <div style={{ display: 'flex', gap: '2px', marginTop: '0.25rem', paddingLeft: `calc(${yAxisWidth} + 0.5rem)` }}>
                  {dashboardStats.buckets.map((_, i) => (
                    <div key={i} style={{ flex: 1, textAlign: 'center', overflow: 'hidden' }}>
                      {i % stride === 0 && (
                        <Text style={{ fontSize: '0.6875rem', whiteSpace: 'nowrap' }} c="dimmed">{bucketLabel(i)}</Text>
                      )}
                    </div>
                  ))}
                </div>
                <Group gap="md" mt="0.625rem">
                  <Group gap="0.3rem"><div style={{ width: '0.5rem', height: '0.5rem', borderRadius: '2px', backgroundColor: '#22c55e' }} /><Text size="xs" c="dimmed">Done</Text></Group>
                  <Group gap="0.3rem"><div style={{ width: '0.5rem', height: '0.5rem', borderRadius: '2px', backgroundColor: '#ef4444' }} /><Text size="xs" c="dimmed">Failed</Text></Group>
                </Group>
              </Box>
            );
          })()}
        </Stack>
      </CardExpansionModal>

      <FilePreviewModal
        fileId={previewFileId}
        fileName={previewFileName}
        onClose={() => setPreviewFileId(null)}
      />
    </Box>
  );
}
