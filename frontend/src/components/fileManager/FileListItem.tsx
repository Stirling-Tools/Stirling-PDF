import React, { useState } from 'react';
import { Group, Box, Text, ActionIcon, Checkbox, Divider } from '@mantine/core';
import DeleteIcon from '@mui/icons-material/Delete';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import { getFileSize, getFileDate } from '../../utils/fileUtils';
import { FileMetadata } from '../../types/file';

interface FileListItemProps {
  file: FileMetadata;
  isSelected: boolean;
  isSupported: boolean;
  isPinned?: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onPin?: () => void;
  onUnpin?: () => void;
  onDoubleClick?: () => void;
  isLast?: boolean;
}

const FileListItem: React.FC<FileListItemProps> = ({ 
  file, 
  isSelected, 
  isSupported,
  isPinned = false,
  onSelect, 
  onRemove,
  onPin,
  onUnpin, 
  onDoubleClick
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <>
      <Box 
        p="sm" 
        style={{ 
          cursor: 'pointer',
          backgroundColor: isSelected ? 'var(--mantine-color-gray-0)' : (isHovered ? 'var(--mantine-color-gray-0)' : 'var(--bg-file-list)'),
          opacity: isSupported ? 1 : 0.5,
          transition: 'background-color 0.15s ease'
        }}
        onClick={onSelect}
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
          
          {/* Pin button - always visible for pinned files, fades in/out on hover for unpinned */}
          {(onPin || onUnpin) && (
            <ActionIcon 
              variant="subtle" 
              c={isPinned ? "blue" : "dimmed"}
              size="md"
              onClick={(e) => { 
                e.stopPropagation(); 
                if (isPinned) {
                  onUnpin?.();
                } else {
                  onPin?.();
                }
              }}
              style={{
                opacity: isPinned ? 1 : (isHovered ? 1 : 0),
                transform: isPinned ? 'scale(1)' : (isHovered ? 'scale(1)' : 'scale(0.8)'),
                transition: 'opacity 0.3s ease, transform 0.3s ease',
                pointerEvents: isPinned ? 'auto' : (isHovered ? 'auto' : 'none')
              }}
            >
              {isPinned ? (
                <PushPinIcon style={{ fontSize: 18 }} />
              ) : (
                <PushPinOutlinedIcon style={{ fontSize: 18 }} />
              )}
            </ActionIcon>
          )}
          
          {/* Delete button - fades in/out on hover */}
          <ActionIcon 
            variant="subtle" 
            c="dimmed"
            size="md"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            style={{
              opacity: isHovered ? 1 : 0,
              transform: isHovered ? 'scale(1)' : 'scale(0.8)',
              transition: 'opacity 0.3s ease, transform 0.3s ease',
              pointerEvents: isHovered ? 'auto' : 'none'
            }}
          >
            <DeleteIcon style={{ fontSize: 20 }} />
          </ActionIcon>
        </Group>
      </Box>
      { <Divider color="var(--mantine-color-gray-3)" />}
    </>
  );
};

export default FileListItem;