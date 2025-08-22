import React from "react";
import {
  Tooltip,
  ActionIcon,
} from "@mantine/core";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";

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

  // Export functions
  onExportSelected: () => void;
  onExportAll: () => void;
  exportLoading: boolean;

  // Selection state
  selectionMode: boolean;
  selectedPages: number[];
}

const PageEditorControls = ({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onRotate,
  onSplit,
  selectionMode,
  selectedPages
}: PageEditorControlsProps) => {
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
          minWidth: 420,
          maxWidth: 700,
          flexWrap: 'wrap',
          justifyContent: 'center',
          padding: "1rem",
          paddingBottom: "2rem"
        }}
      >

        {/* Undo/Redo */}
        <Tooltip label="Undo">
          <ActionIcon onClick={onUndo} disabled={!canUndo} size="lg">
            <UndoIcon />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Redo">
          <ActionIcon onClick={onRedo} disabled={!canRedo} size="lg">
            <RedoIcon />
          </ActionIcon>
        </Tooltip>

        <div style={{ width: 1, height: 28, backgroundColor: 'var(--mantine-color-gray-3)', margin: '0 8px' }} />

        {/* Page Operations */}
        <Tooltip label={selectionMode ? "Rotate Selected Left" : "Rotate All Left"}>
          <ActionIcon
            onClick={() => onRotate('left')}
            disabled={selectionMode && selectedPages.length === 0}
            variant={selectionMode && selectedPages.length > 0 ? "light" : "default"}
            color={selectionMode && selectedPages.length > 0 ? "blue" : undefined}
            size="lg"
          >
            <RotateLeftIcon />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={selectionMode ? "Rotate Selected Right" : "Rotate All Right"}>
          <ActionIcon
            onClick={() => onRotate('right')}
            disabled={selectionMode && selectedPages.length === 0}
            variant={selectionMode && selectedPages.length > 0 ? "light" : "default"}
            color={selectionMode && selectedPages.length > 0 ? "blue" : undefined}
            size="lg"
          >
            <RotateRightIcon />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={selectionMode ? "Split Selected" : "Split All"}>
          <ActionIcon
            onClick={onSplit}
            disabled={selectionMode && selectedPages.length === 0}
            variant={selectionMode && selectedPages.length > 0 ? "light" : "default"}
            color={selectionMode && selectedPages.length > 0 ? "blue" : undefined}
            size="lg"
          >
            <ContentCutIcon />
          </ActionIcon>
        </Tooltip>

      </div>
    </div>
  );
};

export default PageEditorControls;
