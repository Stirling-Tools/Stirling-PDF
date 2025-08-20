import React, { useState } from 'react';
import { Group, Box, Text, ActionIcon, Checkbox, Divider, Menu } from '@mantine/core';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import { useTranslation } from 'react-i18next';
import { getFileSize, getFileDate } from '../../utils/fileUtils';
import { FileWithUrl } from '../../types/file';

interface FileListItemProps {
  file: FileWithUrl;
  isSelected: boolean;
  isSupported: boolean;
  onSelect: (shiftKey?: boolean) => void;
  onRemove: () => void;
  onDownload?: () => void;
  onDoubleClick?: () => void;
  isLast?: boolean;
}

const FileListItem: React.FC<FileListItemProps> = ({
  file,
  isSelected,
  isSupported,
  onSelect,
  onRemove,
  onDownload,
  onDoubleClick
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { t } = useTranslation();

  // Keep item in hovered state if menu is open
  const shouldShowHovered = isHovered || isMenuOpen;

  return (
    <>
      <Box
        p="sm"
        style={{
          cursor: 'pointer',
          backgroundColor: isSelected ? 'var(--mantine-color-gray-0)' : (shouldShowHovered ? 'var(--mantine-color-gray-0)' : 'var(--bg-file-list)'),
          opacity: isSupported ? 1 : 0.5,
          transition: 'background-color 0.15s ease',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none'
        }}
        onClick={(e) => onSelect(e.shiftKey)}
        onDoubleClick={onDoubleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Group gap="sm">
          <Box>
            <Checkbox
              checked={isSelected}
              onChange={() => {}} // Handled by parent onClick
              size="sm"
              pl="sm"
              pr="xs"
              styles={{
                input: {
                  cursor: 'pointer'
                }
              }}
            />
          </Box>

          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" fw={500} truncate>{file.name}</Text>
            <Text size="xs" c="dimmed">{getFileSize(file)} • {getFileDate(file)}</Text>
          </Box>

          {/* Three dots menu - fades in/out on hover */}
          <Menu
            position="bottom-end"
            withinPortal
            onOpen={() => setIsMenuOpen(true)}
            onClose={() => setIsMenuOpen(false)}
          >
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                c="dimmed"
                size="md"
                onClick={(e) => e.stopPropagation()}
                style={{
                  opacity: shouldShowHovered ? 1 : 0,
                  transform: shouldShowHovered ? 'scale(1)' : 'scale(0.8)',
                  transition: 'opacity 0.3s ease, transform 0.3s ease',
                  pointerEvents: shouldShowHovered ? 'auto' : 'none'
                }}
              >
                <MoreVertIcon style={{ fontSize: 20 }} />
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
              {onDownload && (
                <Menu.Item
                  leftSection={<DownloadIcon style={{ fontSize: 16 }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload();
                  }}
                >
                  {t('fileManager.download', 'Download')}
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={<DeleteIcon style={{ fontSize: 16 }} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
              >
                {t('fileManager.delete', 'Delete')}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Box>
      { <Divider color="var(--mantine-color-gray-3)" />}
    </>
  );
};

export default FileListItem;
