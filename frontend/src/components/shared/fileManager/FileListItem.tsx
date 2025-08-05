import React, { useState } from 'react';
import { Card, Group, Box, Center, Text, ActionIcon } from '@mantine/core';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DeleteIcon from '@mui/icons-material/Delete';
import { getFileSize, getFileDate } from '../../../utils/fileUtils';
import { FileListItemProps } from './types';

const FileListItem: React.FC<FileListItemProps> = ({ 
  file, 
  isSelected, 
  isSupported, 
  onSelect, 
  onRemove, 
  onDoubleClick 
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Card 
      p="xs" 
      withBorder 
      style={{ 
        cursor: 'pointer',
        backgroundColor: isSelected ? 'var(--mantine-color-blue-0)' : (isHovered ? 'var(--mantine-color-gray-0)' : undefined),
        border: isSelected ? '1px solid var(--mantine-color-blue-3)' : undefined,
        opacity: isSupported ? 1 : 0.5,
        boxShadow: isHovered && !isSelected ? '0 2px 8px rgba(0, 0, 0, 0.1)' : undefined,
        transition: 'background-color 0.15s ease, box-shadow 0.15s ease'
      }}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Group gap="sm">
        <Box style={{ width: 40, height: 40, flexShrink: 0 }}>
          <Center style={{ width: '100%', height: '100%', backgroundColor: 'var(--mantine-color-gray-1)', borderRadius: 4 }}>
            <PictureAsPdfIcon style={{ fontSize: 20, color: 'var(--mantine-color-gray-6)' }} />
          </Center>
        </Box>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={500} truncate>{file.name}</Text>
          <Text size="xs" c="dimmed">{getFileSize(file)} • {getFileDate(file)}</Text>
        </Box>
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
    </Card>
  );
};

export default FileListItem;