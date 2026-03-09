import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Text,
  Stack,
  Group,
  Button,
  ScrollArea,
  Loader,
  Tabs,
  ActionIcon,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import HistoryIcon from '@mui/icons-material/History';
import { useSmartFolders } from '@app/hooks/useSmartFolders';
import { useFolderData } from '@app/hooks/useFolderData';
import { useFolderRunState } from '@app/hooks/useFolderRunState';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { SMART_FOLDER_VIEW_ID, SMART_FOLDER_WORKBENCH_ID } from '@app/components/smartFolders/SmartFoldersRegistration';
import { automationStorage } from '@app/services/automationStorage';
import { folderStorage } from '@app/services/folderStorage';
import { executeAutomationSequence } from '@app/utils/automationExecutor';
import { SmartFolderRunEntry, SmartFolder } from '@app/types/smartFolders';
import { AutomationConfig } from '@app/types/automation';
import { iconMap } from '@app/components/tools/automate/iconMap';
import { fileStorage } from '@app/services/fileStorage';
import { FileId } from '@app/types/fileContext';
import { InputFileRecord, OutputFileRecord } from '@app/services/folderStorage';
import { SmartFolderHomePage } from '@app/components/smartFolders/SmartFolderHomePage';
import { useNavigationActions } from '@app/contexts/NavigationContext';

interface SmartFolderWorkbenchViewProps {
  data: { folderId: string | null; pendingFileId?: string };
}

interface StepProgress {
  stepIndex: number;
  operationName: string;
  status: 'running' | 'completed' | 'error';
  error?: string;
}

type FilterTab = 'processed' | 'processing' | 'pending';

function humaniseOp(op: string): string {
  return op
    .replace(/-pdf$|-pages$|-documents?$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\bocr\b/gi, 'OCR')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function SmartFolderWorkbenchView({ data }: SmartFolderWorkbenchViewProps) {
  const { folderId } = data;
  const { t } = useTranslation();
  const { toolRegistry, setCustomWorkbenchViewData } = useToolWorkflow();
  const { actions } = useNavigationActions();
  const { folders } = useSmartFolders();
  const folder = folders.find(f => f.id === folderId);

  const {
    folderRecord,
    fileIds,
    pendingFileIds,
    processingFileIds,
    processedFileIds,
    addFile,
    updateFileMetadata,
  } = useFolderData(folderId);

  const { recentRuns, setRecentRuns } = useFolderRunState(folderId);

  const [isDragOver, setIsDragOver] = useState(false);
  const [stepProgresses, setStepProgresses] = useState<StepProgress[]>([]);
  const [filterTab, setFilterTab] = useState<FilterTab>('processed');
  const [outputFiles, setOutputFiles] = useState<OutputFileRecord[]>([]);
  const [inputFiles, setInputFiles] = useState<InputFileRecord[]>([]);
  const [automation, setAutomation] = useState<AutomationConfig | null>(null);
  const processingRef = useRef<Set<string>>(new Set());
  const handledPendingRef = useRef<string | null>(null);

  useEffect(() => {
    folderStorage.getOutputFilesByFolder(folderId).then(setOutputFiles);
    folderStorage.getInputFilesByFolder(folderId).then(setInputFiles);
  }, [folderId, recentRuns]);

  useEffect(() => {
    if (folder?.automationId) {
      automationStorage.getAutomation(folder.automationId).then(setAutomation);
    }
  }, [folder?.automationId]);

  const runAutomation = useCallback(
    async (inputFile: File, inputFileId: string) => {
      if (processingRef.current.has(inputFileId)) return;
      processingRef.current.add(inputFileId);

      try {
        if (!folder) return;
        const auto: AutomationConfig | null = await automationStorage.getAutomation(folder.automationId);
        if (!auto) {
          await updateFileMetadata(inputFileId, { status: 'error', errorMessage: 'Automation not found' });
          return;
        }

        await updateFileMetadata(inputFileId, { status: 'processing' });

        setStepProgresses(prev => [
          ...prev,
          { stepIndex: 0, operationName: auto.operations[0]?.operation ?? '', status: 'running' },
        ]);

        const resultFiles = await executeAutomationSequence(
          auto,
          [inputFile],
          toolRegistry,
          (stepIndex, operationName) => {
            setStepProgresses(prev => {
              const updated = prev.filter(p => !(p.stepIndex === stepIndex && p.operationName === operationName));
              return [...updated, { stepIndex, operationName, status: 'running' }];
            });
          },
          (stepIndex) => {
            setStepProgresses(prev =>
              prev.map(p => p.stepIndex === stepIndex ? { ...p, status: 'completed' } : p)
            );
          },
          (stepIndex, error) => {
            setStepProgresses(prev =>
              prev.map(p => p.stepIndex === stepIndex ? { ...p, status: 'error', error } : p)
            );
          }
        );

        const newRuns: SmartFolderRunEntry[] = [...recentRuns];
        for (const resultFile of resultFiles) {
          const outputId = `output-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          await folderStorage.storeOutputFile(folderId, outputId, resultFile, resultFile.name);
          newRuns.push({ inputFileId, displayFileId: outputId, status: 'processed' });
        }

        await updateFileMetadata(inputFileId, {
          status: 'processed',
          processedAt: new Date(),
          displayFileId: resultFiles[0] ? newRuns[newRuns.length - 1]?.displayFileId : undefined,
        });
        await setRecentRuns(newRuns);
      } catch (error: any) {
        await updateFileMetadata(inputFileId, { status: 'error', errorMessage: error.message });
      } finally {
        processingRef.current.delete(inputFileId);
      }
    },
    [folder, folderId, recentRuns, setRecentRuns, toolRegistry, updateFileMetadata]
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        if (!file.name.toLowerCase().endsWith('.pdf')) continue;
        const inputFileId = `input-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        await addFile(inputFileId, { status: 'pending', inputFileId, name: file.name });
        await folderStorage.storeInputFile(folderId, inputFileId, file, file.name);
        runAutomation(file, inputFileId);
      }
    },
    [addFile, folderId, runAutomation]
  );

  useEffect(() => {
    const { pendingFileId } = data;
    if (!pendingFileId || handledPendingRef.current === pendingFileId) return;
    handledPendingRef.current = pendingFileId;
    setCustomWorkbenchViewData(SMART_FOLDER_VIEW_ID, { folderId });
    fileStorage.getStirlingFile(pendingFileId as FileId).then((stirlingFile) => {
      if (stirlingFile) handleFiles([stirlingFile]);
    });
  }, [data, folderId, handleFiles, setCustomWorkbenchViewData]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
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

  const isProcessingAny = processingFileIds.length > 0;
  const ops = automation?.operations ?? [];

  // Which files to show in the right panel
  const tabFileIds = filterTab === 'processed'
    ? processedFileIds
    : filterTab === 'processing'
    ? processingFileIds
    : pendingFileIds;

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
            <ActionIcon variant="subtle" size="sm" onClick={goHome} aria-label="Back">
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
                    backgroundColor: isProcessingAny ? '#3b82f6' : '#22c55e',
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
                        <ChevronRightIcon style={{ fontSize: '0.625rem', color: 'var(--mantine-color-dimmed)' }} />
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

          {/* Stats + Add files */}
          <Group gap="lg" align="center">
            <Box style={{ textAlign: 'center' }}>
              <Text fw={700} size="lg" style={{ color: folder.accentColor, lineHeight: 1.1 }}>
                {processedFileIds.length}
              </Text>
              <Text size="xs" c="dimmed" style={{ fontSize: '0.625rem' }}>
                {t('smartFolders.workbench.processed', 'Processed')}
              </Text>
            </Box>
            <Box style={{ textAlign: 'center' }}>
              <Text fw={700} size="lg" style={{ lineHeight: 1.1 }}>
                {fileIds.length}
              </Text>
              <Text size="xs" c="dimmed" style={{ fontSize: '0.625rem' }}>
                {t('smartFolders.workbench.total', 'Total')}
              </Text>
            </Box>
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
            width: '22rem',
            flexShrink: 0,
            borderRight: '0.0625rem solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            outline: isDragOver ? `0.125rem dashed ${folder.accentColor}` : 'none',
            outlineOffset: '-0.25rem',
            backgroundColor: isDragOver ? `${folder.accentColor}06` : 'transparent',
            transition: 'background-color 0.15s ease',
          }}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
          onDrop={handleDrop}
        >
          {/* Storage cards */}
          <Box style={{ padding: '1rem 1rem 0', flexShrink: 0 }}>
            <Box
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem',
                marginBottom: '0.5rem',
              }}
            >
              {/* Originals */}
              <Box
                style={{
                  padding: '0.75rem',
                  borderRadius: 'var(--mantine-radius-sm)',
                  border: '0.0625rem solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-surface, var(--mantine-color-default))',
                }}
              >
                <Group gap="xs" mb="xs">
                  <FolderOpenIcon style={{ fontSize: '0.875rem', color: 'var(--mantine-color-blue-filled)' }} />
                  <Text style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.05em' }} c="dimmed">
                    {t('smartFolders.workbench.originals', 'Originals')}
                  </Text>
                </Group>
                <Text fw={700} size="sm">{inputFiles.length}</Text>
                <Text size="xs" c="dimmed" style={{ fontSize: '0.625rem' }}>
                  {t('smartFolders.workbench.storedInBrowser', 'IndexedDB')}
                </Text>
              </Box>

              {/* Processed versions */}
              <Box
                style={{
                  padding: '0.75rem',
                  borderRadius: 'var(--mantine-radius-sm)',
                  border: '0.0625rem solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-surface, var(--mantine-color-default))',
                }}
              >
                <Group gap="xs" mb="xs">
                  <TaskAltIcon style={{ fontSize: '0.875rem', color: '#22c55e' }} />
                  <Text style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.05em' }} c="dimmed">
                    {t('smartFolders.workbench.versions', 'Versions')}
                  </Text>
                </Group>
                <Text fw={700} size="sm">{outputFiles.length}</Text>
                <Text size="xs" c="dimmed" style={{ fontSize: '0.625rem' }}>
                  {t('smartFolders.workbench.processedVersions', 'IndexedDB')}
                </Text>
              </Box>
            </Box>

            {/* Version history note */}
            <Group
              gap="xs"
              style={{
                padding: '0.5rem 0.625rem',
                borderRadius: 'var(--mantine-radius-sm)',
                backgroundColor: 'var(--mantine-color-default-hover)',
                marginBottom: '0.75rem',
              }}
            >
              <HistoryIcon style={{ fontSize: '0.875rem', color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
              <Text size="xs" c="dimmed" style={{ fontSize: '0.625rem', lineHeight: 1.5 }}>
                {t(
                  'smartFolders.workbench.versionNote',
                  'Originals stay untouched — processed files stored as separate versions in IndexedDB'
                )}
              </Text>
            </Group>
          </Box>

          {/* Activity label */}
          <Box
            style={{
              padding: '1rem 1rem 0.5rem',
              flexShrink: 0,
            }}
          >
            <Text
              size="xs"
              fw={600}
              c={isDragOver ? folder.accentColor : 'dimmed'}
              style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.625rem' }}
            >
              {isDragOver
                ? t('smartFolders.workbench.dropToProcess', 'Drop to process')
                : t('smartFolders.workbench.activity', 'Activity')}
            </Text>
          </Box>

          <ScrollArea style={{ flex: 1 }}>
            <Stack gap="xs" px="md" pb="md">
              {stepProgresses.length === 0 && fileIds.length === 0 ? (
                <Text size="xs" c="dimmed" ta="center" py="lg">
                  {t('smartFolders.workbench.noActivity', 'No activity yet — drop a PDF to start')}
                </Text>
              ) : (
                <>
                  {/* Live step progress */}
                  {[...stepProgresses].reverse().map((step, i) => (
                    <Box
                      key={i}
                      style={{
                        padding: '0.625rem 0.75rem',
                        borderRadius: 'var(--mantine-radius-sm)',
                        backgroundColor: 'var(--mantine-color-default-hover)',
                        border: '0.0625rem solid var(--border-subtle)',
                      }}
                    >
                      <Group gap="xs" wrap="nowrap">
                        {step.status === 'running' && <Loader size="0.625rem" />}
                        {step.status === 'completed' && (
                          <CheckCircleOutlineIcon style={{ fontSize: '0.875rem', color: '#22c55e', flexShrink: 0 }} />
                        )}
                        {step.status === 'error' && (
                          <ErrorOutlineIcon style={{ fontSize: '0.875rem', color: '#ef4444', flexShrink: 0 }} />
                        )}
                        <Text size="xs" style={{ flex: 1, minWidth: 0 }} lineClamp={1}>
                          {`Step ${step.stepIndex + 1}: ${humaniseOp(step.operationName)}`}
                        </Text>
                      </Group>
                      {step.error && (
                        <Text size="xs" c="red" mt={4}>{step.error}</Text>
                      )}
                    </Box>
                  ))}

                  {/* File status list */}
                  {fileIds.map((fileId) => {
                    const meta = folderRecord?.files[fileId];
                    const status = meta?.status ?? 'pending';
                    return (
                      <Box
                        key={fileId}
                        style={{
                          padding: '0.625rem 0.75rem',
                          borderRadius: 'var(--mantine-radius-sm)',
                          backgroundColor: 'var(--mantine-color-default-hover)',
                          border: '0.0625rem solid var(--border-subtle)',
                        }}
                      >
                        <Group gap="xs" wrap="nowrap" justify="space-between">
                          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                            {status === 'processed' && (
                              <CheckCircleOutlineIcon style={{ fontSize: '0.875rem', color: '#22c55e', flexShrink: 0 }} />
                            )}
                            {status === 'processing' && <Loader size="0.625rem" />}
                            {status === 'error' && (
                              <ErrorOutlineIcon style={{ fontSize: '0.875rem', color: '#ef4444', flexShrink: 0 }} />
                            )}
                            {status === 'pending' && (
                              <Box
                                style={{
                                  width: '0.5rem',
                                  height: '0.5rem',
                                  borderRadius: '50%',
                                  backgroundColor: 'var(--mantine-color-dimmed)',
                                  flexShrink: 0,
                                }}
                              />
                            )}
                            <Text size="xs" lineClamp={1} style={{ minWidth: 0 }}>
                              {status === 'processed'
                                ? t('smartFolders.workbench.fileProcessed', 'File processed')
                                : status === 'processing'
                                ? t('smartFolders.workbench.fileProcessing', 'Processing…')
                                : status === 'error'
                                ? t('smartFolders.workbench.fileError', 'Error')
                                : t('smartFolders.workbench.filePending', 'Queued')}
                            </Text>
                          </Group>
                          <Text size="xs" c="dimmed" style={{ fontSize: '0.625rem', flexShrink: 0 }}>
                            {meta?.processedAt
                              ? new Date(meta.processedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : ''}
                          </Text>
                        </Group>
                        {meta?.errorMessage && (
                          <Text size="xs" c="red" mt={4} lineClamp={2}>{meta.errorMessage}</Text>
                        )}
                      </Box>
                    );
                  })}
                </>
              )}
            </Stack>
          </ScrollArea>
        </Box>

        {/* Right: Output files */}
        <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Tabs
            value={filterTab}
            onChange={(v) => setFilterTab((v as FilterTab) || 'processed')}
            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
          >
            <Box
              px="xl"
              style={{
                borderBottom: '0.0625rem solid var(--border-subtle)',
                flexShrink: 0,
              }}
            >
              <Tabs.List style={{ borderBottom: 'none' }}>
                <Tabs.Tab value="processed" fz="xs">
                  {t('smartFolders.workbench.processed', 'Processed')}
                  {processedFileIds.length > 0 && (
                    <Box
                      component="span"
                      ml="xs"
                      style={{
                        padding: '0.0625rem 0.375rem',
                        borderRadius: '1rem',
                        backgroundColor: `${folder.accentColor}20`,
                        color: folder.accentColor,
                        fontSize: '0.625rem',
                        fontWeight: 600,
                      }}
                    >
                      {processedFileIds.length}
                    </Box>
                  )}
                </Tabs.Tab>
                <Tabs.Tab value="processing" fz="xs">
                  {t('smartFolders.workbench.processing', 'Processing')}
                  {processingFileIds.length > 0 && (
                    <Box
                      component="span"
                      ml="xs"
                      style={{
                        padding: '0.0625rem 0.375rem',
                        borderRadius: '1rem',
                        backgroundColor: 'rgba(59,130,246,0.15)',
                        color: '#3b82f6',
                        fontSize: '0.625rem',
                        fontWeight: 600,
                      }}
                    >
                      {processingFileIds.length}
                    </Box>
                  )}
                </Tabs.Tab>
                <Tabs.Tab value="pending" fz="xs">
                  {t('smartFolders.workbench.pending', 'Pending')}
                  {pendingFileIds.length > 0 && (
                    <Box
                      component="span"
                      ml="xs"
                      style={{
                        padding: '0.0625rem 0.375rem',
                        borderRadius: '1rem',
                        backgroundColor: 'var(--mantine-color-default-hover)',
                        color: 'var(--mantine-color-dimmed)',
                        fontSize: '0.625rem',
                        fontWeight: 600,
                      }}
                    >
                      {pendingFileIds.length}
                    </Box>
                  )}
                </Tabs.Tab>
              </Tabs.List>
            </Box>

            <ScrollArea style={{ flex: 1 }}>
              <Box p="xl">
                {filterTab === 'processed' ? (
                  recentRuns.length === 0 ? (
                    <Box style={{ textAlign: 'center', padding: '3rem 0' }}>
                      <Box
                        style={{
                          width: '3rem',
                          height: '3rem',
                          borderRadius: '50%',
                          backgroundColor: 'var(--mantine-color-default-hover)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '0 auto 0.75rem',
                        }}
                      >
                        <DownloadIcon style={{ fontSize: '1.25rem', color: 'var(--mantine-color-dimmed)' }} />
                      </Box>
                      <Text size="sm" c="dimmed" mb={4}>
                        {t('smartFolders.workbench.noOutput', 'No processed files yet')}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {t('smartFolders.workbench.dropToStart', 'Drop files on the left to start')}
                      </Text>
                    </Box>
                  ) : (
                    <Stack gap="sm">
                      {recentRuns.filter(r => r.status === 'processed').map((run, i) => {
                        const inputFile = inputFiles.find(f => f.fileId === run.inputFileId);
                        const outputFile = outputFiles.find(f => f.fileId === run.displayFileId);
                        const inputMeta = folderRecord?.files[run.inputFileId];
                        return (
                          <Box
                            key={`${run.inputFileId}-${i}`}
                            style={{
                              borderRadius: 'var(--mantine-radius-sm)',
                              border: '0.0625rem solid var(--border-subtle)',
                              backgroundColor: 'var(--bg-surface, var(--mantine-color-default))',
                              overflow: 'hidden',
                            }}
                          >
                            {/* Original row */}
                            <Box
                              style={{
                                padding: '0.625rem 1rem',
                                borderBottom: '0.0625rem solid var(--border-subtle)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.625rem',
                                backgroundColor: 'var(--mantine-color-default-hover)',
                              }}
                            >
                              <FolderOpenIcon style={{ fontSize: '0.875rem', color: 'var(--mantine-color-blue-filled)', flexShrink: 0 }} />
                              <Box style={{ flex: 1, minWidth: 0 }}>
                                <Text style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--mantine-color-dimmed)' }}>
                                  {t('smartFolders.workbench.input', 'Input')}
                                </Text>
                                <Text size="xs" lineClamp={1} style={{ minWidth: 0 }}>
                                  {inputFile?.name ?? inputMeta?.name ?? run.inputFileId}
                                </Text>
                              </Box>
                              {inputFile && (
                                <ActionIcon
                                  size="sm"
                                  variant="subtle"
                                  onClick={() => handleDownload(inputFile.blob, inputFile.name)}
                                  aria-label={t('smartFolders.workbench.downloadOriginal', 'Download original')}
                                >
                                  <DownloadIcon style={{ fontSize: '0.875rem' }} />
                                </ActionIcon>
                              )}
                            </Box>
                            {/* Processed row */}
                            <Box
                              style={{
                                padding: '0.625rem 1rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.625rem',
                              }}
                            >
                              <CheckCircleOutlineIcon style={{ fontSize: '0.875rem', color: '#22c55e', flexShrink: 0 }} />
                              <Box style={{ flex: 1, minWidth: 0 }}>
                                <Text style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--mantine-color-dimmed)' }}>
                                  {t('smartFolders.workbench.output', 'Output')}
                                </Text>
                                <Text size="xs" lineClamp={1} style={{ minWidth: 0 }}>
                                  {outputFile?.name ?? run.displayFileId}
                                </Text>
                              </Box>
                              {outputFile && (
                                <Button
                                  size="xs"
                                  variant="light"
                                  leftSection={<DownloadIcon style={{ fontSize: '0.75rem' }} />}
                                  onClick={() => handleDownload(outputFile.blob, outputFile.name)}
                                >
                                  {t('smartFolders.workbench.download', 'Download')}
                                </Button>
                              )}
                            </Box>
                          </Box>
                        );
                      })}
                    </Stack>
                  )
                ) : (
                  tabFileIds.length === 0 ? (
                    <Text size="xs" c="dimmed" ta="center" py="xl">
                      {t('smartFolders.workbench.noFiles', 'No files')}
                    </Text>
                  ) : (
                    <Stack gap="xs">
                      {tabFileIds.map((fileId) => {
                        const meta = folderRecord?.files[fileId];
                        const status = meta?.status ?? 'pending';
                        return (
                          <Box
                            key={fileId}
                            style={{
                              padding: '0.75rem 1rem',
                              borderRadius: 'var(--mantine-radius-sm)',
                              border: '0.0625rem solid var(--border-subtle)',
                              backgroundColor: 'var(--bg-surface, var(--mantine-color-default))',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.75rem',
                            }}
                          >
                            {status === 'processing' && <Loader size="0.75rem" />}
                            {status === 'pending' && (
                              <Box
                                style={{
                                  width: '0.5rem',
                                  height: '0.5rem',
                                  borderRadius: '50%',
                                  backgroundColor: 'var(--mantine-color-dimmed)',
                                  flexShrink: 0,
                                }}
                              />
                            )}
                            <Text size="sm" c="dimmed" style={{ flex: 1 }}>
                              {status === 'processing'
                                ? t('smartFolders.workbench.fileProcessing', 'Processing…')
                                : t('smartFolders.workbench.filePending', 'Queued')}
                            </Text>
                          </Box>
                        );
                      })}
                    </Stack>
                  )
                )}
              </Box>
            </ScrollArea>
          </Tabs>
        </Box>
      </Box>
    </Box>
  );
}
