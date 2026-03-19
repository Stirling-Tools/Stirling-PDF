import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Text,
  Stack,
  Group,
  Button,
  ScrollArea,
  Loader,
  ActionIcon,
} from '@mantine/core';

import { useCardModalAnimation } from '@app/hooks/useCardModalAnimation';
import { CardExpansionModal } from '@app/components/smartFolders/CardExpansionModal';
import { StatCard } from '@app/components/smartFolders/StatCard';
import { useTranslation } from 'react-i18next';
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
  const [automation, setAutomation] = useState<AutomationConfig | null>(null);
  const { phase: inputModalPhase, cardRect: inputCardRect, textExpanded: inputTextExpanded, openModal: openInputModal, closeModal: closeInputModal } = useCardModalAnimation();
  const { phase: outputModalPhase, cardRect: outputCardRect, textExpanded: outputTextExpanded, openModal: openOutputModal, closeModal: closeOutputModal } = useCardModalAnimation();
  const { phase: failedModalPhase, cardRect: failedCardRect, textExpanded: failedTextExpanded, openModal: openFailedModal, closeModal: closeFailedModal } = useCardModalAnimation();
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
            <ActionIcon variant="subtle" size="sm" onClick={goHome} aria-label={t('smartFolders.actions.back', 'Back')}>
              <ArrowBackIcon style={{ fontSize: '1rem' }} />
            </ActionIcon>

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
            <Button
              size="xs"
              variant={folder.isPaused ? 'filled' : 'light'}
              color={folder.isPaused ? 'green' : 'gray'}
              leftSection={folder.isPaused
                ? <PlayArrowIcon style={{ fontSize: '0.875rem' }} />
                : <PauseIcon style={{ fontSize: '0.875rem' }} />}
              onClick={handlePauseResume}
            >
              {folder.isPaused
                ? t('smartFolders.workbench.resume', 'Resume')
                : t('smartFolders.workbench.pause', 'Pause')}
            </Button>
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
                onClick={openInputModal}
              />

              {/* Outputs */}
              <StatCard
                icon={<TaskAltIcon style={{ fontSize: '1.125rem', color: '#22c55e' }} />}
                count={outputFiles.length}
                label={t('smartFolders.workbench.outputs', 'Outputs')}
                hoverColor="#22c55e"
                onClick={openOutputModal}
              />

              {/* Processed */}
              <StatCard
                icon={<CheckCircleOutlineIcon style={{ fontSize: '1.125rem', color: folder.accentColor }} />}
                count={processedFileIds.length}
                label={t('smartFolders.workbench.processed', 'Processed')}
              />

              {/* Failed */}
              <StatCard
                icon={<ErrorOutlineIcon style={{ fontSize: '1.125rem', color: failedFileIds.length > 0 ? '#ef4444' : 'var(--mantine-color-dimmed)' }} />}
                count={failedFileIds.length}
                label={t('smartFolders.workbench.failed', 'Failed')}
                hoverColor="#ef4444"
                onClick={failedFileIds.length > 0 ? openFailedModal : undefined}
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

          <ScrollArea style={{ flex: 1 }}>
            <Stack gap="xs" px="md" pb="md">
              {fileIds.length === 0 ? (
                <Text size="xs" c="dimmed" ta="center" py="lg">
                  {t('smartFolders.workbench.noActivity', 'No activity yet — drop a PDF to start')}
                </Text>
              ) : (
                <>
                  {[...fileIds].reverse().map((fileId) => {
                    const meta = folderRecord?.files[fileId];
                    const status = meta?.status ?? 'pending';
                    const run = recentRuns.find(r => r.inputFileId === fileId);
                    const outputFile = run ? outputFiles.find(f => f.fileId === run.displayFileId) : undefined;
                    const inputFile = inputFiles.find(f => f.fileId === fileId);
                    const filename = meta?.name ?? inputFile?.name ?? outputFile?.name ?? fileId;
                    return (
                      <Box
                        key={fileId}
                        style={{
                          padding: '0.375rem 0.75rem',
                          borderRadius: 'var(--mantine-radius-sm)',
                          border: `0.0625rem solid ${status === 'error' ? 'rgba(239,68,68,0.45)' : 'var(--border-subtle)'}`,
                          backgroundColor: 'var(--bg-toolbar)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        {status === 'processed' && <CheckCircleOutlineIcon style={{ fontSize: '0.875rem', color: '#22c55e', flexShrink: 0 }} />}
                        {status === 'processing' && <Loader size="0.625rem" />}
                        {status === 'error' && <ErrorOutlineIcon style={{ fontSize: '0.875rem', color: '#ef4444', flexShrink: 0 }} />}
                        {status === 'pending' && <Box style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', backgroundColor: 'var(--mantine-color-yellow-5)', flexShrink: 0 }} />}
                        <Text size="xs" lineClamp={1} style={{ flex: 1, minWidth: 0 }}>{filename}</Text>
                        {meta?.errorMessage && <Text size="xs" c="red" lineClamp={1} style={{ flexShrink: 0, maxWidth: '30%' }}>{meta.errorMessage}</Text>}
                        {status === 'error' && inputFile && (
                          <ActionIcon
                            size="sm"
                            variant="light"
                            color="blue"
                            title={t('smartFolders.actions.retry', 'Retry')}
                            onClick={async () => {
                              await updateFileMetadata(fileId, { status: 'pending', errorMessage: undefined });
                              runPipeline(folder!, inputFile, fileId, folderRecord?.files[fileId]?.ownedByFolder ?? false);
                            }}
                          >
                            <ReplayIcon style={{ fontSize: '1rem' }} />
                          </ActionIcon>
                        )}
                        {outputFile && (
                          <ActionIcon size="sm" variant="subtle" onClick={() => handleView(outputFile)} title={t('smartFolders.actions.view', 'View')}>
                            <VisibilityIcon style={{ fontSize: '1rem' }} />
                          </ActionIcon>
                        )}
                        {outputFile && (
                          <ActionIcon size="sm" variant="subtle" onClick={() => handleDownload(outputFile, outputFile.name)} title={t('smartFolders.actions.downloadOutput', 'Download output')}>
                            <DownloadIcon style={{ fontSize: '1rem' }} />
                          </ActionIcon>
                        )}
                        <Text size="xs" c="dimmed" style={{ fontSize: '0.6875rem', flexShrink: 0, width: '3.5rem', textAlign: 'right' }}>
                          {(meta?.processedAt || meta?.addedAt)
                            ? timeAgo(new Date((meta.processedAt ?? meta.addedAt)!), t)
                            : ''}
                        </Text>
                      </Box>
                    );
                  })}
                </>
              )}
            </Stack>
          </ScrollArea>
        </Box>

      </Box>

      {/* Inputs modal */}
      <CardExpansionModal
        phase={inputModalPhase}
        cardRect={inputCardRect}
        textExpanded={inputTextExpanded}
        onClose={closeInputModal}
        icon={<FolderOpenIcon style={{ fontSize: '1.125rem', color: 'var(--mantine-color-blue-filled)' }} />}
        count={inputFiles.length}
        labelSingular={t('smartFolders.workbench.inputFile', 'input file')}
        labelPlural={t('smartFolders.workbench.inputFiles', 'input files')}
        footer={
          <Group justify="flex-end">
            <Button size="sm" variant="subtle" color="gray"
              leftSection={<DownloadIcon style={{ fontSize: '1rem' }} />}
              onClick={async () => { for (const f of inputFiles) await handleDownload(f, f.name); }}
            >
              {t('smartFolders.workbench.exportAll', 'Export all')}
            </Button>
          </Group>
        }
      >
        <Stack gap="0.5rem">
          {inputFiles.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              {t('smartFolders.workbench.noInputFiles', 'No input files stored yet')}
            </Text>
          ) : inputFiles.map((file) => (
            <Box
              key={file.fileId}
              style={{
                padding: '0.5rem 0.625rem',
                borderRadius: 'var(--mantine-radius-sm)',
                border: '0.0625rem solid var(--border-subtle)',
                backgroundColor: 'var(--bg-toolbar)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
              }}
            >
              <FolderOpenIcon style={{ fontSize: '0.875rem', color: 'var(--mantine-color-blue-filled)', flexShrink: 0 }} />
              <Text size="sm" style={{ flex: 1, minWidth: 0, fontWeight: 500 }} lineClamp={1}>{file.name}</Text>
              <ActionIcon size="md" variant="subtle" color="gray" onClick={() => handleDownload(file, file.name)} title={t('smartFolders.actions.download', 'Download')}>
                <DownloadIcon style={{ fontSize: '1.125rem' }} />
              </ActionIcon>
            </Box>
          ))}
        </Stack>
      </CardExpansionModal>

      {/* Outputs modal */}
      <CardExpansionModal
        phase={outputModalPhase}
        cardRect={outputCardRect}
        textExpanded={outputTextExpanded}
        onClose={closeOutputModal}
        icon={<TaskAltIcon style={{ fontSize: '1.125rem', color: '#22c55e' }} />}
        count={outputFiles.length}
        labelSingular={t('smartFolders.workbench.outputFile', 'output file')}
        labelPlural={t('smartFolders.workbench.outputFiles', 'output files')}
        footer={
          <Group justify="flex-end">
            <Button size="sm" variant="subtle" color="gray"
              leftSection={<DownloadIcon style={{ fontSize: '1rem' }} />}
              onClick={async () => { for (const f of outputFiles) await handleDownload(f, f.name); }}
            >
              {t('smartFolders.workbench.exportAll', 'Export all')}
            </Button>
          </Group>
        }
      >
        <Stack gap="0.5rem">
          {outputFiles.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              {t('smartFolders.workbench.noOutputFiles', 'No output files stored yet')}
            </Text>
          ) : outputFiles.map((file) => (
            <Box
              key={file.fileId}
              style={{
                padding: '0.5rem 0.625rem',
                borderRadius: 'var(--mantine-radius-sm)',
                border: '0.0625rem solid var(--border-subtle)',
                backgroundColor: 'var(--bg-toolbar)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
              }}
            >
              <TaskAltIcon style={{ fontSize: '0.875rem', color: '#22c55e', flexShrink: 0 }} />
              <Text size="sm" style={{ flex: 1, minWidth: 0, fontWeight: 500 }} lineClamp={1}>{file.name}</Text>
              <Group gap="0.25rem" wrap="nowrap">
                <ActionIcon size="md" variant="subtle" color="gray" onClick={() => handleView(file)} title={t('smartFolders.actions.view', 'View')}>
                  <VisibilityIcon style={{ fontSize: '1.125rem' }} />
                </ActionIcon>
                <ActionIcon size="md" variant="subtle" color="gray" onClick={() => handleDownload(file, file.name)} title={t('smartFolders.actions.download', 'Download')}>
                  <DownloadIcon style={{ fontSize: '1.125rem' }} />
                </ActionIcon>
              </Group>
            </Box>
          ))}
        </Stack>
      </CardExpansionModal>

      <CardExpansionModal
        phase={failedModalPhase}
        cardRect={failedCardRect}
        textExpanded={failedTextExpanded}
        onClose={closeFailedModal}
        icon={<ErrorOutlineIcon style={{ fontSize: '1.125rem', color: '#ef4444' }} />}
        count={failedFileIds.length}
        labelSingular={t('smartFolders.workbench.fileFailedToProcess', 'file failed to process')}
        labelPlural={t('smartFolders.workbench.filesFailedToProcess', 'files failed to process')}
        footer={
          <Group justify="flex-end">
            <Button size="sm" color="red"
              leftSection={<ReplayIcon style={{ fontSize: '1rem' }} />}
              onClick={async () => {
                for (const fid of failedFileIds) {
                  const f = inputFiles.find(x => x.fileId === fid);
                  if (!f) continue;
                  await updateFileMetadata(fid, { status: 'pending', errorMessage: undefined });
                  runPipeline(folder!, f, fid, folderRecord?.files[fid]?.ownedByFolder ?? false);
                }
                closeFailedModal();
              }}
            >
              {t('smartFolders.workbench.retryAll', 'Retry all')}
            </Button>
            <Button size="sm" variant="subtle" color="gray"
              leftSection={<DownloadIcon style={{ fontSize: '1rem' }} />}
              onClick={async () => {
                for (const fid of failedFileIds) {
                  const f = inputFiles.find(x => x.fileId === fid);
                  if (f) await handleDownload(f, f.name);
                }
              }}
            >
              {t('smartFolders.workbench.exportAll', 'Export all')}
            </Button>
          </Group>
        }
      >
        <Stack gap="0.5rem">
          {failedFileIds.map((fileId) => {
            const meta = folderRecord?.files[fileId];
            const inputFile = inputFiles.find(f => f.fileId === fileId);
            const filename = meta?.name ?? inputFile?.name ?? fileId;
            const attempts = meta?.failedAttempts ?? 0;
            return (
              <Box
                key={fileId}
                style={{
                  borderRadius: 'var(--mantine-radius-sm)',
                  border: '0.0625rem solid rgba(239,68,68,0.45)',
                  backgroundColor: 'var(--bg-toolbar)',
                  overflow: 'hidden',
                }}
              >
                <Group gap="0.625rem" style={{ padding: '0.5rem 0.625rem' }} wrap="nowrap">
                  <ErrorOutlineIcon style={{ fontSize: '0.875rem', color: '#ef4444', flexShrink: 0 }} />
                  <Text size="sm" style={{ flex: 1, minWidth: 0, fontWeight: 500 }} lineClamp={1}>{filename}</Text>
                  {attempts > 0 && (
                    <Box style={{
                      padding: '0.125rem 0.375rem',
                      borderRadius: '0.25rem',
                      backgroundColor: 'rgba(239,68,68,0.22)',
                      border: '0.0625rem solid rgba(239,68,68,0.45)',
                      flexShrink: 0,
                    }}>
                      <Text style={{ fontSize: '0.625rem', fontWeight: 700, color: '#ef4444', letterSpacing: '0.03em' }}>{attempts}×</Text>
                    </Box>
                  )}
                  <Group gap="0.25rem" wrap="nowrap" style={{ flexShrink: 0 }}>
                    {inputFile && (
                      <ActionIcon size="md" variant="subtle" color="gray" onClick={() => handleDownload(inputFile, inputFile.name)} title={t('smartFolders.actions.downloadInput', 'Download input')}>
                        <DownloadIcon style={{ fontSize: '1.125rem' }} />
                      </ActionIcon>
                    )}
                    {inputFile && (
                      <ActionIcon size="md" variant="light" color="blue" title={t('smartFolders.actions.retry', 'Retry')}
                        onClick={async () => {
                          await updateFileMetadata(fileId, { status: 'pending', errorMessage: undefined });
                          runPipeline(folder!, inputFile, fileId, folderRecord?.files[fileId]?.ownedByFolder ?? false);
                          closeFailedModal();
                        }}
                      >
                        <ReplayIcon style={{ fontSize: '1.125rem' }} />
                      </ActionIcon>
                    )}
                  </Group>
                </Group>
                {meta?.errorMessage && (
                  <Box style={{
                    padding: '0.375rem 0.625rem',
                    borderTop: '0.0625rem solid rgba(239,68,68,0.25)',
                    borderLeft: '0.1875rem solid rgba(239,68,68,0.7)',
                    backgroundColor: 'transparent',
                  }}>
                    <Text size="xs" style={{ color: '#ef4444', fontFamily: 'monospace', fontSize: '0.6875rem', opacity: 0.85 }}>
                      {meta.errorMessage}
                    </Text>
                  </Box>
                )}
              </Box>
            );
          })}
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
