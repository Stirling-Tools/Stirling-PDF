import React, { useRef, useCallback, useState, useEffect } from 'react';
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

// Local interface for PageEditor file display
interface PageEditorFile {
  fileId: FileId;
  name: string;
  versionNumber?: number;
  isSelected: boolean;
}

interface FileMenuItemProps {
  file: PageEditorFile;
  index: number;
  colorIndex: number;
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
  colorIndex,
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

  // Keep latest values without re-registering DnD
  const indexRef = useRef(index);
  const fileIdRef = useRef(file.fileId);
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { fileIdRef.current = file.fileId; }, [file.fileId]);

  // NEW: keep latest onReorder without effect re-run
  const onReorderRef = useRef(onReorder);
  useEffect(() => { onReorderRef.current = onReorder; }, [onReorder]);

  // Gesture guard for row click vs drag
  const movedRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    startRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (dx * dx + dy * dy > 25) movedRef.current = true; // ~5px threshold
  };

  const onPointerUp = () => {
    startRef.current = null;
  };

  useEffect(() => {
    const element = itemRef.current;
    if (!element) return;

    const dragCleanup = draggable({
      element,
      getInitialData: () => ({
        type: 'file-item',
        fileId: fileIdRef.current,
        fromIndex: indexRef.current,
      }),
      onDragStart: () => setIsDragging((p) => (p ? p : true)),
      onDrop: () => setIsDragging((p) => (p ? false : p)),
      canDrag: () => true,
    });

    const dropCleanup = dropTargetForElements({
      element,
      getData: () => ({
        type: 'file-item',
        fileId: fileIdRef.current,
        toIndex: indexRef.current,
      }),
      onDragEnter: () => setIsDragOver((p) => (p ? p : true)),
      onDragLeave: () => setIsDragOver((p) => (p ? false : p)),
      onDrop: ({ source }) => {
        setIsDragOver(false);
        const sourceData = source.data as any;
        if (sourceData?.type === 'file-item') {
          const fromIndex = sourceData.fromIndex as number;
          const toIndex = indexRef.current;
          if (fromIndex !== toIndex) {
            onReorderRef.current(fromIndex, toIndex); // use ref, no re-register
          }
        }
      }
    });

    return () => {
      try { dragCleanup(); } catch {}
      try { dropCleanup(); } catch {}
    };
  }, []); // NOTE: no `onReorder` here

  const itemName = file?.name || 'Untitled';
  const fileColorBorder = getFileColorWithOpacity(colorIndex, 1);
  const fileColorBorderHover = getFileColorWithOpacity(colorIndex, 1.0);

  return (
    <div
      ref={itemRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={(e) => {
        e.stopPropagation();
        if (movedRef.current) return; // ignore click after drag
        onToggleSelection(file.fileId);
      }}
      style={{
        padding: '0.75rem 0.75rem',
        marginBottom: '0.5rem',
        cursor: isDragging ? 'grabbing' : 'grab',
        backgroundColor: isDragOver ? 'rgba(59, 130, 246, 0.15)' : (file.isSelected ? 'rgba(0, 0, 0, 0.05)' : 'transparent'),
        borderLeft: `6px solid ${fileColorBorder}`,
        borderTop: isDragOver ? '3px solid rgb(59, 130, 246)' : 'none',
        borderBottom: isDragOver ? '3px solid rgb(59, 130, 246)' : 'none',
        opacity: isDragging ? 0.5 : 1,
        transition: 'opacity 0.2s ease-in-out, background-color 0.15s ease, border 0.15s ease',
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
          (e.currentTarget as HTMLDivElement).style.backgroundColor = file.isSelected ? 'rgba(0, 0, 0, 0.05)' : 'transparent';
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
              checked={file.isSelected}
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
              onClick={(e) => onMoveToTop(e, index)}
              title="Move to top"
            >
              <VerticalAlignTopIcon fontSize="small" />
            </ActionIcon>
            <ActionIcon
              component="div"
              size="sm"
              variant="subtle"
              disabled={isFirst}
              onClick={(e) => onMoveUp(e, index)}
              title="Move up"
            >
              <ArrowUpwardIcon fontSize="small" />
            </ActionIcon>
            <ActionIcon
              component="div"
              size="sm"
              variant="subtle"
              disabled={isLast}
              onClick={(e) => onMoveDown(e, index)}
              title="Move down"
            >
              <ArrowDownwardIcon fontSize="small" />
            </ActionIcon>
            <ActionIcon
              component="div"
              size="sm"
              variant="subtle"
              disabled={isLast}
              onClick={(e) => onMoveToBottom(e, index)}
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
  files: PageEditorFile[];
  onToggleSelection: (fileId: FileId) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  switchingTo?: string | null;
  viewOptionStyle: React.CSSProperties;
  fileColorMap: Map<string, number>;
}

export const PageEditorFileDropdown: React.FC<PageEditorFileDropdownProps> = ({
  displayName,
  files,
  onToggleSelection,
  onReorder,
  switchingTo,
  viewOptionStyle,
  fileColorMap,
}) => {
  const handleMoveUp = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (index > 0) {
      onReorder(index, index - 1);
    }
  };

  const handleMoveDown = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (index < files.length - 1) {
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
    if (index < files.length - 1) {
      onReorder(index, files.length - 1);
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
        {files.map((file, index) => {
          const isFirst = index === 0;
          const isLast = index === files.length - 1;
          const colorIndex = fileColorMap.get(file.fileId as string) ?? 0;

          return (
            <FileMenuItem
              key={file.fileId}
              file={file}
              index={index}
              colorIndex={colorIndex}
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
