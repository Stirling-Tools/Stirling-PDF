import {
  Tooltip,
  ActionIcon,
} from "@mantine/core";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import DeleteIcon from "@mui/icons-material/Delete";
import InsertPageBreakIcon from "@mui/icons-material/InsertPageBreak";

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
  splitPositions?: Set<string>;
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
    if (!splitPositions || !displayDocument || selectedPageIds.length === 0) {
      return "Split Selected";
    }

    const totalPages = displayDocument.pages.length;
    const selectedValidPageIds = displayDocument.pages
      .filter((page, index) => selectedPageIds.includes(page.id) && index < totalPages - 1)
      .map(page => page.id);

    if (selectedValidPageIds.length === 0) {
      return "Split Selected";
    }

    const existingSplitsCount = selectedValidPageIds.filter(id => splitPositions.has(id)).length;
    const noSplitsCount = selectedValidPageIds.length - existingSplitsCount;

    const willRemoveSplits = existingSplitsCount > noSplitsCount;

    if (willRemoveSplits) {
      return existingSplitsCount === selectedValidPageIds.length
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
        position: 'sticky',
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
            <UndoIcon />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Redo">
          <ActionIcon onClick={onRedo} disabled={!canRedo} variant="subtle" style={{ color: canRedo ? 'var(--right-rail-icon)' : 'var(--right-rail-icon-disabled)' }} radius="md" size="lg">
            <RedoIcon />
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
            <RotateLeftIcon />
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
            <RotateRightIcon />
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
            <DeleteIcon />
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
            <ContentCutIcon />
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
            <InsertPageBreakIcon />
          </ActionIcon>
        </Tooltip>
      </div>
    </div>
  );
};

export default PageEditorControls;
