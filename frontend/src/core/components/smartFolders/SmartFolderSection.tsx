import { useState, useEffect } from 'react';
import { Box, Button, Text, Stack, ActionIcon, Group, Loader } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useSmartFolders } from '@app/hooks/useSmartFolders';
import { useFolderRunStatuses } from '@app/hooks/useFolderRunStatuses';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useNavigationActions } from '@app/contexts/NavigationContext';
import { SmartFolderManagementModal } from '@app/components/smartFolders/SmartFolderManagementModal';
import { DeleteFolderConfirmModal } from '@app/components/smartFolders/DeleteFolderConfirmModal';
import { SmartFolderWorkbenchView } from '@app/components/smartFolders/SmartFolderWorkbenchView';
import { SmartFolder } from '@app/types/smartFolders';
import { AutomationConfig } from '@app/types/automation';
import { automationStorage } from '@app/services/automationStorage';
import { seedDefaultFolders } from '@app/data/smartFolderPresets';
import { iconMap } from '@app/components/tools/automate/iconMap';

const SMART_FOLDER_VIEW_ID = 'smartFolder';
const SMART_FOLDER_WORKBENCH_ID = 'custom:smartFolder' as const;

export function SmartFolderSection() {
  const { t } = useTranslation();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editFolder, setEditFolder] = useState<SmartFolder | null>(null);
  const [editAutomation, setEditAutomation] = useState<AutomationConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SmartFolder | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { folders, loading, deleteFolder, refreshFolders } = useSmartFolders();
  const statuses = useFolderRunStatuses(folders);

  const { registerCustomWorkbenchView, unregisterCustomWorkbenchView, setCustomWorkbenchViewData } = useToolWorkflow();
  const { actions } = useNavigationActions();

  useEffect(() => {
    seedDefaultFolders();
  }, []);

  useEffect(() => {
    registerCustomWorkbenchView({
      id: SMART_FOLDER_VIEW_ID,
      workbenchId: SMART_FOLDER_WORKBENCH_ID,
      label: t('smartFolders.title', 'Smart Folders'),
      component: SmartFolderWorkbenchView,
    });
    return () => unregisterCustomWorkbenchView(SMART_FOLDER_VIEW_ID);
  }, [registerCustomWorkbenchView, unregisterCustomWorkbenchView, t]);

  const handleFolderClick = (folderId: string) => {
    setActiveFolderId(folderId);
    setCustomWorkbenchViewData(SMART_FOLDER_VIEW_ID, { folderId });
    actions.setWorkbench(SMART_FOLDER_WORKBENCH_ID);
  };

  const handleEditFolder = async (e: React.MouseEvent, folder: SmartFolder) => {
    e.stopPropagation();
    setEditFolder(folder);
    const automation = await automationStorage.getAutomation(folder.automationId);
    setEditAutomation(automation);
    setCreateModalOpen(true);
  };

  const handleDeleteClick = (e: React.MouseEvent, folder: SmartFolder) => {
    e.stopPropagation();
    setDeleteTarget(folder);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (activeFolderId === deleteTarget.id) {
      setActiveFolderId(null);
      actions.setWorkbench('fileEditor');
    }
    await deleteFolder(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleModalClose = () => {
    setCreateModalOpen(false);
    setEditFolder(null);
    setEditAutomation(null);
  };

  return (
    <Box
      style={{
        borderTop: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-toolbar)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Section header — matches .tool-subcategory-row style */}
      <Box px="sm" pt="xs" pb="2px" style={{ flexShrink: 0 }}>
        <Box className="tool-subcategory-row">
          <Text className="tool-subcategory-row-title">
            {t('smartFolders.title', 'Smart Folders')}
          </Text>
          <Box className="tool-subcategory-row-rule" />
        </Box>
      </Box>

      {/* Scrollable folder list */}
      <Box className="tool-picker-scrollable" style={{ flex: 1, minHeight: 0 }}>
        <Stack gap={0} pb="xs">
          {!loading && folders.length === 0 && (
            <Text size="xs" c="dimmed" ta="center" py="sm" px="sm">
              {t('smartFolders.noFolders', 'No smart folders yet')}
            </Text>
          )}

          {folders.map((folder) => {
            const IconComponent = iconMap[folder.icon as keyof typeof iconMap] || iconMap.FolderIcon;
            const status = statuses[folder.id] ?? 'idle';
            const isActive = activeFolderId === folder.id;
            const isHovered = hoveredId === folder.id;

            return (
              <Box
                key={folder.id}
                className="tool-button-container"
                onMouseEnter={() => setHoveredId(folder.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <Button
                  variant={isActive ? 'light' : 'subtle'}
                  className="tool-button"
                  fullWidth
                  justify="flex-start"
                  px="sm"
                  leftSection={
                    <Box
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        backgroundColor: `${folder.accentColor}22`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <IconComponent style={{ fontSize: 11, color: folder.accentColor }} />
                    </Box>
                  }
                  rightSection={
                    isHovered ? (
                      <Group gap={2} onClick={(e) => e.stopPropagation()}>
                        <ActionIcon size="xs" variant="subtle" onClick={(e) => handleEditFolder(e, folder)}>
                          <EditIcon style={{ fontSize: 11 }} />
                        </ActionIcon>
                        {!folder.isDefault && (
                          <ActionIcon size="xs" variant="subtle" color="red" onClick={(e) => handleDeleteClick(e, folder)}>
                            <DeleteIcon style={{ fontSize: 11 }} />
                          </ActionIcon>
                        )}
                      </Group>
                    ) : status === 'processing' ? (
                      <Loader size={10} color={folder.accentColor} />
                    ) : status === 'done' ? (
                      <CheckCircleIcon style={{ fontSize: 12, color: 'var(--mantine-color-teal-6)' }} />
                    ) : null
                  }
                  onClick={() => handleFolderClick(folder.id)}
                >
                  <Text size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {folder.name}
                  </Text>
                </Button>
              </Box>
            );
          })}

          {/* New folder button */}
          <Button
            variant="subtle"
            className="tool-button"
            fullWidth
            justify="flex-start"
            px="sm"
            leftSection={<AddIcon style={{ fontSize: 14, color: 'var(--mantine-color-gray-5)' }} />}
            onClick={() => setCreateModalOpen(true)}
          >
            <Text size="sm" c="dimmed">{t('smartFolders.newFolder', 'New folder')}</Text>
          </Button>
        </Stack>
      </Box>

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
