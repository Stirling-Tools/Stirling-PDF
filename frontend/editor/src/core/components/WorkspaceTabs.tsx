import React, { useState, useCallback } from 'react';
import { ActionIcon, Tooltip, Stack, ScrollArea, Box, Text, Group, Badge } from '@mantine/core';
import { IconX, IconFile, IconPlus, IconGripVertical } from '@tabler/icons-react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import classes from './WorkspaceTabs.module.css';

interface WorkspaceTabsProps {
  onFileSelect?: (fileId: string) => void;
}

export const WorkspaceTabs: React.FC<WorkspaceTabsProps> = ({ onFileSelect }) => {
  const { files, activeFileId, setActiveFile, closeFile, reorderFiles } = useWorkspace();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleFileClick = useCallback((fileId: string) => {
    setActiveFile(fileId);
    onFileSelect?.(fileId);
  }, [setActiveFile, onFileSelect]);

  const handleClose = useCallback((e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    closeFile(fileId);
  }, [closeFile]);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    reorderFiles(draggedIndex, index);
    setDraggedIndex(index);
  }, [draggedIndex, reorderFiles]);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);

  if (files.length === 0) {
    return (
      <Box className={classes.emptyWorkspace}>
        <Text size="sm" c="dimmed">No files open</Text>
      </Box>
    );
  }

  return (
    <ScrollArea className={classes.tabsScrollArea} type="scroll">
      <Stack gap="xs" p="xs">
        {files.map((file, index) => (
          <Group
            key={file.id}
            className={`${classes.tabItem} ${file.isActive ? classes.activeTab : ''}`}
            onClick={() => handleFileClick(file.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            wrap="nowrap"
          >
            <ActionIcon variant="transparent" size="sm" className={classes.dragHandle}>
              <IconGripVertical size={16} />
            </ActionIcon>
            
            <IconFile size={18} className={classes.fileIcon} />
            
            <Box className={classes.fileName}>
              <Text size="sm" lineClamp={1}>{file.name}</Text>
              {file.lastModified && (
                <Text size="xs" c="dimmed">
                  {new Date(file.lastModified).toLocaleTimeString()}
                </Text>
              )}
            </Box>

            {file.isActive && (
              <Badge size="xs" variant="light" color="blue">
                Active
              </Badge>
            )}

            <Tooltip label="Close file">
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={(e) => handleClose(e, file.id)}
                className={classes.closeButton}
              >
                <IconX size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        ))}
      </Stack>
    </ScrollArea>
  );
};
