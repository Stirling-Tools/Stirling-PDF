import { useState, useCallback, useEffect } from 'react';
import { Box, Text, Stack, Group, ActionIcon, Badge, Button, Loader, ScrollArea } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EditIcon from '@mui/icons-material/Edit';
import UploadFileIcon from '@mui/icons-material/UploadFile';
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
import { SMART_FOLDER_VIEW_ID, SMART_FOLDER_WORKBENCH_ID } from '@app/components/smartFolders/SmartFoldersRegistration';

// Humanise an operation key like "compress-pdf" → "Compress PDF"
function humaniseOp(op: string): string {
  return op
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface FolderCardProps {
  folder: SmartFolder;
  status: 'idle' | 'processing' | 'done';
  isProcessing: boolean;
  onEdit: (folder: SmartFolder) => void;
  onOpen: (folderId: string) => void;
  onDropFiles: (folder: SmartFolder, files: File[]) => void;
}

function FolderCard({ folder, status, isProcessing, onEdit, onOpen, onDropFiles }: FolderCardProps) {
  const { t } = useTranslation();
  const [automation, setAutomation] = useState<AutomationConfig | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    onDropFiles(folder, Array.from(e.dataTransfer.files));
  };

  return (
    <Box
      style={{
        border: `2px solid ${isDragOver ? folder.accentColor : 'var(--border-subtle)'}`,
        borderRadius: 'var(--mantine-radius-md)',
        padding: '0.875rem 1rem',
        backgroundColor: isDragOver
          ? `${folder.accentColor}15`
          : 'var(--bg-surface, var(--mantine-color-default))',
        transition: 'border-color 0.15s, background-color 0.15s',
        position: 'relative',
        cursor: 'default',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Group align="flex-start" wrap="nowrap" gap="sm">
        {/* Icon circle */}
        <Box
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            backgroundColor: `${folder.accentColor}22`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          <FolderIcon style={{ fontSize: 20, color: folder.accentColor }} />
        </Box>

        {/* Main content */}
        <Stack gap={5} style={{ flex: 1, minWidth: 0 }}>
          {/* Top row: name + badges + actions */}
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
              <Text fw={600} size="sm" lineClamp={1} style={{ minWidth: 0 }}>
                {folder.name}
              </Text>
              {fileCount > 0 && (
                <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
                  {fileCount} {fileCount === 1
                    ? t('smartFolders.home.file', 'file')
                    : t('smartFolders.home.files', 'files')}
                </Badge>
              )}
              {isProcessing && (
                <Badge size="xs" color="blue" variant="dot" style={{ flexShrink: 0 }}>
                  {t('smartFolders.status.processing', 'Processing')}
                </Badge>
              )}
              {status === 'done' && !isProcessing && (
                <Badge size="xs" color="teal" variant="dot" style={{ flexShrink: 0 }}>
                  {t('smartFolders.status.done', 'Done')}
                </Badge>
              )}
            </Group>

            <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
              <ActionIcon
                size="sm"
                variant="subtle"
                onClick={(e) => { e.stopPropagation(); onEdit(folder); }}
                aria-label={t('smartFolders.home.editFolder', 'Edit folder')}
              >
                <EditIcon style={{ fontSize: 14 }} />
              </ActionIcon>
              <ActionIcon
                size="sm"
                variant="subtle"
                onClick={(e) => { e.stopPropagation(); onOpen(folder.id); }}
                aria-label={t('smartFolders.home.openFolder', 'Open folder')}
              >
                <OpenInNewIcon style={{ fontSize: 14 }} />
              </ActionIcon>
            </Group>
          </Group>

          {/* Description */}
          {folder.description && (
            <Text size="xs" c="dimmed" lineClamp={1}>
              {folder.description}
            </Text>
          )}

          {/* Operation pills */}
          {automation && automation.operations.length > 0 && (
            <Group gap={4} wrap="wrap">
              {automation.operations.map((op, i) => (
                <Badge
                  key={i}
                  size="xs"
                  variant="outline"
                  style={{ borderColor: folder.accentColor, color: folder.accentColor }}
                >
                  {humaniseOp(op.operation)}
                </Badge>
              ))}
            </Group>
          )}
        </Stack>
      </Group>

      {/* Drop overlay */}
      {isDragOver && (
        <Box
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'var(--mantine-radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${folder.accentColor}20`,
            pointerEvents: 'none',
          }}
        >
          <Group gap="xs">
            <UploadFileIcon style={{ fontSize: 18, color: folder.accentColor }} />
            <Text fw={700} size="sm" style={{ color: folder.accentColor }}>
              {t('smartFolders.home.dropHere', 'Drop to process')}
            </Text>
          </Group>
        </Box>
      )}
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

  const navigateToFolder = useCallback((folderId: string) => {
    setCustomWorkbenchViewData(SMART_FOLDER_VIEW_ID, { folderId });
    actions.setWorkbench(SMART_FOLDER_WORKBENCH_ID);
  }, [setCustomWorkbenchViewData, actions]);

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

  const processFiles = useCallback(async (folder: SmartFolder, files: File[]) => {
    const pdfs = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length === 0) return;

    setProcessingFolderIds(prev => new Set([...prev, folder.id]));
    try {
      const automation: AutomationConfig | null = await automationStorage.getAutomation(folder.automationId);
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
      setProcessingFolderIds(prev => {
        const next = new Set(prev);
        next.delete(folder.id);
        return next;
      });
    }
  }, [toolRegistry]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteFolder(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box
        px="md"
        py="sm"
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-toolbar)',
          flexShrink: 0,
        }}
      >
        <Group justify="space-between" align="center">
          <Text fw={600} size="sm">{t('smartFolders.home.title', 'Watch Folders')}</Text>
          <Button
            size="xs"
            variant="light"
            leftSection={<AddIcon style={{ fontSize: 14 }} />}
            onClick={() => setCreateModalOpen(true)}
          >
            {t('smartFolders.newFolder', 'New folder')}
          </Button>
        </Group>
      </Box>

      {/* Folder list */}
      <ScrollArea style={{ flex: 1 }}>
        <Box p="sm">
          {loading ? (
            <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
              <Loader size="sm" />
            </Box>
          ) : folders.length === 0 ? (
            <Box style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '1rem' }}>
              <Text c="dimmed" ta="center" size="sm">
                {t('smartFolders.home.empty', 'No watch folders yet')}
              </Text>
              <Button
                variant="light"
                size="xs"
                leftSection={<AddIcon style={{ fontSize: 14 }} />}
                onClick={() => setCreateModalOpen(true)}
              >
                {t('smartFolders.home.create', 'Create your first folder')}
              </Button>
            </Box>
          ) : (
            <Stack gap="sm">
              {folders.map((folder) => {
                const status = statuses[folder.id] ?? 'idle';
                const isProcessing = processingFolderIds.has(folder.id) || status === 'processing';
                return (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    status={status}
                    isProcessing={isProcessing}
                    onEdit={handleEdit}
                    onOpen={navigateToFolder}
                    onDropFiles={processFiles}
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
