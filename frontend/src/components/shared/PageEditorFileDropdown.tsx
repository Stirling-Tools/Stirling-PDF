import React, { useRef, useState, useEffect } from 'react';
import { Menu, Loader, Group, Text, Checkbox } from '@mantine/core';
import { LocalIcon } from '../shared/LocalIcon';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import AddIcon from '@mui/icons-material/Add';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import FitText from './FitText';
import { getFileColorWithOpacity } from '../pageEditor/fileColors';
import { useFilesModalContext } from '../../contexts/FilesModalContext';

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
  onToggleSelection: (fileId: FileId) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

const FileMenuItem: React.FC<FileMenuItemProps> = ({
  file,
  index,
  colorIndex,
  onToggleSelection,
  onReorder,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropPosition, setDropPosition] = useState<'above' | 'below'>('below');
  const itemRef = useRef<HTMLDivElement>(null);

  // Keep latest values without re-registering DnD
  const indexRef = useRef(index);
  const fileIdRef = useRef(file.fileId);
  const dropPositionRef = useRef<'above' | 'below'>('below');
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { fileIdRef.current = file.fileId; }, [file.fileId]);
  useEffect(() => { dropPositionRef.current = dropPosition; }, [dropPosition]);

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
      onDragLeave: () => {
        setIsDragOver((p) => (p ? false : p));
        setDropPosition('below');
      },
      onDrag: ({ source, self }) => {
        // Determine drop position based on cursor location
        const element = itemRef.current;
        if (!element) return;

        const rect = element.getBoundingClientRect();
        const clientY = (source as any).element?.getBoundingClientRect().top || 0;
        const midpoint = rect.top + rect.height / 2;

        setDropPosition(clientY < midpoint ? 'below' : 'above');
      },
      onDrop: ({ source }) => {
        setIsDragOver(false);
        const dropPos = dropPositionRef.current;
        setDropPosition('below');
        const sourceData = source.data as any;
        if (sourceData?.type === 'file-item') {
          const fromIndex = sourceData.fromIndex as number;
          let toIndex = indexRef.current;

          // Adjust toIndex based on drop position
          // If dropping below and dragging from above, or dropping above and dragging from below
          if (dropPos === 'below' && fromIndex < toIndex) {
            // Dragging down, drop after target - no adjustment needed
          } else if (dropPos === 'above' && fromIndex > toIndex) {
            // Dragging up, drop before target - no adjustment needed
          } else if (dropPos === 'below' && fromIndex > toIndex) {
            // Dragging up but want below target
            toIndex = toIndex + 1;
          } else if (dropPos === 'above' && fromIndex < toIndex) {
            // Dragging down but want above target
            toIndex = toIndex - 1;
          }

          if (fromIndex !== toIndex) {
            onReorderRef.current(fromIndex, toIndex);
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
      style={{
        position: 'relative',
        marginBottom: '0.5rem',
      }}
    >
      {/* Drop indicator line */}
      {isDragOver && (
        <div
          style={{
            position: 'absolute',
            ...(dropPosition === 'above' ? { top: '-2px' } : { bottom: '-2px' }),
            left: 0,
            right: 0,
            height: '4px',
            backgroundColor: 'rgb(59, 130, 246)',
            borderRadius: '2px',
            zIndex: 10,
          }}
        />
      )}
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
          cursor: isDragging ? 'grabbing' : 'grab',
          backgroundColor: file.isSelected ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
          borderLeft: `6px solid ${fileColorBorder}`,
          opacity: isDragging ? 0.5 : 1,
          transition: 'opacity 0.2s ease-in-out, background-color 0.15s ease',
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
        <Group gap="xs" style={{ width: '100%' }}>
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
        </Group>
      </div>
    </div>
  );
};

interface PageEditorFileDropdownProps {
  files: PageEditorFile[];
  onToggleSelection: (fileId: FileId) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  switchingTo?: string | null;
  viewOptionStyle: React.CSSProperties;
  fileColorMap: Map<string, number>;
  selectedCount: number;
  totalCount: number;
}

export const PageEditorFileDropdown: React.FC<PageEditorFileDropdownProps> = ({
  files,
  onToggleSelection,
  onReorder,
  switchingTo,
  viewOptionStyle,
  fileColorMap,
  selectedCount,
  totalCount,
}) => {
  const { openFilesModal } = useFilesModalContext();

  return (
    <Menu trigger="click" position="bottom" width="40rem">
      <Menu.Target>
        <div style={{...viewOptionStyle, cursor: 'pointer'}}>
          {switchingTo === "pageEditor" ? (
            <Loader size="xs" />
          ) : (
            <LocalIcon icon="dashboard-customize-rounded" width="1.4rem" height="1.4rem" />
          )}
          <span>{selectedCount}/{totalCount} files selected</span>
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
          const colorIndex = fileColorMap.get(file.fileId as string) ?? 0;

          return (
            <FileMenuItem
              key={file.fileId}
              file={file}
              index={index}
              colorIndex={colorIndex}
              onToggleSelection={onToggleSelection}
              onReorder={onReorder}
            />
          );
        })}

        {/* Add File Button */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            openFilesModal();
          }}
          style={{
            padding: '0.75rem 0.75rem',
            marginTop: '0.5rem',
            cursor: 'pointer',
            backgroundColor: 'transparent',
            borderTop: '1px solid var(--border-subtle)',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(59, 130, 246, 0.25)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
          }}
        >
          <Group gap="xs" style={{ width: '100%' }}>
            <AddIcon fontSize="small" style={{ color: 'var(--mantine-color-text)' }} />
            <Text size="sm" fw={500} style={{ color: 'var(--mantine-color-text)' }}>
              Add File
            </Text>
          </Group>
        </div>
      </Menu.Dropdown>
    </Menu>
  );
};
