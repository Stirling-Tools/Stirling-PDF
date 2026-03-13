import { useState, useCallback, useEffect } from 'react';
import { Box, Text, Stack, Group, ActionIcon, Button, Loader, ScrollArea } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CloseIcon from '@mui/icons-material/Close';
import FolderPlusIcon from '@mui/icons-material/CreateNewFolder';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { useSmartFolders } from '@app/hooks/useSmartFolders';
import { useFolderRunStatuses } from '@app/hooks/useFolderRunStatuses';
import { SmartFolder, SmartFolderRunEntry } from '@app/types/smartFolders';
import { AutomationConfig } from '@app/types/automation';
import { iconMap } from '@app/components/tools/automate/iconMap';
import { automationStorage } from '@app/services/automationStorage';
import { folderStorage } from '@app/services/folderStorage';
import { fileStorage } from '@app/services/fileStorage';
import { folderRunStateStorage } from '@app/services/folderRunStateStorage';
import {
  FileId,
  StirlingFileStub,
  createFileId,
  createStirlingFile,
  createQuickKey,
  isStirlingFile,
} from '@app/types/fileContext';
import { executeAutomationSequence } from '@app/utils/automationExecutor';
import { SmartFolderManagementModal } from '@app/components/smartFolders/SmartFolderManagementModal';
import { DeleteFolderConfirmModal } from '@app/components/smartFolders/DeleteFolderConfirmModal';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useNavigationActions } from '@app/contexts/NavigationContext';
import {
  SMART_FOLDER_VIEW_ID,
  SMART_FOLDER_WORKBENCH_ID,
} from '@app/components/smartFolders/SmartFoldersRegistration';

const KEYFRAMES = `
  @keyframes wf-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.35; transform: scale(0.7); }
  }
`;

function humaniseOp(op: string): string {
  return op
    .replace(/-pdf$|-pages$|-documents?$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\bocr\b/gi, 'OCR')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

interface FolderCardProps {
  folder: SmartFolder;
  status: 'idle' | 'processing' | 'done';
  isProcessing: boolean;
  onEdit: (folder: SmartFolder) => void;
  onDelete: (folder: SmartFolder) => void;
  onOpen: (folderId: string) => void;
  onDropFiles: (folder: SmartFolder, files: File[]) => void;
  onDropSidebarFile: (folder: SmartFolder, fileIds: string[]) => void;
  onTogglePause: (folder: SmartFolder) => void;
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
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    automationStorage.getAutomation(folder.automationId).then(setAutomation);

    const loadData = () =>
      folderStorage.getFolderData(folder.id).then((record) => {
        if (!record) { setFileCount(0); setLastAdded(null); return; }
        const files = Object.values(record.files);
        setFileCount(files.length);
        const dates = files.map(f => new Date(f.addedAt)).filter(d => !isNaN(d.getTime()));
        setLastAdded(dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null);
      });
    loadData();

    const unsub = folderStorage.onFolderChange((changedId) => {
      if (changedId === folder.id) loadData();
    });
    return unsub;
  }, [folder.id, folder.automationId]);

  const FolderIcon = iconMap[folder.icon as keyof typeof iconMap] ?? iconMap.FolderIcon;
  const isPaused = folder.isPaused ?? false;
  const isActive = !isPaused && (isProcessing || status === 'processing');
  const isDone = !isPaused && status === 'done' && !isActive;

  const statusDotColor = isPaused ? 'var(--mantine-color-dimmed)' : isActive ? '#3b82f6' : isDone ? '#22c55e' : '#6b7280';
  const statusDotPulse = isActive;

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const multiRaw = e.dataTransfer.getData('watchFolderFileIds');
    if (multiRaw) {
      try {
        const ids: string[] = JSON.parse(multiRaw);
        if (ids.length > 0) { onDropSidebarFile(folder, ids); return; }
      } catch { /* fall through */ }
    }
    const sidebarFileId = e.dataTransfer.getData('watchFolderFileId');
    if (sidebarFileId) {
      onDropSidebarFile(folder, [sidebarFileId]);
    } else if (e.dataTransfer.files.length > 0) {
      onDropFiles(folder, Array.from(e.dataTransfer.files));
    }
  };

  const ops = automation?.operations ?? [];

  const cardBorderColor = isDragOver || isHovered
    ? folder.accentColor
    : 'var(--mantine-color-default-border)';

  const cardBoxShadow = isDragOver || isHovered
    ? `0 0.25rem 0.75rem ${folder.accentColor}25`
    : '0 0.0625rem 0.25rem rgba(0,0,0,0.08)';

  return (
    <Box
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        border: `0.0625rem solid ${cardBorderColor}`,
        backgroundColor: isDragOver
          ? `${folder.accentColor}08`
          : 'var(--bg-toolbar)',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease',
        boxShadow: cardBoxShadow,
        cursor: 'pointer',
        position: 'relative',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => onOpen(folder.id)}
    >
      <Box style={{ padding: '1.25rem' }}>
        <Group align="flex-start" wrap="nowrap" gap="md">

          {/* Icon with status dot */}
          <Box style={{ position: 'relative', flexShrink: 0 }}>
            <Box
              style={{
                width: '3rem',
                height: '3rem',
                borderRadius: '0.625rem',
                backgroundColor: `${folder.accentColor}18`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FolderIcon style={{ fontSize: '1.5rem', color: folder.accentColor }} />
            </Box>
            {/* Status dot overlay */}
            <Box
              style={{
                position: 'absolute',
                bottom: '-0.1875rem',
                right: '-0.1875rem',
                width: '0.875rem',
                height: '0.875rem',
                borderRadius: '50%',
                backgroundColor: 'var(--bg-surface, var(--mantine-color-default))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Box
                style={{
                  width: '0.5rem',
                  height: '0.5rem',
                  borderRadius: '50%',
                  backgroundColor: statusDotColor,
                  animation: statusDotPulse ? 'wf-pulse 1.4s ease-in-out infinite' : 'none',
                }}
              />
            </Box>
          </Box>

          {/* Main content */}
          <Box style={{ flex: 1, minWidth: 0 }}>
            {/* Name + status pill + actions */}
            <Group justify="space-between" align="center" wrap="nowrap" mb="xs">
              <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                <Text
                  fw={600}
                  size="sm"
                  style={{ letterSpacing: '-0.01em', lineHeight: 1.3 }}
                  lineClamp={1}
                >
                  {folder.name}
                </Text>
                <Box
                  style={{
                    padding: '0.125rem 0.5rem',
                    borderRadius: '1rem',
                    fontSize: '0.6875rem',
                    fontWeight: 500,
                    backgroundColor: isPaused
                      ? 'var(--mantine-color-default-hover)'
                      : isActive
                      ? 'rgba(59, 130, 246, 0.12)'
                      : 'rgba(34, 197, 94, 0.12)',
                    color: isPaused ? 'var(--mantine-color-dimmed)' : isActive ? '#3b82f6' : '#22c55e',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {isPaused
                    ? t('smartFolders.status.paused', 'Paused')
                    : isActive
                    ? t('smartFolders.status.processing', 'Processing')
                    : t('smartFolders.status.active', 'Active')}
                </Box>
              </Group>

              {/* Right: file count + hover actions */}
              <Group gap="sm" wrap="nowrap" align="center" style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                <Box style={{ textAlign: 'right', marginRight: '0.25rem' }}>
                  <Text fw={700} size="sm" style={{ color: '#fff', lineHeight: 1.2 }}>
                    {fileCount} {fileCount === 1
                      ? t('smartFolders.home.file', 'file')
                      : t('smartFolders.home.files', 'files')}
                  </Text>
                  {lastAdded && (
                    <Text size="xs" c="dimmed" style={{ fontSize: '0.625rem', lineHeight: 1.3 }}>
                      {(() => {
                        const now = new Date();
                        const isToday = lastAdded.toDateString() === now.toDateString();
                        if (isToday) {
                          const hrs = Math.floor((now.getTime() - lastAdded.getTime()) / 3600000);
                          return hrs < 1 ? 'just now' : `${hrs}hr${hrs === 1 ? '' : 's'} ago`;
                        }
                        const days = Math.floor((now.getTime() - lastAdded.getTime()) / 86400000);
                        return days === 1 ? '1 day ago' : `${days} days ago`;
                      })()}
                    </Text>
                  )}
                </Box>

                <Group
                  gap="xs"
                  wrap="nowrap"
                  align="center"
                  style={{
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 0.15s ease',
                    marginLeft: '0.75rem',
                  }}
                >
                  <ActionIcon
                    size="md"
                    variant="subtle"
                    onClick={() => onTogglePause(folder)}
                    aria-label={isPaused ? t('smartFolders.home.resume', 'Resume') : t('smartFolders.home.pause', 'Pause')}
                    title={isPaused ? t('smartFolders.home.resume', 'Resume') : t('smartFolders.home.pause', 'Pause')}
                  >
                    {isPaused
                      ? <PlayCircleOutlineIcon style={{ fontSize: '1.125rem' }} />
                      : <PauseCircleOutlineIcon style={{ fontSize: '1.125rem' }} />}
                  </ActionIcon>
                  <ActionIcon
                    size="md"
                    variant="subtle"
                    onClick={() => onEdit(folder)}
                    aria-label={t('smartFolders.home.editFolder', 'Edit folder')}
                  >
                    <EditIcon style={{ fontSize: '1.125rem' }} />
                  </ActionIcon>
                  <ActionIcon
                    size="md"
                    variant="subtle"
                    color="red"
                    onClick={() => onDelete(folder)}
                    aria-label={t('smartFolders.home.deleteFolder', 'Delete folder')}
                  >
                    <DeleteOutlineIcon style={{ fontSize: '1.125rem' }} />
                  </ActionIcon>
                </Group>
              </Group>
            </Group>

            {/* Pipeline chips */}
            {ops.length > 0 && (
              <Group gap="xs" wrap="wrap" mb="xs">
                {ops.map((op, i) => (
                  <Group key={i} gap={4} wrap="nowrap" align="center">
                    {i > 0 && (
                      <ChevronRightIcon
                        style={{ fontSize: '0.75rem', color: 'var(--mantine-color-dimmed)', flexShrink: 0 }}
                      />
                    )}
                    <Box
                      style={{
                        padding: '0.125rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        backgroundColor: 'var(--mantine-color-default-hover)',
                        color: 'var(--mantine-color-text)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {humaniseOp(op.operation)}
                    </Box>
                  </Group>
                ))}
              </Group>
            )}
            {ops.length === 0 && (
              <Text size="xs" c="dimmed" mb="xs" style={{ fontStyle: 'italic' }}>
                {t('smartFolders.home.noSteps', 'No automation steps configured')}
              </Text>
            )}

            {isDragOver && (
              <Text size="xs" fw={600} style={{ color: folder.accentColor, fontSize: '0.6875rem' }}>
                {t('smartFolders.home.dropHere', 'Drop to process')}
              </Text>
            )}
          </Box>
        </Group>
      </Box>
    </Box>
  );
}

function HowItWorks() {
  const { t } = useTranslation();

  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('wf_howItWorks_dismissed') === '1');

  if (dismissed) return null;

  const steps = [
    {
      n: '1',
      title: t('smartFolders.howItWorks.step1Title', 'Drop files'),
      desc: t('smartFolders.howItWorks.step1Desc', 'Drag PDFs onto any Watch Folder card — or send them from your file list'),
    },
    {
      n: '2',
      title: t('smartFolders.howItWorks.step2Title', 'Pipeline runs'),
      desc: t('smartFolders.howItWorks.step2Desc', 'Your configured tools process each file automatically'),
    },
    {
      n: '3',
      title: t('smartFolders.howItWorks.step3Title', 'Output ready'),
      desc: t('smartFolders.howItWorks.step3Desc', 'Download processed files from inside the folder'),
    },
  ];

  return (
    <Box
      mt="lg"
      style={{
        padding: '1rem 1.25rem',
        borderRadius: 'var(--mantine-radius-md)',
        border: '0.0625rem solid var(--border-subtle)',
        backgroundColor: 'var(--bg-toolbar)',
      }}
    >
      <Group gap="xs" mb="sm" justify="space-between">
        <Group gap="xs">
          <InfoOutlinedIcon style={{ fontSize: '1rem', color: 'var(--mantine-color-blue-filled)' }} />
          <Text fw={600} size="xs">
            {t('smartFolders.howItWorks.title', 'How Watch Folders work')}
          </Text>
        </Group>
        <ActionIcon
          size="xs"
          variant="subtle"
          color="gray"
          onClick={() => { sessionStorage.setItem('wf_howItWorks_dismissed', '1'); setDismissed(true); }}
          aria-label="Dismiss"
        >
          <CloseIcon style={{ fontSize: '0.75rem', color: 'var(--mantine-color-text)' }} />
        </ActionIcon>
      </Group>
      <Group gap="xl" wrap="nowrap" align="flex-start">
        {steps.map((step) => (
          <Group key={step.n} gap="sm" wrap="nowrap" align="flex-start" style={{ flex: 1 }}>
            <Box
              style={{
                width: '1.375rem',
                height: '1.375rem',
                borderRadius: '50%',
                backgroundColor: 'var(--mantine-color-blue-light)',
                color: 'var(--mantine-color-blue-filled)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.6875rem',
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
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4rem 2rem',
        gap: '1.5rem',
        maxWidth: '32rem',
        margin: '0 auto',
        textAlign: 'center',
      }}
    >
      <Box
        style={{
          width: '5rem',
          height: '5rem',
          borderRadius: '1.25rem',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, transparent 100%)',
          border: '0.0625rem solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <FolderPlusIcon style={{ fontSize: '2rem', color: 'var(--mantine-color-blue-filled)' }} />
      </Box>

      <Stack gap="xs" align="center">
        <Text fw={700} size="lg" style={{ letterSpacing: '-0.02em' }}>
          {t('smartFolders.home.emptyTitle', 'Automate your PDF workflows')}
        </Text>
        <Text size="sm" c="dimmed" style={{ lineHeight: 1.6, maxWidth: '22rem' }}>
          {t(
            'smartFolders.home.emptyDesc',
            "Set up a Watch Folder once. Drop PDFs in and they're automatically compressed, OCR'd, split, merged — whatever your pipeline does."
          )}
        </Text>
      </Stack>

      <Button
        size="md"
        leftSection={<AddIcon style={{ fontSize: '1.125rem' }} />}
        onClick={onCreate}
      >
        {t('smartFolders.home.create', 'Create your first Watch Folder')}
      </Button>

      <HowItWorks />
    </Box>
  );
}

export function SmartFolderHomePage() {
  const { t } = useTranslation();
  const { folders, loading, deleteFolder, updateFolder, refreshFolders } = useSmartFolders();
  const statuses = useFolderRunStatuses(folders);
  const { toolRegistry, setCustomWorkbenchViewData } = useToolWorkflow();
  const { actions } = useNavigationActions();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editFolder, setEditFolder] = useState<SmartFolder | null>(null);
  const [editAutomation, setEditAutomation] = useState<AutomationConfig | null>(null);
  const [processingFolderIds, setProcessingFolderIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<SmartFolder | null>(null);

  const navigateToFolder = useCallback(
    (folderId: string) => {
      setCustomWorkbenchViewData(SMART_FOLDER_VIEW_ID, { folderId });
      actions.setWorkbench(SMART_FOLDER_WORKBENCH_ID);
    },
    [setCustomWorkbenchViewData, actions]
  );

  const handleTogglePause = useCallback(async (folder: SmartFolder) => {
    await updateFolder({ ...folder, isPaused: !folder.isPaused });
    refreshFolders();
  }, [updateFolder, refreshFolders]);

  const handleEdit = useCallback(async (folder: SmartFolder) => {
    setEditFolder(folder);
    const automation = await automationStorage.getAutomation(folder.automationId);
    setEditAutomation(automation);
    setCreateModalOpen(true);
  }, []);

  const handleModalClose = () => {
    setCreateModalOpen(false);
    setEditFolder(null);
    setEditAutomation(null);
  };

  const processFiles = useCallback(
    async (folder: SmartFolder, files: File[]) => {
      if (folder.isPaused) return;

      const pdfs = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
      if (pdfs.length === 0) return;

      setProcessingFolderIds((prev) => new Set([...prev, folder.id]));
      try {
        const automation: AutomationConfig | null = await automationStorage.getAutomation(
          folder.automationId
        );
        if (!automation) return;

        for (const file of pdfs) {
          // Resolve input file ID — reuse existing if already in the main store.
          // Track whether we created a fresh stub so we know whether to mark it as processed.
          let inputFileId: string;
          let ownedByFolder = false;
          if (isStirlingFile(file)) {
            inputFileId = file.fileId;
          } else {
            ownedByFolder = true;
            const newFileId = createFileId();
            const stub: StirlingFileStub = {
              id: newFileId,
              name: file.name,
              type: file.type || 'application/pdf',
              size: file.size,
              lastModified: file.lastModified,
              isLeaf: true,
              originalFileId: newFileId,
              versionNumber: 1,
              toolHistory: [],
              quickKey: createQuickKey(file),
              createdAt: Date.now(),
            };
            await fileStorage.storeStirlingFile(createStirlingFile(file, newFileId), stub);
            inputFileId = newFileId;
          }

          await folderStorage.addFileToFolder(folder.id, inputFileId, {
            status: 'processing',
            name: file.name,
            ownedByFolder,
          });

          try {
            const resultFiles = await executeAutomationSequence(automation, [file], toolRegistry as any);
            const existingRuns = await folderRunStateStorage.getFolderRunState(folder.id);
            const newRuns: SmartFolderRunEntry[] = [...existingRuns];
            const allOutputIds: string[] = [];
            for (const resultFile of resultFiles) {
              const outputId = createFileId();
              allOutputIds.push(outputId);
              const outputStub: StirlingFileStub = {
                id: outputId,
                name: resultFile.name,
                type: resultFile.type || 'application/pdf',
                size: resultFile.size,
                lastModified: resultFile.lastModified,
                isLeaf: true,
                originalFileId: inputFileId,
                versionNumber: 2,
                parentFileId: inputFileId as FileId,
                toolHistory: [],
                quickKey: createQuickKey(resultFile),
                createdAt: Date.now(),
              };
              await fileStorage.storeStirlingFile(createStirlingFile(resultFile, outputId), outputStub);
              newRuns.push({ inputFileId, displayFileId: outputId, status: 'processed' });
            }
            // Only hide the input from "My Files" if the folder owns it (fresh drop from disk).
            // Sidebar files belong to the user and must remain visible after processing.
            if (ownedByFolder) {
              await fileStorage.markFileAsProcessed(inputFileId as FileId);
            }
            await folderStorage.updateFileMetadata(folder.id, inputFileId, {
              status: 'processed',
              processedAt: new Date(),
              displayFileId: allOutputIds[0],
              displayFileIds: allOutputIds,
            });
            await folderRunStateStorage.setFolderRunState(folder.id, newRuns);
          } catch (err: any) {
            const existing = await folderStorage.getFolderData(folder.id);
            const prev = existing?.files[inputFileId];
            await folderStorage.updateFileMetadata(folder.id, inputFileId, {
              status: 'error',
              errorMessage: err?.message,
              failedAttempts: (prev?.failedAttempts ?? 0) + 1,
            });
          }
        }
      } finally {
        setProcessingFolderIds((prev) => {
          const next = new Set(prev);
          next.delete(folder.id);
          return next;
        });
      }
    },
    [toolRegistry]
  );

  const handleDropSidebarFile = useCallback(
    async (folder: SmartFolder, fileIds: string[]) => {
      const results = await Promise.all(fileIds.map(id => fileStorage.getStirlingFile(id as any)));
      const stirlingFiles = results.filter(Boolean) as File[];
      if (stirlingFiles.length > 0) processFiles(folder, stirlingFiles);
    },
    [processFiles]
  );

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteFolder(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{KEYFRAMES}</style>

      {/* Header */}
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
          <Stack gap={2}>
            <Text fw={700} size="lg" style={{ letterSpacing: '-0.02em' }}>
              {t('smartFolders.home.title', 'Watch Folders')}
            </Text>
            <Text size="xs" c="dimmed">
              {t(
                'smartFolders.home.subtitle',
                'Folders that automatically process PDFs with your configured pipeline'
              )}
            </Text>
          </Stack>
          <Button
            leftSection={<AddIcon style={{ fontSize: '1rem' }} />}
            onClick={() => setCreateModalOpen(true)}
          >
            {t('smartFolders.newFolder', 'New folder')}
          </Button>
        </Group>
      </Box>

      {/* Folder list */}
      <ScrollArea style={{ flex: 1 }}>
        <Box p="xl">
          {loading ? (
            <Box
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4rem',
              }}
            >
              <Loader size="md" />
            </Box>
          ) : folders.length === 0 ? (
            <EmptyState onCreate={() => setCreateModalOpen(true)} />
          ) : (
            <Stack gap="md">
              <HowItWorks />

              {/* Add another prompt */}
              <Box
                style={{
                  borderRadius: 'var(--mantine-radius-md)',
                  border: '0.09375rem dashed var(--border-subtle)',
                  padding: '1.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--mantine-color-blue-filled)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; }}
                onClick={() => setCreateModalOpen(true)}
              >
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
                  <FolderPlusIcon style={{ fontSize: '1.375rem', color: 'var(--mantine-color-dimmed)' }} />
                </Box>
                <Text size="sm" fw={500} c="dimmed" mb={2}>
                  {t('smartFolders.home.addAnother', 'Add another Watch Folder')}
                </Text>
                <Text size="xs" c="dimmed">
                  {t('smartFolders.home.addAnotherDesc', 'Automatically process files with a new pipeline')}
                </Text>
              </Box>

              {folders.map((folder) => {
                const status = statuses[folder.id] ?? 'idle';
                const isProcessing =
                  processingFolderIds.has(folder.id) || status === 'processing';
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
            </Stack>
          )}
        </Box>
      </ScrollArea>

      <SmartFolderManagementModal
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
