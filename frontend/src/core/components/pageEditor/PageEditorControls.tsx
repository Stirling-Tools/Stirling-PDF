import {
  Tooltip,
  ActionIcon,
} from "@mantine/core";
import LocalIcon from "@app/components/shared/LocalIcon";

interface PageEditorControlsProps {
  // Close/Reset functions
  onClosePdf: () => void;

  // Undo/Redo
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Page operations
  onRotate: (direction: 'left' | 'right') => void;
  onDelete: () => void;
  onSplit: () => void;
  onSplitAll: () => void;
  onPageBreak: () => void;
  onPageBreakAll: () => void;

  // Export functions (moved to right rail)
  onExportAll: () => void;
  exportLoading: boolean;

  // Selection state
  selectionMode: boolean;
  selectedPageIds: string[];
  displayDocument?: { pages: { id: string; pageNumber: number }[] };

  // Split state (for tooltip logic)
  splitPositions?: Set<number>;
  totalPages?: number;
}

const PageEditorControls = ({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onRotate,
  onDelete,
  onSplit,
  onPageBreak,
  selectedPageIds,
  displayDocument,
  splitPositions,
  totalPages
}: PageEditorControlsProps) => {
  // Calculate split tooltip text using smart toggle logic
  const getSplitTooltip = () => {
    if (!splitPositions || !totalPages || selectedPageIds.length === 0) {
      return "Split Selected";
    }

    // Convert selected pages to split positions (same logic as handleSplit)
    const selectedPageNumbers = displayDocument ? selectedPageIds.map(id => {
      const page = displayDocument.pages.find(p => p.id === id);
      return page?.pageNumber || 0;
    }).filter(num => num > 0) : [];
    const selectedSplitPositions = selectedPageNumbers.map(pageNum => pageNum - 1).filter(pos => pos < totalPages - 1);

    if (selectedSplitPositions.length === 0) {
      return "Split Selected";
    }

    // Smart toggle logic: follow the majority, default to adding splits if equal
    const existingSplitsCount = selectedSplitPositions.filter(pos => splitPositions.has(pos)).length;
    const noSplitsCount = selectedSplitPositions.length - existingSplitsCount;

    // Remove splits only if majority already have splits
    // If equal (50/50), default to adding splits
    const willRemoveSplits = existingSplitsCount > noSplitsCount;

    if (willRemoveSplits) {
      return existingSplitsCount === selectedSplitPositions.length
        ? "Remove All Selected Splits"
        : "Remove Selected Splits";
    } else {
      return existingSplitsCount === 0
        ? "Split Selected"
        : "Complete Selected Splits";
    }
  };

  // Calculate page break tooltip text
  const getPageBreakTooltip = () => {
    return selectedPageIds.length > 0
      ? `Insert ${selectedPageIds.length} Page Break${selectedPageIds.length > 1 ? 's' : ''}`
      : "Insert Page Breaks";
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        background: 'transparent',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          boxShadow: '0 -2px 8px rgba(0,0,0,0.04)',
          backgroundColor: 'var(--bg-toolbar)',
          border: '1px solid var(--border-default)',
          borderRadius: '16px 16px 0 0',
          pointerEvents: 'auto',
          minWidth: 360,
          maxWidth: 700,
          flexWrap: 'wrap',
          justifyContent: 'center',
          padding: "1rem",
          paddingBottom: "1rem"
        }}
      >

        {/* Undo/Redo */}
        <Tooltip label="Undo">
          <ActionIcon onClick={onUndo} disabled={!canUndo} variant="subtle" style={{ color: canUndo ? 'var(--right-rail-icon)' : 'var(--right-rail-icon-disabled)' }} radius="md" size="lg">
            <LocalIcon icon="undo-rounded" width={24} height={24} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Redo">
          <ActionIcon onClick={onRedo} disabled={!canRedo} variant="subtle" style={{ color: canRedo ? 'var(--right-rail-icon)' : 'var(--right-rail-icon-disabled)' }} radius="md" size="lg">
            <LocalIcon icon="redo-rounded" width={24} height={24} />
          </ActionIcon>
        </Tooltip>

        <div style={{ width: 1, height: 28, backgroundColor: 'var(--mantine-color-gray-3)', margin: '0 8px' }} />

        {/* Page Operations */}
        <Tooltip label="Rotate Selected Left">
          <ActionIcon
            onClick={() => onRotate('left')}
            disabled={selectedPageIds.length === 0}
            variant="subtle"
            style={{ color: selectedPageIds.length > 0 ? 'var(--right-rail-icon)' : 'var(--right-rail-icon-disabled)' }}
            radius="md"
            size="lg"
          >
            <LocalIcon icon="rotate-left-rounded" width={24} height={24} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Rotate Selected Right">
          <ActionIcon
            onClick={() => onRotate('right')}
            disabled={selectedPageIds.length === 0}
            variant="subtle"
            style={{ color: selectedPageIds.length > 0 ? 'var(--right-rail-icon)' : 'var(--right-rail-icon-disabled)' }}
            radius="md"
            size="lg"
          >
            <LocalIcon icon="rotate-right-rounded" width={24} height={24} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Delete Selected">
          <ActionIcon
            onClick={onDelete}
            disabled={selectedPageIds.length === 0}
            variant="subtle"
            style={{ color: selectedPageIds.length > 0 ? 'var(--right-rail-icon)' : 'var(--right-rail-icon-disabled)' }}
            radius="md"
            size="lg"
          >
            <LocalIcon icon="delete-rounded" width={24} height={24} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={getSplitTooltip()}>
          <ActionIcon
            onClick={onSplit}
            disabled={selectedPageIds.length === 0}
            variant="subtle"
            style={{ color: selectedPageIds.length > 0 ? 'var(--right-rail-icon)' : 'var(--right-rail-icon-disabled)' }}
            radius="md"
            size="lg"
          >
            <LocalIcon icon="content-cut-rounded" width={24} height={24} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={getPageBreakTooltip()}>
          <ActionIcon
            onClick={onPageBreak}
            disabled={selectedPageIds.length === 0}
            variant="subtle"
            style={{ color: selectedPageIds.length > 0 ? 'var(--right-rail-icon)' : 'var(--right-rail-icon-disabled)' }}
            radius="md"
            size="lg"
          >
            <LocalIcon icon="insert-page-break-rounded" width={24} height={24} />
          </ActionIcon>
        </Tooltip>
      </div>
    </div>
  );
};

export default PageEditorControls;
