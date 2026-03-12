import { useState } from 'react';
import { Box, Button, Text, ActionIcon, Group, Loader } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { SmartFolder } from '@app/types/smartFolders';
import { FolderRunStatus } from '@app/hooks/useFolderRunStatuses';
import { iconMap } from '@app/components/tools/automate/iconMap';

interface SmartFolderCardProps {
  folder: SmartFolder;
  isActive: boolean;
  status: FolderRunStatus;
  onSelect: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onFileDrop?: (fileIds: string[]) => void;
}

export function SmartFolderCard({ folder, isActive, status, onSelect, onEdit, onDelete, onFileDrop }: SmartFolderCardProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const IconComponent = iconMap[folder.icon as keyof typeof iconMap] || iconMap.FolderIcon;

  const handleDragOver = (e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (!types.includes('watchfolderfileid') && !types.includes('watchfolderfileids')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const multiRaw = e.dataTransfer.getData('watchFolderFileIds');
    if (multiRaw) {
      try {
        const ids: string[] = JSON.parse(multiRaw);
        if (ids.length > 0 && onFileDrop) onFileDrop(ids);
        return;
      } catch { /* fall through */ }
    }
    const fileId = e.dataTransfer.getData('watchFolderFileId');
    if (fileId && onFileDrop) onFileDrop([fileId]);
  };

  return (
    <Box
      className="tool-button-container"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={isDragOver ? { backgroundColor: `${folder.accentColor}18`, borderRadius: 'var(--mantine-radius-sm)' } : undefined}
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
              <ActionIcon
                size="xs"
                variant="subtle"
                onClick={onEdit}
                aria-label={t('smartFolders.card.edit', 'Edit folder')}
              >
                <EditIcon style={{ fontSize: 11 }} />
              </ActionIcon>
              {!folder.isDefault && (
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={onDelete}
                  aria-label={t('smartFolders.card.delete', 'Delete folder')}
                >
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
        onClick={onSelect}
      >
        <Text size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {folder.name}
        </Text>
      </Button>
    </Box>
  );
}
