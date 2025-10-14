import React, { useRef, useCallback, useState } from 'react';
import { Menu, Loader, Group, Text, Checkbox, ActionIcon } from '@mantine/core';
import EditNoteIcon from '@mui/icons-material/EditNote';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import VerticalAlignTopIcon from '@mui/icons-material/VerticalAlignTop';
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import FitText from './FitText';
import { getFileColorWithOpacity } from '../pageEditor/fileColors';

import { FileId } from '../../types/file';

interface FileMenuItemProps {
  file: { fileId: FileId; name: string; versionNumber?: number };
  index: number;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggleSelection: (fileId: FileId) => void;
  onMoveUp: (e: React.MouseEvent, index: number) => void;
  onMoveDown: (e: React.MouseEvent, index: number) => void;
  onMoveToTop: (e: React.MouseEvent, index: number) => void;
  onMoveToBottom: (e: React.MouseEvent, index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

const FileMenuItem: React.FC<FileMenuItemProps> = ({
  file,
  index,
  isSelected,
  isFirst,
  isLast,
  onToggleSelection,
  onMoveUp,
  onMoveDown,
  onMoveToTop,
  onMoveToBottom,
  onReorder,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  const itemElementRef = useCallback((element: HTMLDivElement | null) => {
    if (element) {
      itemRef.current = element;

      const dragCleanup = draggable({
        element,
        getInitialData: () => ({
          type: 'file-item',
          fileId: file.fileId,
          fromIndex: index,
        }),
        onDragStart: () => {
          setIsDragging(true);
        },
        onDrop: () => {
          setIsDragging(false);
        },
        canDrag: () => true,
      });

      const dropCleanup = dropTargetForElements({
        element,
        getData: () => ({
          type: 'file-item',
          fileId: file.fileId,
          toIndex: index,
        }),
        onDragEnter: () => {
          setIsDragOver(true);
        },
        onDragLeave: () => {
          setIsDragOver(false);
        },
        onDrop: ({ source }) => {
          setIsDragOver(false);
          const sourceData = source.data;
          if (sourceData.type === 'file-item') {
            const fromIndex = sourceData.fromIndex as number;
            if (fromIndex !== index) {
              onReorder(fromIndex, index);
            }
          }
        }
      });

      (element as any).__dragCleanup = () => {
        dragCleanup();
        dropCleanup();
      };
    } else {
      if (itemRef.current && (itemRef.current as any).__dragCleanup) {
        (itemRef.current as any).__dragCleanup();
      }
    }
  }, [file.fileId, index, onReorder]);

  const itemName = file?.name || 'Untitled';
  const fileColorBorder = getFileColorWithOpacity(index, 1);
  const fileColorBorderHover = getFileColorWithOpacity(index, 1.0);

  return (
    <div
      ref={itemElementRef}
      onClick={(e) => {
        e.stopPropagation();
        onToggleSelection(file.fileId);
      }}
      style={{
        padding: '0.75rem 0.75rem',
        marginBottom: '0.5rem',
        cursor: isDragging ? 'grabbing' : 'grab',
        backgroundColor: isSelected ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
        borderLeft: `6px solid ${fileColorBorder}`,
        borderTop: isDragOver ? '2px solid rgba(0, 0, 0, 0.5)' : 'none',
        borderBottom: isDragOver ? '2px solid rgba(0, 0, 0, 0.5)' : 'none',
        opacity: isDragging ? 0.5 : 1,
        transition: 'opacity 0.2s ease-in-out, background-color 0.15s ease, border-color 0.15s ease',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isDragging) {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
          (e.currentTarget as HTMLDivElement).style.borderLeftColor = fileColorBorderHover;
        }
      }}
      onMouseLeave={(e) => {
        if (!isDragging) {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = isSelected ? 'rgba(0, 0, 0, 0.05)' : 'transparent';
          (e.currentTarget as HTMLDivElement).style.borderLeftColor = fileColorBorder;
        }
      }}
    >
        <Group gap="xs" style={{ width: '100%', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
            <div
              style={{
                cursor: 'grab',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--mantine-color-dimmed)',
              }}
            >
              <DragIndicatorIcon fontSize="small" />
            </div>
            <Checkbox
              checked={isSelected}
              onChange={() => onToggleSelection(file.fileId)}
              onClick={(e) => e.stopPropagation()}
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
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
            <ActionIcon
              component="div"
              size="sm"
              variant="subtle"
              disabled={isFirst}
              onClick={onMoveToTop}
              title="Move to top"
            >
              <VerticalAlignTopIcon fontSize="small" />
            </ActionIcon>
            <ActionIcon
              component="div"
              size="sm"
              variant="subtle"
              disabled={isFirst}
              onClick={onMoveUp}
              title="Move up"
            >
              <ArrowUpwardIcon fontSize="small" />
            </ActionIcon>
            <ActionIcon
              component="div"
              size="sm"
              variant="subtle"
              disabled={isLast}
              onClick={onMoveDown}
              title="Move down"
            >
              <ArrowDownwardIcon fontSize="small" />
            </ActionIcon>
            <ActionIcon
              component="div"
              size="sm"
              variant="subtle"
              disabled={isLast}
              onClick={onMoveToBottom}
              title="Move to bottom"
            >
              <VerticalAlignBottomIcon fontSize="small" />
            </ActionIcon>
          </div>
        </Group>
    </div>
  );
};

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

  const handleMoveToTop = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (index > 0) {
      onReorder(index, 0);
    }
  };

  const handleMoveToBottom = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (index < allFiles.length - 1) {
      onReorder(index, allFiles.length - 1);
    }
  };

  return (
    <Menu trigger="click" position="bottom" width="40rem">
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
        maxHeight: '80vh',
        overflowY: 'auto'
      }}>
        {allFiles.map((file, index) => {
          const isSelected = selectedFileIds.has(file.fileId);
          const isFirst = index === 0;
          const isLast = index === allFiles.length - 1;

          return (
            <FileMenuItem
              key={file.fileId}
              file={file}
              index={index}
              isSelected={isSelected}
              isFirst={isFirst}
              isLast={isLast}
              onToggleSelection={onToggleSelection}
              onMoveUp={(e) => handleMoveUp(e, index)}
              onMoveDown={(e) => handleMoveDown(e, index)}
              onMoveToTop={(e) => handleMoveToTop(e, index)}
              onMoveToBottom={(e) => handleMoveToBottom(e, index)}
              onReorder={onReorder}
            />
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
};
