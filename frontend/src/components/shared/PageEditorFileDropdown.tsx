import React from 'react';
import { Menu, Loader, Group, Text, Checkbox, ActionIcon } from '@mantine/core';
import EditNoteIcon from '@mui/icons-material/EditNote';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import FitText from './FitText';

import { FileId } from '../../types/file';

interface PageEditorFileDropdownProps {
  displayName: string;
  allFiles: Array<{ fileId: FileId; name: string; versionNumber?: number }>;
  selectedFileIds: Set<FileId>;
  onToggleSelection: (fileId: FileId) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  switchingTo?: string | null;
  viewOptionStyle: React.CSSProperties;
}

export const PageEditorFileDropdown: React.FC<PageEditorFileDropdownProps> = ({
  displayName,
  allFiles,
  selectedFileIds,
  onToggleSelection,
  onReorder,
  switchingTo,
  viewOptionStyle,
}) => {
  const handleCheckboxClick = (e: React.MouseEvent, fileId: FileId) => {
    e.stopPropagation();
    onToggleSelection(fileId);
  };

  const handleMoveUp = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (index > 0) {
      onReorder(index, index - 1);
    }
  };

  const handleMoveDown = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (index < allFiles.length - 1) {
      onReorder(index, index + 1);
    }
  };

  return (
    <Menu trigger="click" position="bottom" width="30rem">
      <Menu.Target>
        <div style={{...viewOptionStyle, cursor: 'pointer'}}>
          {switchingTo === "pageEditor" ? (
            <Loader size="xs" />
          ) : (
            <EditNoteIcon fontSize="small" />
          )}
          <FitText text={displayName} fontSize={14} minimumFontScale={0.6} />
          <KeyboardArrowDownIcon fontSize="small" />
        </div>
      </Menu.Target>
      <Menu.Dropdown style={{
        backgroundColor: 'var(--right-rail-bg)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        maxHeight: '50vh',
        overflowY: 'auto'
      }}>
        {allFiles.map((file, index) => {
          const itemName = file?.name || 'Untitled';
          const isSelected = selectedFileIds.has(file.fileId);
          const isFirst = index === 0;
          const isLast = index === allFiles.length - 1;

          return (
            <Menu.Item
              key={file.fileId}
              onClick={(e) => e.stopPropagation()}
              style={{
                justifyContent: 'flex-start',
                cursor: 'default',
                backgroundColor: isSelected ? 'var(--bg-hover)' : undefined,
              }}
            >
              <Group gap="xs" style={{ width: '100%', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                  <Checkbox
                    checked={isSelected}
                    onChange={() => {}}
                    onClick={(e) => handleCheckboxClick(e, file.fileId)}
                    size="sm"
                  />
                  <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                    <FitText text={itemName} fontSize={14} minimumFontScale={0.7} />
                  </div>
                  {file.versionNumber && file.versionNumber > 1 && (
                    <Text size="xs" c="dimmed">
                      v{file.versionNumber}
                    </Text>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    disabled={isFirst}
                    onClick={(e) => handleMoveUp(e, index)}
                    title="Move up"
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </ActionIcon>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    disabled={isLast}
                    onClick={(e) => handleMoveDown(e, index)}
                    title="Move down"
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </ActionIcon>
                </div>
              </Group>
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
};
