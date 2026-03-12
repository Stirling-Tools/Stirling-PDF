import { useState, useRef, useCallback, useEffect } from 'react';
import { Box, Text, ActionIcon, Group, Popover, Stack, Button, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import { StirlingFileStub } from '@app/types/fileContext';
import { useFolderMembership } from '@app/hooks/useFolderMembership';
import { useAllSmartFolders } from '@app/hooks/useAllSmartFolders';
import { iconMap } from '@app/components/tools/automate/iconMap';

interface WatchFolderFileListProps {
  files: StirlingFileStub[];
  /** Currently open folder id, or null if on home page */
  folderId: string | null;
  onSendToFolder: (fileId: string, folderId: string) => void;
  onNavigateToFolder: (folderId: string) => void;
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function FileRow({
  file,
  index,
  currentFolderId,
  memberFolderIds,
  isSelected,
  onToggleSelect,
  onSendToFolder,
  onNavigateToFolder,
  onDragStart,
}: {
  file: StirlingFileStub;
  index: number;
  currentFolderId: string | null;
  memberFolderIds: string[];
  isSelected: boolean;
  onToggleSelect: (idx: number, shiftKey: boolean) => void;
  onSendToFolder: (fileId: string, folderId: string) => void;
  onNavigateToFolder: (folderId: string) => void;
  onDragStart: (e: React.DragEvent, file: StirlingFileStub) => void;
}) {
  const { t } = useTranslation();
  const folders = useAllSmartFolders();
  const [hovered, setHovered] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const isInCurrentFolder = currentFolderId !== null && memberFolderIds.includes(currentFolderId);
  const otherFolderIds = memberFolderIds.filter(id => id !== currentFolderId);
  const otherFolders = otherFolderIds.map(id => folders.find(f => f.id === id)).filter(Boolean) as typeof folders;

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't trigger selection when clicking action areas
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-select]')) return;
    onToggleSelect(index, e.shiftKey);
  };

  return (
    <Box
      draggable
      onDragStart={(e) => onDragStart(e, file)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleRowClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.3rem 0.5rem',
        borderRadius: 'var(--mantine-radius-sm)',
        borderBottom: '0.0625rem solid var(--border-subtle)',
        cursor: 'grab',
        backgroundColor: isSelected
          ? 'var(--mantine-color-blue-light)'
          : hovered
          ? 'var(--mantine-color-default-hover)'
          : 'transparent',
        outline: isSelected ? '0.0625rem solid var(--mantine-color-blue-light-hover)' : 'none',
        transition: 'background-color 0.1s ease',
        minWidth: 0,
        userSelect: 'none',
      }}
    >
      {/* Drag handle */}
      <DragIndicatorIcon
        style={{
          fontSize: '0.875rem',
          color: hovered || isSelected ? 'var(--mantine-color-dimmed)' : 'transparent',
          flexShrink: 0,
          transition: 'color 0.1s ease',
        }}
      />

      {/* File info */}
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Text size="xs" fw={500} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
          {file.name}
        </Text>
        {file.size && (
          <Text size="xs" c="dimmed" style={{ fontSize: '0.625rem', lineHeight: 1.2 }}>
            {formatSize(file.size)}
          </Text>
        )}
      </Box>

      {/* Folder badges for files in other folders */}
      {otherFolders.slice(0, 1).map(memberFolder => (
        <Tooltip key={memberFolder.id} label={t('smartFolders.fileList.openFolder', 'Open in {{name}}', { name: memberFolder.name })} withArrow>
          <Box
            data-no-select
            onClick={() => onNavigateToFolder(memberFolder.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.2rem',
              padding: '0.125rem 0.375rem',
              borderRadius: '1rem',
              backgroundColor: `${memberFolder.accentColor}18`,
              border: `0.0625rem solid ${memberFolder.accentColor}30`,
              cursor: 'pointer',
              flexShrink: 0,
              maxWidth: '5rem',
            }}
          >
            <Box style={{ width: '0.4rem', height: '0.4rem', borderRadius: '50%', backgroundColor: memberFolder.accentColor, flexShrink: 0 }} />
            <Text style={{ fontSize: '0.5625rem', color: memberFolder.accentColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {memberFolder.name}
            </Text>
            <ChevronRightIcon style={{ fontSize: '0.5rem', color: memberFolder.accentColor, flexShrink: 0 }} />
          </Box>
        </Tooltip>
      ))}
      {otherFolders.length > 1 && (
        <Text style={{ fontSize: '0.5625rem', color: 'var(--mantine-color-dimmed)', flexShrink: 0 }}>
          +{otherFolders.length - 1}
        </Text>
      )}

      {/* Action button */}
      {isInCurrentFolder ? (
        <Tooltip label={t('smartFolders.fileList.alreadyInFolder', 'Already in this folder')} withArrow>
          <ActionIcon data-no-select size="xs" variant="subtle" color="teal" style={{ flexShrink: 0 }} disabled>
            <CheckIcon style={{ fontSize: '0.75rem' }} />
          </ActionIcon>
        </Tooltip>
      ) : currentFolderId !== null ? (
        // Inside a folder — directly add
        <Tooltip label={t('smartFolders.fileList.addToFolder', 'Add to this folder')} withArrow>
          <ActionIcon
            data-no-select
            size="xs"
            variant="subtle"
            color="gray"
            style={{ flexShrink: 0, opacity: hovered ? 1 : 0, transition: 'opacity 0.1s ease' }}
            onClick={() => onSendToFolder(file.id, currentFolderId)}
          >
            <AddIcon style={{ fontSize: '0.75rem' }} />
          </ActionIcon>
        </Tooltip>
      ) : (
        // Home page — folder picker popover
        <Popover
          opened={pickerOpen}
          onChange={setPickerOpen}
          position="right"
          withArrow
          shadow="md"
          withinPortal
        >
          <Popover.Target>
            <ActionIcon
              data-no-select
              size="xs"
              variant="subtle"
              color="gray"
              style={{ flexShrink: 0, opacity: hovered || pickerOpen ? 1 : 0, transition: 'opacity 0.1s ease' }}
              onClick={(e) => { e.stopPropagation(); setPickerOpen(o => !o); }}
            >
              <AddIcon style={{ fontSize: '0.75rem' }} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown p="xs" style={{ minWidth: '10rem' }}>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs" style={{ fontSize: '0.5625rem', letterSpacing: '0.05em' }}>
              {t('smartFolders.fileList.addToFolder', 'Add to folder')}
            </Text>
            <Stack gap={2}>
              {folders.filter(f => !memberFolderIds.includes(f.id)).map(folder => {
                const FolderIconComp = iconMap[folder.icon as keyof typeof iconMap] || iconMap.FolderIcon;
                return (
                  <Button
                    key={folder.id}
                    variant="subtle"
                    size="xs"
                    justify="flex-start"
                    fullWidth
                    leftSection={
                      <Box style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: `${folder.accentColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FolderIconComp style={{ fontSize: 9, color: folder.accentColor }} />
                      </Box>
                    }
                    onClick={() => {
                      onSendToFolder(file.id, folder.id);
                      setPickerOpen(false);
                    }}
                  >
                    <Text size="xs" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {folder.name}
                    </Text>
                  </Button>
                );
              })}
              {folders.filter(f => !memberFolderIds.includes(f.id)).length === 0 && (
                <Text size="xs" c="dimmed" ta="center" py="xs">
                  {memberFolderIds.length > 0
                    ? t('smartFolders.fileList.inAllFolders', 'Already in all folders')
                    : t('smartFolders.noFolders', 'No watch folders yet')}
                </Text>
              )}
            </Stack>
          </Popover.Dropdown>
        </Popover>
      )}
    </Box>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <Box style={{ padding: '0.5rem 0.5rem 0.25rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
      <Text style={{ fontSize: '0.5625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--mantine-color-dimmed)' }}>
        {label}
      </Text>
      <Text style={{ fontSize: '0.5625rem', color: 'var(--mantine-color-dimmed)' }}>
        {count}
      </Text>
    </Box>
  );
}

export function WatchFolderFileList({ files, folderId, onSendToFolder, onNavigateToFolder }: WatchFolderFileListProps) {
  const { t } = useTranslation();
  const membership = useFolderMembership();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedIdxRef = useRef<number | null>(null);
  // Ref for drag ghost cleanup
  const ghostRef = useRef<HTMLDivElement | null>(null);

  const unassigned = files.filter(f => !membership.has(f.id));
  const inFolders = files.filter(f => membership.has(f.id));

  // All files in display order (unassigned first, then in-folders)
  const orderedFiles = [...unassigned, ...inFolders];

  const handleToggleSelect = useCallback((idx: number, shiftKey: boolean) => {
    const file = orderedFiles[idx];
    if (!file) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedIdxRef.current !== null) {
        // Range select
        const start = Math.min(lastSelectedIdxRef.current, idx);
        const end = Math.max(lastSelectedIdxRef.current, idx);
        for (let i = start; i <= end; i++) {
          if (orderedFiles[i]) next.add(orderedFiles[i].id);
        }
      } else {
        if (next.has(file.id)) {
          next.delete(file.id);
        } else {
          next.add(file.id);
        }
      }
      return next;
    });
    lastSelectedIdxRef.current = idx;
  }, [orderedFiles]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastSelectedIdxRef.current = null;
  }, []);

  // Escape key to clear selection
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearSelection]);

  const handleDragStart = useCallback((e: React.DragEvent, file: StirlingFileStub) => {
    const isFileSelected = selectedIds.has(file.id);
    const isMulti = isFileSelected && selectedIds.size > 1;

    if (isMulti) {
      const ids = Array.from(selectedIds);
      e.dataTransfer.setData('watchFolderFileIds', JSON.stringify(ids));
      // Also write single as fallback for older handlers
      e.dataTransfer.setData('watchFolderFileId', ids[0]);

      // Custom ghost showing "N files"
      const ghost = document.createElement('div');
      ghost.style.cssText = [
        'position:fixed',
        'top:-9999px',
        'left:-9999px',
        'padding:0.25rem 0.75rem',
        'border-radius:0.5rem',
        'background:var(--mantine-color-blue-filled,#3b82f6)',
        'color:#fff',
        'font-size:0.75rem',
        'font-weight:600',
        'white-space:nowrap',
        'pointer-events:none',
        'z-index:9999',
        'font-family:var(--mantine-font-family,sans-serif)',
      ].join(';');
      ghost.textContent = `${ids.length} files`;
      document.body.appendChild(ghost);
      ghostRef.current = ghost;
      e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);

      e.dataTransfer.effectAllowed = 'copy';
    } else {
      e.dataTransfer.setData('watchFolderFileId', file.id);
      e.dataTransfer.effectAllowed = 'copy';
    }
  }, [selectedIds]);

  // Clean up ghost and clear selection after drag ends
  const handleDragEnd = useCallback(() => {
    if (ghostRef.current) {
      document.body.removeChild(ghostRef.current);
      ghostRef.current = null;
    }
    clearSelection();
  }, [clearSelection]);

  if (files.length === 0) {
    return (
      <Text size="xs" c="dimmed" ta="center" py="xl" px="sm">
        {t('smartFolders.fileList.empty', 'No files yet — upload a PDF to get started')}
      </Text>
    );
  }

  return (
    <Box
      style={{ padding: '0.25rem 0' }}
      onDragEnd={handleDragEnd}
    >
      {/* Selection count pill */}
      {selectedIds.size >= 2 && (
        <Group
          gap="xs"
          align="center"
          style={{
            padding: '0.25rem 0.5rem',
            margin: '0 0.25rem 0.25rem',
            borderRadius: 'var(--mantine-radius-sm)',
            backgroundColor: 'var(--mantine-color-blue-light)',
            border: '0.0625rem solid var(--mantine-color-blue-light-hover)',
          }}
        >
          <Text size="xs" fw={600} style={{ flex: 1, color: 'var(--mantine-color-blue-filled)', fontSize: '0.6875rem' }}>
            {selectedIds.size} {t('smartFolders.fileList.selected', 'selected')}
          </Text>
          <ActionIcon size="xs" variant="transparent" onClick={clearSelection} style={{ color: 'var(--mantine-color-blue-filled)' }}>
            <CloseIcon style={{ fontSize: '0.75rem' }} />
          </ActionIcon>
        </Group>
      )}

      {unassigned.length > 0 && (
        <>
          {inFolders.length > 0 && (
            <SectionHeader label={t('smartFolders.fileList.unassigned', 'Unassigned')} count={unassigned.length} />
          )}
          {unassigned.map((file, i) => (
            <FileRow
              key={file.id}
              file={file}
              index={i}
              currentFolderId={folderId}
              memberFolderIds={[]}
              isSelected={selectedIds.has(file.id)}
              onToggleSelect={handleToggleSelect}
              onSendToFolder={onSendToFolder}
              onNavigateToFolder={onNavigateToFolder}
              onDragStart={handleDragStart}
            />
          ))}
        </>
      )}

      {inFolders.length > 0 && (
        <>
          <SectionHeader label={t('smartFolders.fileList.inFolders', 'In folders')} count={inFolders.length} />
          {inFolders.map((file, i) => (
            <FileRow
              key={file.id}
              file={file}
              index={unassigned.length + i}
              currentFolderId={folderId}
              memberFolderIds={membership.get(file.id) ?? []}
              isSelected={selectedIds.has(file.id)}
              onToggleSelect={handleToggleSelect}
              onSendToFolder={onSendToFolder}
              onNavigateToFolder={onNavigateToFolder}
              onDragStart={handleDragStart}
            />
          ))}
        </>
      )}
    </Box>
  );
}
