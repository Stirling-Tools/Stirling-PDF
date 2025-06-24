import React from "react";
import {
  Tooltip,
  ActionIcon,
  Paper
} from "@mantine/core";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import DownloadIcon from "@mui/icons-material/Download";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import DeleteIcon from "@mui/icons-material/Delete";
import CloseIcon from "@mui/icons-material/Close";

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
  selectedPages: string[];
}

const PageEditorControls = ({
  onClosePdf,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onRotate,
  onDelete,
  onSplit,
  onExportSelected,
  onExportAll,
  exportLoading,
  selectionMode,
  selectedPages
}: PageEditorControlsProps) => {
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '20px',
        transform: 'translateX(-50%)',
        zIndex: 50,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        background: 'transparent',
      }}
    >
      <Paper
        radius="xl"
        shadow="lg"
        p={16}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderRadius: 32,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          pointerEvents: 'auto',
          minWidth: 400,
          justifyContent: 'center'
        }}
      >
        {/* Close PDF */}
        <Tooltip label="Close PDF">
          <ActionIcon
            onClick={onClosePdf}
            color="red"
            variant="light"
            size="lg"
          >
            <CloseIcon />
          </ActionIcon>
        </Tooltip>

        <div style={{ width: 1, height: 28, backgroundColor: 'var(--mantine-color-gray-3)', margin: '0 8px' }} />

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
        <Tooltip label={selectionMode ? "Delete Selected" : "Delete All"}>
          <ActionIcon
            onClick={onDelete}
            disabled={selectionMode && selectedPages.length === 0}
            color="red"
            variant={selectionMode && selectedPages.length > 0 ? "light" : "default"}
            size="lg"
          >
            <DeleteIcon />
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

        <div style={{ width: 1, height: 28, backgroundColor: 'var(--mantine-color-gray-3)', margin: '0 8px' }} />

        {/* Export Controls */}
        {selectionMode && selectedPages.length > 0 && (
          <Tooltip label="Export Selected">
            <ActionIcon
              onClick={onExportSelected}
              disabled={exportLoading}
              color="blue"
              variant="light"
              size="lg"
            >
              <DownloadIcon />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label="Export All">
          <ActionIcon
            onClick={onExportAll}
            disabled={exportLoading}
            color="green"
            variant="light"
            size="lg"
          >
            <DownloadIcon />
          </ActionIcon>
        </Tooltip>
      </Paper>
    </div>
  );
};

export default PageEditorControls;
