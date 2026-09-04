import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import WrapTextIcon from "@mui/icons-material/WrapText";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import {
  useWorkbenchBarButtons,
  WorkbenchBarButtonWithAction,
} from "@app/hooks/useWorkbenchBarButtons";
import LocalIcon from "@app/components/shared/LocalIcon";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Tooltip } from "@app/components/shared/Tooltip";
import styles from "@app/components/pageTracks/PageTracks.module.css";

export interface PageTracksBarParams {
  totalPages: number;
  selectedCount: number;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  saving: boolean;
  wrap: boolean;
  onToggleWrap: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onRotate: (delta: number) => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
}

export function usePageTracksWorkbenchBarButtons(params: PageTracksBarParams) {
  const {
    totalPages,
    selectedCount,
    canUndo,
    canRedo,
    isDirty,
    saving,
    wrap,
    onToggleWrap,
    canZoomIn,
    canZoomOut,
    onZoomIn,
    onZoomOut,
    onSelectAll,
    onDeselectAll,
    onRotate,
    onDelete,
    onUndo,
    onRedo,
    onSave,
  } = params;
  const { t } = useTranslation();

  const labels = {
    wrap: t("pageTracks.wrap.label", "Wrap pages"),
    zoomIn: t("pageTracks.zoomIn", "Zoom in"),
    zoomOut: t("pageTracks.zoomOut", "Zoom out"),
    selectAll: t("workbenchBar.selectAll", "Select All"),
    deselectAll: t("workbenchBar.deselectAll", "Deselect All"),
    rotateLeft: t("pageTracks.rotateLeft", "Rotate left"),
    rotateRight: t("pageTracks.rotateRight", "Rotate right"),
    deleteSelected: t("workbenchBar.deleteSelected", "Delete Selected Pages"),
    undo: t("pageTracks.undo", "Undo"),
    redo: t("pageTracks.redo", "Redo"),
    save: t("pageTracks.saveChanges", "Save changes to all files"),
  };

  const hasPages = totalPages > 0;
  const hasSelection = selectedCount > 0;

  const buttons = useMemo<WorkbenchBarButtonWithAction[]>(
    () => [
      {
        id: "tracks-wrap",
        icon: <WrapTextIcon sx={{ fontSize: "1.25rem" }} />,
        tooltip: labels.wrap,
        ariaLabel: labels.wrap,
        section: "top" as const,
        order: 5,
        visible: hasPages,
        active: wrap,
        onClick: onToggleWrap,
      },
      {
        id: "tracks-zoom-out",
        icon: <ZoomOutIcon sx={{ fontSize: "1.25rem" }} />,
        tooltip: labels.zoomOut,
        ariaLabel: labels.zoomOut,
        section: "top" as const,
        order: 6,
        disabled: !canZoomOut,
        visible: hasPages,
        onClick: onZoomOut,
      },
      {
        id: "tracks-zoom-in",
        icon: <ZoomInIcon sx={{ fontSize: "1.25rem" }} />,
        tooltip: labels.zoomIn,
        ariaLabel: labels.zoomIn,
        section: "top" as const,
        order: 7,
        disabled: !canZoomIn,
        visible: hasPages,
        onClick: onZoomIn,
      },
      {
        id: "tracks-select-all",
        icon: <LocalIcon icon="select-all" width="1.5rem" height="1.5rem" />,
        tooltip: labels.selectAll,
        ariaLabel: labels.selectAll,
        section: "top" as const,
        order: 10,
        disabled: !hasPages || selectedCount === totalPages,
        visible: hasPages,
        onClick: onSelectAll,
      },
      {
        id: "tracks-deselect-all",
        icon: (
          <LocalIcon
            icon="crop-square-outline"
            width="1.5rem"
            height="1.5rem"
          />
        ),
        tooltip: labels.deselectAll,
        ariaLabel: labels.deselectAll,
        section: "top" as const,
        order: 20,
        disabled: !hasSelection,
        visible: hasPages,
        onClick: onDeselectAll,
      },
      {
        id: "tracks-rotate-left",
        icon: <RotateLeftIcon sx={{ fontSize: "1.25rem" }} />,
        tooltip: labels.rotateLeft,
        ariaLabel: labels.rotateLeft,
        section: "middle" as const,
        order: 10,
        disabled: !hasSelection,
        visible: hasPages,
        onClick: () => onRotate(-90),
      },
      {
        id: "tracks-rotate-right",
        icon: <RotateRightIcon sx={{ fontSize: "1.25rem" }} />,
        tooltip: labels.rotateRight,
        ariaLabel: labels.rotateRight,
        section: "middle" as const,
        order: 20,
        disabled: !hasSelection,
        visible: hasPages,
        onClick: () => onRotate(90),
      },
      {
        id: "tracks-delete-selected",
        icon: (
          <LocalIcon
            icon="delete-outline-rounded"
            width="1.5rem"
            height="1.5rem"
          />
        ),
        tooltip: labels.deleteSelected,
        ariaLabel: labels.deleteSelected,
        section: "middle" as const,
        order: 30,
        disabled: !hasSelection,
        visible: hasPages,
        onClick: onDelete,
      },
      {
        id: "tracks-undo",
        icon: <UndoIcon sx={{ fontSize: "1.25rem" }} />,
        tooltip: labels.undo,
        ariaLabel: labels.undo,
        section: "bottom" as const,
        order: 10,
        disabled: !canUndo,
        visible: hasPages,
        onClick: onUndo,
      },
      {
        id: "tracks-redo",
        icon: <RedoIcon sx={{ fontSize: "1.25rem" }} />,
        tooltip: labels.redo,
        ariaLabel: labels.redo,
        section: "bottom" as const,
        order: 20,
        disabled: !canRedo,
        visible: hasPages,
        onClick: onRedo,
      },
      {
        id: "tracks-save",
        tooltip: labels.save,
        ariaLabel: labels.save,
        section: "bottom" as const,
        order: 30,
        disabled: !isDirty || saving,
        visible: hasPages,
        onClick: onSave,
        // Custom render for the unsaved-changes dot. A custom render also
        // bypasses the bar's own tooltip wrapper, hence the Tooltip here.
        render: ({ disabled, triggerAction }) => (
          <Tooltip content={labels.save} position="bottom" offset={6} arrow>
            <ActionIcon
              variant="quiet"
              hover={false}
              // The bar's own class carries the muted colour and 24px clamp the
              // default renderer would have applied.
              className={`workbench-bar-action-icon ${styles.saveButton}`}
              onClick={triggerAction}
              disabled={disabled}
              aria-label={labels.save}
            >
              <LocalIcon icon="save" width="1.5rem" height="1.5rem" />
              {isDirty && <span className={styles.unsavedDot} aria-hidden />}
            </ActionIcon>
          </Tooltip>
        ),
      },
    ],
    [
      labels.wrap,
      labels.zoomIn,
      labels.zoomOut,
      labels.selectAll,
      labels.deselectAll,
      labels.rotateLeft,
      labels.rotateRight,
      labels.deleteSelected,
      labels.undo,
      labels.redo,
      labels.save,
      hasPages,
      hasSelection,
      selectedCount,
      totalPages,
      canUndo,
      canRedo,
      isDirty,
      saving,
      wrap,
      onToggleWrap,
      canZoomIn,
      canZoomOut,
      onZoomIn,
      onZoomOut,
      onSelectAll,
      onDeselectAll,
      onRotate,
      onDelete,
      onUndo,
      onRedo,
      onSave,
    ],
  );

  useWorkbenchBarButtons(buttons);
}
