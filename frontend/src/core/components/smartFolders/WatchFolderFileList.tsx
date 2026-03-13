import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Box, Text, ActionIcon, Group, Popover, Stack, Button, Tooltip, TextInput, Select, ScrollArea, Indicator } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import { StirlingFileStub } from '@app/types/fileContext';
import { useFolderMembership } from '@app/hooks/useFolderMembership';
import { useAllSmartFolders } from '@app/hooks/useAllSmartFolders';
import { iconMap } from '@app/components/tools/automate/iconMap';
import { useFileHandler } from '@app/hooks/useFileHandler';
import { openFilesFromDisk } from '@app/services/openFilesFromDisk';

interface WatchFolderFileListProps {
  files: StirlingFileStub[];
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

// Compact folder pill shown in the tag row
function FolderTag({
  folder,
  onClick,
}: {
  folder: { id: string; name: string; accentColor: string; icon: string };
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Box
      data-no-select
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.2rem',
        padding: '0.1rem 0.3rem 0.1rem 0.25rem',
        borderRadius: '0.25rem',
        backgroundColor: hovered ? `${folder.accentColor}28` : `${folder.accentColor}14`,
        border: `0.0625rem solid ${folder.accentColor}35`,
        cursor: 'pointer',
        transition: 'background-color 0.1s ease',
        maxWidth: '6rem',
        flexShrink: 0,
      }}
    >
      <Box
        style={{
          width: '0.375rem',
          height: '0.375rem',
          borderRadius: '50%',
          backgroundColor: folder.accentColor,
          flexShrink: 0,
        }}
      />
      <Text
        style={{
          fontSize: '0.5625rem',
          fontWeight: 500,
          color: folder.accentColor,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1,
        }}
      >
        {folder.name}
      </Text>
    </Box>
  );
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
  // Folders this file belongs to that aren't the current one
  const otherFolders = memberFolderIds
    .filter(id => id !== currentFolderId)
    .map(id => folders.find(f => f.id === id))
    .filter(Boolean) as typeof folders;

  const hasTags = isInCurrentFolder || otherFolders.length > 0;
  const hasBottomRow = !!file.size || hasTags;

  const handleRowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-select]')) return;
    onToggleSelect(index, e.shiftKey);
  };

  const MAX_VISIBLE_TAGS = 3;
  const visibleFolders = otherFolders.slice(0, MAX_VISIBLE_TAGS);
  const overflowFolders = otherFolders.slice(MAX_VISIBLE_TAGS);

  return (
    <Box
      draggable={!isInCurrentFolder}
      onDragStart={isInCurrentFolder ? undefined : (e) => onDragStart(e, file)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={isInCurrentFolder ? undefined : handleRowClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        padding: '0.35rem 0.5rem 0.35rem 0',
        borderRadius: 'var(--mantine-radius-sm)',
        borderBottom: '0.0625rem solid var(--border-subtle)',
        borderLeft: `0.1875rem solid ${isSelected ? 'var(--mantine-color-blue-filled)' : 'transparent'}`,
        paddingLeft: '0.375rem',
        cursor: isInCurrentFolder ? 'default' : 'grab',
        opacity: isInCurrentFolder ? 0.4 : 1,
        backgroundColor: isSelected
          ? 'var(--mantine-color-blue-light)'
          : hovered && !isInCurrentFolder
          ? 'var(--mantine-color-default-hover)'
          : 'transparent',
        transition: 'background-color 0.1s ease, border-left-color 0.15s ease, opacity 0.15s ease',
        minWidth: 0,
        userSelect: 'none',
      }}
    >
      {/* ── Top row: handle + name + action ── */}
      <Box style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', minWidth: 0 }}>
        <DragIndicatorIcon
          style={{
            fontSize: '0.875rem',
            color: hovered || isSelected ? 'var(--mantine-color-dimmed)' : 'transparent',
            flexShrink: 0,
            transition: 'color 0.1s ease',
          }}
        />

        <Text
          size="xs"
          fw={500}
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.35,
            minWidth: 0,
          }}
        >
          {file.name}
        </Text>

        {/* Action button */}
        {isInCurrentFolder ? null : currentFolderId !== null ? (
          <Tooltip label={t('smartFolders.fileList.addToFolder', 'Add to this folder')} withArrow>
            <ActionIcon
              data-no-select
              size="sm"
              variant="light"
              color="blue"
              style={{
                flexShrink: 0,
                opacity: hovered ? 1 : 0,
                transition: 'opacity 0.15s ease',
                borderRadius: 'var(--mantine-radius-sm)',
              }}
              onClick={() => onSendToFolder(file.id, currentFolderId)}
            >
              <AddIcon style={{ fontSize: '0.875rem' }} />
            </ActionIcon>
          </Tooltip>
        ) : (
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
                size="sm"
                variant="light"
                color="blue"
                style={{
                  flexShrink: 0,
                  opacity: hovered || pickerOpen ? 1 : 0,
                  transition: 'opacity 0.15s ease',
                  borderRadius: 'var(--mantine-radius-sm)',
                }}
                onClick={(e) => { e.stopPropagation(); setPickerOpen(o => !o); }}
              >
                <AddIcon style={{ fontSize: '0.875rem' }} />
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
                      onClick={() => { onSendToFolder(file.id, folder.id); setPickerOpen(false); }}
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

      {/* ── Bottom row: size + folder tags ── */}
      {hasBottomRow && (
        <Box
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.25rem',
            paddingLeft: '1.125rem',
          }}
        >
          {file.size && (
            <Text
              style={{
                fontSize: '0.5625rem',
                color: 'var(--mantine-color-dimmed)',
                lineHeight: 1,
                marginRight: '0.125rem',
              }}
            >
              {formatSize(file.size)}
            </Text>
          )}

          {visibleFolders.map(folder => (
            <FolderTag
              key={folder.id}
              folder={folder}
              onClick={() => onNavigateToFolder(folder.id)}
            />
          ))}

          {overflowFolders.length > 0 && (
            <Tooltip
              label={overflowFolders.map(f => f.name).join(', ')}
              withArrow
              withinPortal
            >
              <Box
                data-no-select
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.1rem 0.3rem',
                  borderRadius: '0.25rem',
                  backgroundColor: 'var(--mantine-color-default-hover)',
                  border: '0.0625rem solid var(--border-subtle)',
                  cursor: 'default',
                  flexShrink: 0,
                }}
              >
                <Text style={{ fontSize: '0.5625rem', fontWeight: 600, color: 'var(--mantine-color-dimmed)', lineHeight: 1 }}>
                  +{overflowFolders.length}
                </Text>
              </Box>
            </Tooltip>
          )}

        </Box>
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

type SortKey = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc';
type FilterMode = 'all' | 'unassigned' | string; // string = folder id

export function WatchFolderFileList({ files, folderId, onSendToFolder, onNavigateToFolder }: WatchFolderFileListProps) {
  const { t } = useTranslation();
  const membership = useFolderMembership();
  const allFolders = useAllSmartFolders();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedIdxRef = useRef<number | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const { addFiles } = useFileHandler();

  const handleUploadClick = useCallback(async () => {
    const pickedFiles = await openFilesFromDisk({
      multiple: true,
      onFallbackOpen: () => uploadInputRef.current?.click(),
    });
    if (pickedFiles.length > 0) await addFiles(pickedFiles);
  }, [addFiles]);

  const handleInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length > 0) await addFiles(picked);
    e.target.value = '';
  }, [addFiles]);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date-desc');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [filterNegate, setFilterNegate] = useState(false);

  const handleSetFilterMode = (v: FilterMode) => {
    setFilterMode(v);
    setFilterNegate(false);
  };

  const isFolderFilter = filterMode !== 'all' && filterMode !== 'unassigned';

  // Apply search + filter + sort to the full file list
  const processedFiles = useMemo(() => {
    let result = [...files];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(q));
    }

    // Filter
    if (filterMode === 'unassigned') result = result.filter(f => !membership.has(f.id));
    else if (filterMode !== 'all') {
      const inFolder = (f: typeof files[number]) => membership.get(f.id)?.includes(filterMode) ?? false;
      result = result.filter(f => filterNegate ? !inFolder(f) : inFolder(f));
    }

    // Sort
    result.sort((a, b) => {
      switch (sortKey) {
        case 'name-asc':  return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        case 'size-desc': return (b.size ?? 0) - (a.size ?? 0);
        case 'size-asc':  return (a.size ?? 0) - (b.size ?? 0);
        case 'date-asc':  return ((a as any).createdAt ?? a.lastModified ?? 0) - ((b as any).createdAt ?? b.lastModified ?? 0);
        case 'date-desc':
        default:          return ((b as any).createdAt ?? b.lastModified ?? 0) - ((a as any).createdAt ?? a.lastModified ?? 0);
      }
    });

    return result;
  }, [files, search, sortKey, filterMode, filterNegate, membership]);

  // When filter mode is 'all' keep the unassigned / in-folders section split
  const unassigned = processedFiles.filter(f => !membership.has(f.id));
  const inFolders  = processedFiles.filter(f =>  membership.has(f.id));
  // Flat ordered list used for shift-select indexing
  const orderedFiles = filterMode === 'all' ? [...unassigned, ...inFolders] : processedFiles;

  const handleToggleSelect = useCallback((idx: number, shiftKey: boolean) => {
    const file = orderedFiles[idx];
    if (!file) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedIdxRef.current !== null) {
        const start = Math.min(lastSelectedIdxRef.current, idx);
        const end = Math.max(lastSelectedIdxRef.current, idx);
        for (let i = start; i <= end; i++) {
          if (orderedFiles[i]) next.add(orderedFiles[i].id);
        }
      } else {
        if (next.has(file.id)) next.delete(file.id);
        else next.add(file.id);
      }
      return next;
    });
    lastSelectedIdxRef.current = idx;
  }, [orderedFiles]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastSelectedIdxRef.current = null;
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') clearSelection(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearSelection]);

  const handleDragStart = useCallback((e: React.DragEvent, file: StirlingFileStub) => {
    const isMulti = selectedIds.has(file.id) && selectedIds.size > 1;
    if (isMulti) {
      const ids = Array.from(selectedIds);
      e.dataTransfer.setData('watchFolderFileIds', JSON.stringify(ids));
      e.dataTransfer.setData('watchFolderFileId', ids[0]);
      const ghost = document.createElement('div');
      ghost.style.cssText = [
        'position:fixed', 'top:-9999px', 'left:-9999px',
        'padding:0.25rem 0.75rem', 'border-radius:0.5rem',
        'background:var(--mantine-color-blue-filled,#3b82f6)',
        'color:#fff', 'font-size:0.75rem', 'font-weight:600',
        'white-space:nowrap', 'pointer-events:none', 'z-index:9999',
        'font-family:var(--mantine-font-family,sans-serif)',
      ].join(';');
      ghost.textContent = `${ids.length} files`;
      document.body.appendChild(ghost);
      ghostRef.current = ghost;
      e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
    } else {
      e.dataTransfer.setData('watchFolderFileId', file.id);
    }
    e.dataTransfer.effectAllowed = 'copy';
  }, [selectedIds]);

  const handleDragEnd = useCallback(() => {
    if (ghostRef.current) { document.body.removeChild(ghostRef.current); ghostRef.current = null; }
    clearSelection();
  }, [clearSelection]);

  const sortOptions = [
    { value: 'date-desc', label: t('smartFolders.fileList.sort.newest', 'Newest first') },
    { value: 'date-asc',  label: t('smartFolders.fileList.sort.oldest', 'Oldest first') },
    { value: 'name-asc',  label: t('smartFolders.fileList.sort.nameAZ', 'Name A–Z') },
    { value: 'name-desc', label: t('smartFolders.fileList.sort.nameZA', 'Name Z–A') },
    { value: 'size-desc', label: t('smartFolders.fileList.sort.largest', 'Largest first') },
    { value: 'size-asc',  label: t('smartFolders.fileList.sort.smallest', 'Smallest first') },
  ];

  const filterOptions = [
    { value: 'all',        label: t('smartFolders.fileList.filter.all', 'All files') },
    { value: 'unassigned', label: t('smartFolders.fileList.filter.unassigned', 'Unassigned') },
    ...allFolders.map(f => ({ value: f.id, label: f.name })),
  ];

  const hasActiveFilters = sortKey !== 'date-desc' || filterMode !== 'all' || filterNegate;
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} onDragEnd={handleDragEnd}>

      {/* ── Sticky toolbar ── */}
      <Box style={{ flexShrink: 0, padding: '0.375rem 0.5rem 0.25rem', borderBottom: '0.0625rem solid var(--border-subtle)' }}>
        <Group gap="0.375rem" wrap="nowrap" align="center">
          <TextInput
            size="xs"
            placeholder={t('smartFolders.fileList.search', 'Search…')}
            value={search}
            onChange={e => setSearch(e.currentTarget.value)}
            leftSection={<SearchIcon style={{ fontSize: '0.875rem' }} />}
            rightSection={search ? (
              <ActionIcon size="xs" variant="transparent" onClick={() => setSearch('')}>
                <CloseIcon style={{ fontSize: '0.75rem' }} />
              </ActionIcon>
            ) : null}
            styles={{ input: { fontSize: '0.75rem' } }}
            style={{ flex: 1, minWidth: 0 }}
          />
          <Tooltip label={t('smartFolders.fileList.uploadFiles', 'Upload PDFs')} withArrow>
            <ActionIcon size="sm" variant="default" onClick={handleUploadClick} aria-label="Upload files">
              <AddIcon style={{ fontSize: '0.875rem' }} />
            </ActionIcon>
          </Tooltip>
          <Popover
            opened={filterPopoverOpen}
            onChange={setFilterPopoverOpen}
            position="bottom-end"
            withinPortal
            shadow="md"
            width={180}
          >
            <Popover.Target>
              <Indicator disabled={!hasActiveFilters} size={6} color="blue" offset={3} style={{ display: 'flex' }}>
                <ActionIcon
                  size="sm"
                  variant={hasActiveFilters ? 'light' : 'default'}
                  color={hasActiveFilters ? 'blue' : undefined}
                  onClick={() => setFilterPopoverOpen(o => !o)}
                  aria-label="Sort and filter"
                >
                  <TuneIcon style={{ fontSize: '0.875rem' }} />
                </ActionIcon>
              </Indicator>
            </Popover.Target>
            <Popover.Dropdown p="xs">
              <Stack gap="xs">
                <Box>
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ fontSize: '0.5625rem', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                    {t('smartFolders.fileList.sortLabel', 'Sort')}
                  </Text>
                  <Select
                    size="xs"
                    data={sortOptions}
                    value={sortKey}
                    onChange={v => v && setSortKey(v as SortKey)}
                    styles={{ input: { fontSize: '0.6875rem' } }}
                    comboboxProps={{ withinPortal: false }}
                    allowDeselect={false}
                  />
                </Box>
                <Box>
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ fontSize: '0.5625rem', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                    {t('smartFolders.fileList.filterLabel', 'Filter')}
                  </Text>
                  <Select
                    size="xs"
                    value={filterMode}
                    onChange={v => v && handleSetFilterMode(v)}
                    styles={{ input: { fontSize: '0.6875rem' } }}
                    comboboxProps={{ withinPortal: false }}
                    allowDeselect={false}
                    data={filterOptions}
                  />
                </Box>
                {isFolderFilter && (
                  <Box>
                    <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ fontSize: '0.5625rem', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                      {t('smartFolders.fileList.matchLabel', 'Match')}
                    </Text>
                    <Group gap="0" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)', overflow: 'hidden' }}>
                      <Button
                        size="xs"
                        variant={!filterNegate ? 'filled' : 'default'}
                        color={!filterNegate ? 'blue' : undefined}
                        style={{ flex: 1, borderRadius: 0, border: 'none' }}
                        onClick={() => setFilterNegate(false)}
                      >=</Button>
                      <Button
                        size="xs"
                        variant={filterNegate ? 'filled' : 'default'}
                        color={filterNegate ? 'blue' : undefined}
                        style={{ flex: 1, borderRadius: 0, border: 'none', borderLeft: '1px solid var(--mantine-color-default-border)' }}
                        onClick={() => setFilterNegate(true)}
                      >≠</Button>
                    </Group>
                  </Box>
                )}
                {hasActiveFilters && (
                  <Button
                    size="xs"
                    variant="subtle"
                    color="gray"
                    fullWidth
                    onClick={() => { setSortKey('date-desc'); handleSetFilterMode('all'); }}
                  >
                    {t('smartFolders.fileList.resetFilters', 'Reset')}
                  </Button>
                )}
              </Stack>
            </Popover.Dropdown>
          </Popover>
        </Group>

        {/* Selection count pill */}
        {selectedIds.size >= 2 && (
          <Group
            gap="xs"
            align="center"
            mt="0.25rem"
            style={{
              padding: '0.2rem 0.5rem',
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
      </Box>

      {/* ── Scrollable file list ── */}
      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        <Box style={{ padding: '0.25rem 0' }}>
          {files.length === 0 ? (
            <Text size="xs" c="dimmed" ta="center" py="xl" px="sm">
              {t('smartFolders.fileList.empty', 'No files yet')}
            </Text>
          ) : processedFiles.length === 0 ? (
            <Text size="xs" c="dimmed" ta="center" py="md" px="sm">
              {search ? t('smartFolders.fileList.noResults', 'No files match your search') : t('smartFolders.fileList.noneInFilter', 'No files in this category')}
            </Text>
          ) : filterMode !== 'all' ? (
            processedFiles.map((file, i) => (
              <FileRow
                key={file.id}
                file={file}
                index={i}
                currentFolderId={folderId}
                memberFolderIds={membership.get(file.id) ?? []}
                isSelected={selectedIds.has(file.id)}
                onToggleSelect={handleToggleSelect}
                onSendToFolder={onSendToFolder}
                onNavigateToFolder={onNavigateToFolder}
                onDragStart={handleDragStart}
              />
            ))
          ) : (
            <>
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
            </>
          )}
        </Box>
      </ScrollArea>
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        accept=".pdf"
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />
    </Box>
  );
}
