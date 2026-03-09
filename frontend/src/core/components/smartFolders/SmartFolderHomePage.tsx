import { useState, useCallback, useEffect } from 'react';
import { Box, Text, Stack, Group, ActionIcon, Button, Loader, ScrollArea } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EditIcon from '@mui/icons-material/Edit';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import FolderPlusIcon from '@mui/icons-material/CreateNewFolder';
import { useSmartFolders } from '@app/hooks/useSmartFolders';
import { useFolderRunStatuses } from '@app/hooks/useFolderRunStatuses';
import { SmartFolder, SmartFolderRunEntry } from '@app/types/smartFolders';
import { AutomationConfig } from '@app/types/automation';
import { iconMap } from '@app/components/tools/automate/iconMap';
import { automationStorage } from '@app/services/automationStorage';
import { folderStorage } from '@app/services/folderStorage';
import { folderRunStateStorage } from '@app/services/folderRunStateStorage';
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
}

function FolderCard({
  folder,
  status,
  isProcessing,
  onEdit,
  onDelete,
  onOpen,
  onDropFiles,
}: FolderCardProps) {
  const { t } = useTranslation();
  const [automation, setAutomation] = useState<AutomationConfig | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    automationStorage.getAutomation(folder.automationId).then(setAutomation);

    const loadCount = () =>
      folderStorage.getFolderData(folder.id).then((record) => {
        setFileCount(record ? Object.keys(record.files).length : 0);
      });
    loadCount();

    const unsub = folderStorage.onFolderChange((changedId) => {
      if (changedId === folder.id) loadCount();
    });
    return unsub;
  }, [folder.id, folder.automationId]);

  const FolderIcon = iconMap[folder.icon as keyof typeof iconMap] ?? iconMap.FolderIcon;
  const isActive = isProcessing || status === 'processing';
  const isDone = status === 'done' && !isActive;

  const statusDotColor = isActive ? '#3b82f6' : isDone ? '#22c55e' : '#6b7280';
  const statusDotPulse = isActive;

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    onDropFiles(folder, Array.from(e.dataTransfer.files));
  };

  const ops = automation?.operations ?? [];

  const cardBorderColor = isDragOver
    ? folder.accentColor
    : isHovered
    ? folder.accentColor
    : 'var(--border-subtle)';

  const cardBoxShadow = isDragOver || isHovered
    ? `0 0.25rem 0.75rem ${folder.accentColor}15`
    : 'none';

  return (
    <Box
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        border: `0.0625rem solid ${cardBorderColor}`,
        backgroundColor: isDragOver
          ? `${folder.accentColor}08`
          : 'var(--bg-surface, var(--mantine-color-default))',
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
                    backgroundColor: isActive
                      ? 'rgba(59, 130, 246, 0.12)'
                      : isDone
                      ? 'rgba(34, 197, 94, 0.12)'
                      : 'var(--mantine-color-dimmed-alpha, rgba(120,120,120,0.1))',
                    color: isActive ? '#3b82f6' : isDone ? '#22c55e' : 'var(--mantine-color-dimmed)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {isActive
                    ? t('smartFolders.status.processing', 'Processing')
                    : isDone
                    ? t('smartFolders.status.done', 'Done')
                    : t('smartFolders.status.idle', 'Idle')}
                </Box>
              </Group>

              {/* Right: file count + hover actions */}
              <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                <Box style={{ textAlign: 'right' }}>
                  <Text
                    fw={700}
                    size="sm"
                    style={{ color: folder.accentColor, lineHeight: 1.2 }}
                  >
                    {fileCount}
                  </Text>
                  <Text size="xs" c="dimmed" style={{ fontSize: '0.625rem', lineHeight: 1 }}>
                    {fileCount === 1
                      ? t('smartFolders.home.file', 'file')
                      : t('smartFolders.home.files', 'files')}
                  </Text>
                </Box>

                <Group
                  gap={2}
                  wrap="nowrap"
                  style={{
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 0.15s ease',
                  }}
                >
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    onClick={() => onEdit(folder)}
                    aria-label={t('smartFolders.home.editFolder', 'Edit folder')}
                  >
                    <EditIcon style={{ fontSize: '0.9375rem' }} />
                  </ActionIcon>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    onClick={() => onDelete(folder)}
                    aria-label={t('smartFolders.home.deleteFolder', 'Delete folder')}
                  >
                    <DeleteOutlineIcon style={{ fontSize: '0.9375rem' }} />
                  </ActionIcon>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    style={{ color: folder.accentColor }}
                    onClick={() => onOpen(folder.id)}
                    aria-label={t('smartFolders.home.openFolder', 'Open folder')}
                  >
                    <OpenInNewIcon style={{ fontSize: '0.9375rem' }} />
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

            {/* Drop hint / description row */}
            <Group gap="xs" align="center">
              <UploadFileIcon
                style={{
                  fontSize: '0.75rem',
                  color: isDragOver ? folder.accentColor : 'var(--mantine-color-dimmed)',
                  flexShrink: 0,
                }}
              />
              <Text
                size="xs"
                style={{
                  color: isDragOver ? folder.accentColor : 'var(--mantine-color-dimmed)',
                  fontWeight: isDragOver ? 600 : 400,
                  fontSize: '0.6875rem',
                }}
              >
                {isDragOver
                  ? t('smartFolders.home.dropHere', 'Drop to process')
                  : folder.description || t('smartFolders.home.dragHint', 'Drop PDFs to process')}
              </Text>
            </Group>
          </Box>
        </Group>
      </Box>
    </Box>
  );
}

function HowItWorks() {
  const { t } = useTranslation();

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
      <Group gap="xs" mb="sm">
        <InfoOutlinedIcon style={{ fontSize: '1rem', color: 'var(--mantine-color-blue-filled)' }} />
        <Text fw={600} size="xs">
          {t('smartFolders.howItWorks.title', 'How Watch Folders work')}
        </Text>
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
  const { folders, loading, deleteFolder, refreshFolders } = useSmartFolders();
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
      const pdfs = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
      if (pdfs.length === 0) return;

      setProcessingFolderIds((prev) => new Set([...prev, folder.id]));
      try {
        const automation: AutomationConfig | null = await automationStorage.getAutomation(
          folder.automationId
        );
        if (!automation) return;

        for (const file of pdfs) {
          const inputFileId = `input-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          await folderStorage.addFileToFolder(folder.id, inputFileId, { status: 'processing' });
          try {
            const resultFiles = await executeAutomationSequence(automation, [file], toolRegistry);
            const existingRuns = await folderRunStateStorage.getFolderRunState(folder.id);
            const newRuns: SmartFolderRunEntry[] = [...existingRuns];
            for (const resultFile of resultFiles) {
              const outputId = `output-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              await folderStorage.storeOutputFile(folder.id, outputId, resultFile, resultFile.name);
              newRuns.push({ inputFileId, displayFileId: outputId, status: 'processed' });
            }
            await folderStorage.updateFileMetadata(folder.id, inputFileId, {
              status: 'processed',
              processedAt: new Date(),
            });
            await folderRunStateStorage.setFolderRunState(folder.id, newRuns);
          } catch {
            await folderStorage.updateFileMetadata(folder.id, inputFileId, { status: 'error' });
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
                  />
                );
              })}

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

              <HowItWorks />
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
