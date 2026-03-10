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
  Modal,
} from '@mantine/core';
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
import { useFileContext } from '@app/contexts/FileContext';
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
  const { actions: fileActions } = useFileContext();
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
  const [outputFiles, setOutputFiles] = useState<OutputFileRecord[]>([]);
  const [inputFiles, setInputFiles] = useState<InputFileRecord[]>([]);
  const [automation, setAutomation] = useState<AutomationConfig | null>(null);
  const [storageModal, setStorageModal] = useState<'input' | 'output' | 'failed' | null>(null);
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

  const handleView = useCallback(async (blob: Blob, name: string) => {
    const file = new File([blob], name, { type: 'application/pdf' });
    await fileActions.addFiles([file]);
    actions.setWorkbench('viewer');
  }, [fileActions, actions]);

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

  const failedFileIds = fileIds.filter(id => folderRecord?.files[id]?.status === 'error');
  const isProcessingAny = processingFileIds.length > 0;
  const ops = automation?.operations ?? [];

  const hasCompressStep = ops.some(op => op.operation === 'compress');
  const totalInputBytes = inputFiles.reduce((sum, f) => sum + f.blob.size, 0);
  const totalOutputBytes = outputFiles.reduce((sum, f) => sum + f.blob.size, 0);
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

          {/* Add files */}
          <Group gap="lg" align="center">
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
              <Box
                onClick={() => setStorageModal('input')}
                style={{
                  padding: '0.5rem 0.75rem 2rem',
                  borderRadius: 'var(--mantine-radius-sm)',
                  border: '0.0625rem solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-toolbar)',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--mantine-color-blue-filled)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
              >
                <FolderOpenIcon style={{ fontSize: '1.125rem', color: 'var(--mantine-color-blue-filled)', marginBottom: '0.375rem', display: 'block' }} />
                <Text fw={800} style={{ fontSize: '1.375rem', lineHeight: 1, marginBottom: '0.25rem' }}>{inputFiles.length}</Text>
                <Text style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.06em' }} c="dimmed">
                  {t('smartFolders.workbench.inputs', 'Inputs')}
                </Text>
              </Box>

              {/* Outputs */}
              <Box
                onClick={() => setStorageModal('output')}
                style={{
                  padding: '0.5rem 0.75rem 2rem',
                  borderRadius: 'var(--mantine-radius-sm)',
                  border: '0.0625rem solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-toolbar)',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#22c55e')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
              >
                <TaskAltIcon style={{ fontSize: '1.125rem', color: '#22c55e', marginBottom: '0.375rem', display: 'block' }} />
                <Text fw={800} style={{ fontSize: '1.375rem', lineHeight: 1, marginBottom: '0.25rem' }}>{outputFiles.length}</Text>
                <Text style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.06em' }} c="dimmed">
                  {t('smartFolders.workbench.outputs', 'Outputs')}
                </Text>
              </Box>

              {/* Processed */}
              <Box
                style={{
                  padding: '0.5rem 0.75rem 2rem',
                  borderRadius: 'var(--mantine-radius-sm)',
                  border: '0.0625rem solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-toolbar)',
                  textAlign: 'center',
                }}
              >
                <CheckCircleOutlineIcon style={{ fontSize: '1.125rem', color: folder.accentColor, marginBottom: '0.375rem', display: 'block' }} />
                <Text fw={800} style={{ fontSize: '1.375rem', lineHeight: 1, marginBottom: '0.25rem' }}>{processedFileIds.length}</Text>
                <Text style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.06em' }} c="dimmed">
                  {t('smartFolders.workbench.processed', 'Processed')}
                </Text>
              </Box>

              {/* Failed */}
              <Box
                onClick={() => failedFileIds.length > 0 && setStorageModal('failed')}
                style={{
                  padding: '0.5rem 0.75rem 2rem',
                  borderRadius: 'var(--mantine-radius-sm)',
                  border: '0.0625rem solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-toolbar)',
                  textAlign: 'center',
                  cursor: failedFileIds.length > 0 ? 'pointer' : 'default',
                  transition: 'border-color 0.15s ease',
                }}
                onMouseEnter={e => { if (failedFileIds.length > 0) e.currentTarget.style.borderColor = '#ef4444'; }}
                onMouseLeave={e => { if (failedFileIds.length > 0) e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
              >
                <ErrorOutlineIcon style={{ fontSize: '1.125rem', color: failedFileIds.length > 0 ? '#ef4444' : 'var(--mantine-color-dimmed)', marginBottom: '0.375rem', display: 'block' }} />
                <Text fw={800} style={{ fontSize: '1.375rem', lineHeight: 1, marginBottom: '0.25rem' }}>
                  {failedFileIds.length}
                </Text>
                <Text style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.06em' }} c="dimmed">
                  {t('smartFolders.workbench.failed', 'Failed')}
                </Text>
              </Box>

              {/* Data saved — only when compress is in pipeline */}
              {hasCompressStep && (
                <Box
                  style={{
                    padding: '0.5rem 0.75rem 2rem',
                    borderRadius: 'var(--mantine-radius-sm)',
                    border: '0.0625rem solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-toolbar)',
                  textAlign: 'center',
                  }}
                >
                  <DownloadIcon style={{ fontSize: '1.125rem', color: dataSavedBytes > 0 ? '#22c55e' : 'var(--mantine-color-dimmed)', marginBottom: '0.375rem', display: 'block' }} />
                  <Text fw={800} style={{ fontSize: '1.375rem', lineHeight: 1, marginBottom: '0.25rem' }}>
                    {dataSavedBytes > 0 ? formatBytes(dataSavedBytes) : '—'}
                  </Text>
                  <Text style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.06em' }} c="dimmed">
                    {t('smartFolders.workbench.dataSaved', 'Saved')}
                  </Text>
                </Box>
              )}

              {/* Days running */}
              <Box
                style={{
                  padding: '0.5rem 0.75rem 2rem',
                  borderRadius: 'var(--mantine-radius-sm)',
                  border: '0.0625rem solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-toolbar)',
                  textAlign: 'center',
                }}
              >
                <HistoryIcon style={{ fontSize: '1.125rem', color: 'var(--mantine-color-dimmed)', marginBottom: '0.375rem', display: 'block' }} />
                <Text fw={800} style={{ fontSize: '1.375rem', lineHeight: 1, marginBottom: '0.25rem' }}>
                  {daysRunning !== null && daysRunning > 0 ? `${daysRunning}d` : '—'}
                </Text>
                <Text style={{ fontSize: '0.5625rem', textTransform: 'uppercase', letterSpacing: '0.06em' }} c="dimmed">
                  {t('smartFolders.workbench.running', 'Running')}
                </Text>
              </Box>
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
                          border: `0.0625rem solid ${status === 'error' ? '#ef444440' : 'var(--border-subtle)'}`,
                          backgroundColor: 'var(--bg-toolbar)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        {status === 'processed' && <CheckCircleOutlineIcon style={{ fontSize: '0.875rem', color: '#22c55e', flexShrink: 0 }} />}
                        {status === 'processing' && <Loader size="0.625rem" />}
                        {status === 'error' && <ErrorOutlineIcon style={{ fontSize: '0.875rem', color: '#ef4444', flexShrink: 0 }} />}
                        {status === 'pending' && <Box style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', backgroundColor: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />}
                        <Text size="xs" lineClamp={1} style={{ flex: 1, minWidth: 0 }}>{filename}</Text>
                        {meta?.errorMessage && <Text size="xs" c="red" lineClamp={1} style={{ flexShrink: 0, maxWidth: '40%' }}>{meta.errorMessage}</Text>}
                        {outputFile && (
                          <ActionIcon size="sm" variant="subtle" onClick={() => handleView(outputFile.blob, outputFile.name)} title="View">
                            <VisibilityIcon style={{ fontSize: '1rem' }} />
                          </ActionIcon>
                        )}
                        {outputFile && (
                          <ActionIcon size="sm" variant="subtle" onClick={() => handleDownload(outputFile.blob, outputFile.name)} title="Download output">
                            <DownloadIcon style={{ fontSize: '1rem' }} />
                          </ActionIcon>
                        )}
                        <Text size="xs" c="dimmed" style={{ fontSize: '0.625rem', flexShrink: 0 }}>
                          {(meta?.processedAt || meta?.addedAt)
                            ? new Date((meta.processedAt ?? meta.addedAt)!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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

      {/* Storage file modal */}
      <Modal
        opened={storageModal !== null}
        onClose={() => setStorageModal(null)}
        title={
          <Text fw={600} size="sm">
            {storageModal === 'input'
              ? t('smartFolders.workbench.inputFiles', 'Input files')
              : storageModal === 'output'
              ? t('smartFolders.workbench.outputFiles', 'Output files')
              : t('smartFolders.workbench.failedFiles', 'Failed files')}
          </Text>
        }
        size="md"
      >
        {storageModal === 'input' && (
          inputFiles.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              {t('smartFolders.workbench.noInputFiles', 'No input files stored yet')}
            </Text>
          ) : (
            <Stack gap="xs">
              {inputFiles.map((file) => (
                <Box
                  key={file.fileId}
                  style={{
                    padding: '0.625rem 0.75rem',
                    borderRadius: 'var(--mantine-radius-sm)',
                    border: '0.0625rem solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <FolderOpenIcon style={{ fontSize: '1rem', color: 'var(--mantine-color-blue-filled)', flexShrink: 0 }} />
                  <Text size="sm" style={{ flex: 1, minWidth: 0 }} lineClamp={1}>{file.name}</Text>
                  <ActionIcon
                    variant="light"
                    size="sm"
                    onClick={() => handleDownload(file.blob, file.name)}
                    aria-label={t('smartFolders.workbench.download', 'Download')}
                  >
                    <DownloadIcon style={{ fontSize: '0.875rem' }} />
                  </ActionIcon>
                </Box>
              ))}
            </Stack>
          )
        )}
        {storageModal === 'output' && (
          outputFiles.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              {t('smartFolders.workbench.noOutputFiles', 'No output files stored yet')}
            </Text>
          ) : (
            <Stack gap="xs">
              {outputFiles.map((file) => (
                <Box
                  key={file.fileId}
                  style={{
                    padding: '0.625rem 0.75rem',
                    borderRadius: 'var(--mantine-radius-sm)',
                    border: '0.0625rem solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <TaskAltIcon style={{ fontSize: '1rem', color: '#22c55e', flexShrink: 0 }} />
                  <Text size="sm" style={{ flex: 1, minWidth: 0 }} lineClamp={1}>{file.name}</Text>
                  <ActionIcon
                    variant="light"
                    size="sm"
                    onClick={() => handleDownload(file.blob, file.name)}
                    aria-label={t('smartFolders.workbench.download', 'Download')}
                  >
                    <DownloadIcon style={{ fontSize: '0.875rem' }} />
                  </ActionIcon>
                </Box>
              ))}
            </Stack>
          )
        )}
        {storageModal === 'failed' && (
          failedFileIds.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              {t('smartFolders.workbench.noFailedFiles', 'No failed files')}
            </Text>
          ) : (
            <Stack gap="xs">
              {failedFileIds.map((fileId) => {
                const meta = folderRecord?.files[fileId];
                const inputFile = inputFiles.find(f => f.fileId === fileId);
                const filename = meta?.name ?? inputFile?.name ?? fileId;
                return (
                  <Box
                    key={fileId}
                    style={{
                      borderRadius: 'var(--mantine-radius-sm)',
                      border: '0.0625rem solid #ef444440',
                      backgroundColor: 'rgba(239,68,68,0.04)',
                      overflow: 'hidden',
                    }}
                  >
                    <Group gap="xs" style={{ padding: '0.625rem 0.75rem', borderBottom: '0.0625rem solid #ef444420' }}>
                      <ErrorOutlineIcon style={{ fontSize: '1rem', color: '#ef4444', flexShrink: 0 }} />
                      <Text size="sm" style={{ flex: 1, minWidth: 0 }} lineClamp={1}>{filename}</Text>
                      {inputFile && (
                        <ActionIcon size="sm" variant="subtle" onClick={() => handleDownload(inputFile.blob, inputFile.name)}>
                          <DownloadIcon style={{ fontSize: '0.875rem' }} />
                        </ActionIcon>
                      )}
                      {inputFile && (
                        <ActionIcon
                          size="sm"
                          variant="light"
                          color="blue"
                          onClick={async () => {
                            await updateFileMetadata(fileId, { status: 'pending', errorMessage: undefined });
                            const file = new File([inputFile.blob], inputFile.name, { type: 'application/pdf' });
                            runAutomation(file, fileId);
                            setStorageModal(null);
                          }}
                          title="Retry"
                        >
                          <ReplayIcon style={{ fontSize: '0.875rem' }} />
                        </ActionIcon>
                      )}
                    </Group>
                    {meta?.errorMessage && (
                      <Text size="xs" c="red" style={{ padding: '0.5rem 0.75rem' }}>{meta.errorMessage}</Text>
                    )}
                  </Box>
                );
              })}
            </Stack>
          )
        )}
      </Modal>
    </Box>
  );
}
