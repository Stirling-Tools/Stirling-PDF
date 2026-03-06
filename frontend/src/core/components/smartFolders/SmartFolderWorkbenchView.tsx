import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Text,
  Stack,
  Group,
  Button,
  Badge,
  ScrollArea,
  Loader,
  Tabs,
  ActionIcon,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useSmartFolders } from '@app/hooks/useSmartFolders';
import { useFolderData } from '@app/hooks/useFolderData';
import { useFolderRunState } from '@app/hooks/useFolderRunState';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { SMART_FOLDER_VIEW_ID } from '@app/components/smartFolders/SmartFoldersRegistration';
import { automationStorage } from '@app/services/automationStorage';
import { folderStorage } from '@app/services/folderStorage';
import { executeAutomationSequence } from '@app/utils/automationExecutor';
import { SmartFolderRunEntry } from '@app/types/smartFolders';
import { AutomationConfig } from '@app/types/automation';
import { iconMap } from '@app/components/tools/automate/iconMap';
import { fileStorage } from '@app/services/fileStorage';
import { FileId } from '@app/types/fileContext';
import { SmartFolderHomePage } from '@app/components/smartFolders/SmartFolderHomePage';

interface SmartFolderWorkbenchViewProps {
  data: { folderId: string | null; pendingFileId?: string };
}

interface StepProgress {
  stepIndex: number;
  operationName: string;
  status: 'running' | 'completed' | 'error';
  error?: string;
}

type FilterTab = 'all' | 'pending' | 'processing' | 'processed';

export function SmartFolderWorkbenchView({ data }: SmartFolderWorkbenchViewProps) {
  const { folderId } = data;
  const { t } = useTranslation();
  const { toolRegistry, setCustomWorkbenchViewData } = useToolWorkflow();
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
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [outputFiles, setOutputFiles] = useState<{ fileId: string; name: string; blob: Blob }[]>([]);
  const processingRef = useRef<Set<string>>(new Set());
  const handledPendingRef = useRef<string | null>(null);

  // Load output files
  useEffect(() => {
    folderStorage.getOutputFilesByFolder(folderId).then(records => {
      setOutputFiles(records.map(r => ({ fileId: r.fileId, name: r.name, blob: r.blob })));
    });
  }, [folderId, recentRuns]);

  const runAutomation = useCallback(
    async (inputFile: File, inputFileId: string) => {
      if (processingRef.current.has(inputFileId)) return;
      processingRef.current.add(inputFileId);

      try {
        if (!folder) return;
        const automation: AutomationConfig | null = await automationStorage.getAutomation(folder.automationId);
        if (!automation) {
          await updateFileMetadata(inputFileId, { status: 'error', errorMessage: 'Automation not found' });
          return;
        }

        await updateFileMetadata(inputFileId, { status: 'processing' });

        const totalSteps = automation.operations.length;
        setStepProgresses(prev => [
          ...prev,
          { stepIndex: 0, operationName: automation.operations[0]?.operation ?? '', status: 'running' },
        ]);

        const resultFiles = await executeAutomationSequence(
          automation,
          [inputFile],
          toolRegistry,
          (stepIndex, operationName) => {
            setStepProgresses(prev => {
              const updated = [...prev.filter(p => !(p.stepIndex === stepIndex && p.operationName === operationName))];
              updated.push({ stepIndex, operationName, status: 'running' });
              return updated;
            });
          },
          (stepIndex, resultFiles) => {
            setStepProgresses(prev =>
              prev.map(p =>
                p.stepIndex === stepIndex ? { ...p, status: 'completed' } : p
              )
            );
          },
          (stepIndex, error) => {
            setStepProgresses(prev =>
              prev.map(p =>
                p.stepIndex === stepIndex ? { ...p, status: 'error', error } : p
              )
            );
          }
        );

        // Store output files
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
        await addFile(inputFileId, { status: 'pending', inputFileId });
        runAutomation(file, inputFileId);
      }
    },
    [addFile, runAutomation]
  );

  // Auto-process a file passed via workbench data (e.g. from sidebar or "Add to Smart Folder")
  useEffect(() => {
    const { pendingFileId } = data;
    if (!pendingFileId || handledPendingRef.current === pendingFileId) return;
    handledPendingRef.current = pendingFileId;
    // Clear pendingFileId from workbench data so re-mounting doesn't replay it
    setCustomWorkbenchViewData(SMART_FOLDER_VIEW_ID, { folderId });
    fileStorage.getStirlingFile(pendingFileId as FileId).then((stirlingFile) => {
      if (stirlingFile) handleFiles([stirlingFile]);
    });
  }, [data, folderId, handleFiles, setCustomWorkbenchViewData]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
      }
      e.target.value = '';
    },
    [handleFiles]
  );

  const handleDownload = useCallback(async (fileId: string, name: string) => {
    const record = await folderStorage.getOutputFile(fileId);
    if (!record) return;
    const url = URL.createObjectURL(record.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Filtered file list
  const displayFileIds = (() => {
    if (filterTab === 'all') return fileIds;
    if (filterTab === 'pending') return pendingFileIds;
    if (filterTab === 'processing') return processingFileIds;
    if (filterTab === 'processed') return processedFileIds;
    return fileIds;
  })();

  // Home page: no specific folder selected
  if (!folderId) {
    return <SmartFolderHomePage />;
  }

  const FolderIcon = folder ? (iconMap[folder.icon as keyof typeof iconMap] || iconMap.SettingsIcon) : iconMap.SettingsIcon;

  if (!folder) {
    return (
      <Box p="xl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Text c="dimmed">{t('smartFolders.folderNotFound', 'Folder not found')}</Text>
      </Box>
    );
  }

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box
        p="md"
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-toolbar)',
        }}
      >
        <Group gap="sm" align="center">
          <Box
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              backgroundColor: `${folder.accentColor}22`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FolderIcon style={{ fontSize: 18, color: folder.accentColor }} />
          </Box>
          <Stack gap={0}>
            <Text fw={600} size="md">{folder.name}</Text>
            {folder.description && (
              <Text size="xs" c="dimmed">{folder.description}</Text>
            )}
          </Stack>
        </Group>
      </Box>

      {/* Main 3-column layout */}
      <Box style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, minHeight: 0 }}>
        {/* Column 1: Drop zone + pending */}
        <Box style={{ borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box p="sm" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
              {t('smartFolders.workbench.dropFiles', 'Drop PDFs here')}
            </Text>
          </Box>

          {/* Drop zone */}
          <Box
            p="md"
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${isDragOver ? folder.accentColor : 'var(--border-subtle)'}`,
              borderRadius: 'var(--mantine-radius-md)',
              margin: '0.75rem',
              padding: '1.5rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: isDragOver ? `${folder.accentColor}11` : 'transparent',
              transition: 'all 0.15s',
              cursor: 'pointer',
            }}
            onClick={() => document.getElementById(`folder-file-input-${folderId}`)?.click()}
          >
            <UploadFileIcon style={{ fontSize: 28, color: isDragOver ? folder.accentColor : 'var(--mantine-color-gray-5)' }} />
            <Text size="xs" c="dimmed" ta="center">
              {t('smartFolders.workbench.dropOrClick', 'Drop PDFs or click to browse')}
            </Text>
          </Box>
          <input
            id={`folder-file-input-${folderId}`}
            type="file"
            accept=".pdf"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />

          {/* File list with tabs */}
          <Box style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Tabs
              value={filterTab}
              onChange={(v) => setFilterTab((v as FilterTab) || 'all')}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            >
              <Tabs.List px="xs">
                <Tabs.Tab value="all" fz="xs">{t('smartFolders.workbench.all', 'All')} ({fileIds.length})</Tabs.Tab>
                <Tabs.Tab value="pending" fz="xs">{t('smartFolders.workbench.pending', 'Pending')} ({pendingFileIds.length})</Tabs.Tab>
                <Tabs.Tab value="processing" fz="xs">{t('smartFolders.workbench.processing', 'Processing')} ({processingFileIds.length})</Tabs.Tab>
                <Tabs.Tab value="processed" fz="xs">{t('smartFolders.workbench.processed', 'Processed')} ({processedFileIds.length})</Tabs.Tab>
              </Tabs.List>
              <ScrollArea style={{ flex: 1 }}>
                <Stack gap={2} p="xs">
                  {displayFileIds.length === 0 ? (
                    <Text size="xs" c="dimmed" ta="center" py="md">
                      {t('smartFolders.workbench.noFiles', 'No files')}
                    </Text>
                  ) : (
                    displayFileIds.map((fileId) => {
                      const meta = folderRecord?.files[fileId];
                      return (
                        <Box
                          key={fileId}
                          p="xs"
                          style={{
                            borderRadius: 'var(--mantine-radius-sm)',
                            backgroundColor: 'var(--mantine-color-gray-0)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <Group gap="xs" justify="space-between">
                            <Text size="xs" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {fileId.substring(0, 12)}…
                            </Text>
                            <Badge
                              size="xs"
                              color={
                                meta?.status === 'processed' ? 'teal' :
                                meta?.status === 'processing' ? 'blue' :
                                meta?.status === 'error' ? 'red' : 'gray'
                              }
                            >
                              {meta?.status ?? 'pending'}
                            </Badge>
                          </Group>
                          {meta?.errorMessage && (
                            <Text size="xs" c="red" mt={2}>{meta.errorMessage}</Text>
                          )}
                        </Box>
                      );
                    })
                  )}
                </Stack>
              </ScrollArea>
            </Tabs>
          </Box>
        </Box>

        {/* Column 2: Processing log */}
        <Box style={{ borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box p="sm" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
              {t('smartFolders.workbench.processingLog', 'Processing log')}
            </Text>
          </Box>
          <ScrollArea style={{ flex: 1 }}>
            <Stack gap={2} p="xs">
              {stepProgresses.length === 0 ? (
                <Text size="xs" c="dimmed" ta="center" py="md">
                  {t('smartFolders.workbench.noProcessing', 'No processing activity yet')}
                </Text>
              ) : (
                [...stepProgresses].reverse().map((step, i) => (
                  <Box
                    key={i}
                    p="xs"
                    style={{
                      borderRadius: 'var(--mantine-radius-sm)',
                      backgroundColor: 'var(--mantine-color-gray-0)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <Group gap="xs">
                      {step.status === 'running' && <Loader size={10} />}
                      {step.status === 'completed' && (
                        <Box style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--mantine-color-teal-5)' }} />
                      )}
                      {step.status === 'error' && (
                        <Box style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--mantine-color-red-5)' }} />
                      )}
                      <Text size="xs">
                        {t('smartFolders.workbench.step', 'Step {{step}}: {{operation}}', {
                          step: step.stepIndex + 1,
                          operation: step.operationName,
                        })}
                      </Text>
                    </Group>
                    {step.error && <Text size="xs" c="red">{step.error}</Text>}
                  </Box>
                ))
              )}
            </Stack>
          </ScrollArea>
        </Box>

        {/* Column 3: Output files */}
        <Box style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box p="sm" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
              {t('smartFolders.workbench.output', 'Output files')}
            </Text>
          </Box>
          <ScrollArea style={{ flex: 1 }}>
            <Stack gap={2} p="xs">
              {outputFiles.length === 0 ? (
                <Text size="xs" c="dimmed" ta="center" py="md">
                  {t('smartFolders.workbench.noOutput', 'No processed files yet')}
                </Text>
              ) : (
                outputFiles.map((file) => (
                  <Box
                    key={file.fileId}
                    p="xs"
                    style={{
                      borderRadius: 'var(--mantine-radius-sm)',
                      backgroundColor: 'var(--mantine-color-gray-0)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <Group gap="xs" justify="space-between">
                      <Text size="xs" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.name}
                      </Text>
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        onClick={() => handleDownload(file.fileId, file.name)}
                        aria-label={t('smartFolders.workbench.download', 'Download')}
                      >
                        <DownloadIcon style={{ fontSize: 12 }} />
                      </ActionIcon>
                    </Group>
                  </Box>
                ))
              )}
            </Stack>
          </ScrollArea>
        </Box>
      </Box>
    </Box>
  );
}
