import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useWorkbenchBarButtons,
  WorkbenchBarButtonWithAction,
} from "@app/hooks/useWorkbenchBarButtons";
import { Icon } from "@app/ui/Icon";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import { useFileActionIcons } from "@app/hooks/useFileActionIcons";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Tooltip } from "@app/components/shared/Tooltip";
import styles from "@app/components/pageTracks/PageTracks.module.css";
import {
  SelectByNumberPopover,
  SelectByNumberPopoverProps,
} from "@app/components/pageTracks/SelectByNumberPopover";

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
  /** Selects every page, or clears the selection when every page is selected. */
  onToggleSelectAll: () => void;
  /** Page-number selection across every track. */
  numberSelection: Pick<
    SelectByNumberPopoverProps,
    "pages" | "maxPages" | "selectedPageIds" | "onSelect"
  >;
  onRotate: (delta: number) => void;
  onDelete: () => void;
  onInsertBlankAfter: () => void;
  onSplitAfter: () => void;
  downloadingSelection: boolean;
  /** Downloads the selected pages as one PDF per track, without saving the edits. */
  onDownloadSelected: () => void;
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
    onToggleSelectAll,
    numberSelection,
    onRotate,
    onDelete,
    onInsertBlankAfter,
    onSplitAfter,
    downloadingSelection,
    onDownloadSelected,
    onUndo,
    onRedo,
    onSave,
  } = params;
  const { t } = useTranslation();
  const terminology = useFileActionTerminology();
  const fileActionIcons = useFileActionIcons();

  const labels = {
    wrap: t("pageTracks.wrap.label", "Wrap pages"),
    zoomIn: t("pageTracks.zoomIn", "Zoom in"),
    zoomOut: t("pageTracks.zoomOut", "Zoom out"),
    selectAll: t("workbenchBar.selectAll", "Select All"),
    deselectAll: t("workbenchBar.deselectAll", "Deselect All"),
    selectByNumber: t("workbenchBar.selectByNumber", "Select by Page Numbers"),
    rotateLeft: t(
      "pageTracks.rotateSelectedLeft",
      "Rotate selected pages left",
    ),
    rotateRight: t(
      "pageTracks.rotateSelectedRight",
      "Rotate selected pages right",
    ),
    deleteSelected: t("pageTracks.deleteSelected", "Delete selected pages"),
    downloadSelected: terminology.downloadSelectedPages,
    insertBlankAfter: t(
      "pageTracks.insertBlankAfterSelected",
      "Insert blank pages after selected pages",
    ),
    splitAfter: t(
      "pageTracks.splitAfterSelected",
      "Split after selected pages",
    ),
    undo: t("pageTracks.undo", "Undo"),
    redo: t("pageTracks.redo", "Redo"),
    save: t("pageTracks.saveChanges", "Save changes to all files"),
  };

  const hasPages = totalPages > 0;
  const hasSelection = selectedCount > 0;
  const allSelected = hasPages && selectedCount === totalPages;
  const selectAllLabel = allSelected ? labels.deselectAll : labels.selectAll;

  const buttons = useMemo<WorkbenchBarButtonWithAction[]>(
    () => [
      {
        id: "tracks-wrap",
        icon: <Icon name="text-wrap" size="1.25rem" />,
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
        icon: <Icon name="zoom-out" size="1.25rem" />,
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
        icon: <Icon name="zoom-in" size="1.25rem" />,
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
        icon: <Icon name="select-all" size="1.5rem" />,
        tooltip: selectAllLabel,
        ariaLabel: selectAllLabel,
        section: "top" as const,
        order: 10,
        visible: hasPages,
        active: allSelected,
        onClick: onToggleSelectAll,
      },
      {
        id: "tracks-select-by-number",
        tooltip: labels.selectByNumber,
        ariaLabel: labels.selectByNumber,
        section: "top" as const,
        order: 15,
        visible: hasPages,
        // The popover carries its own trigger, so the bar's click action and
        // tooltip wrapper are bypassed.
        render: () => (
          <SelectByNumberPopover
            label={labels.selectByNumber}
            iconSize="1.5rem"
            className="workbench-bar-action-icon"
            {...numberSelection}
          />
        ),
      },
      {
        id: "tracks-rotate-left",
        icon: <Icon name="rotate-ccw" size="1.25rem" />,
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
        icon: <Icon name="rotate-cw" size="1.25rem" />,
        tooltip: labels.rotateRight,
        ariaLabel: labels.rotateRight,
        section: "middle" as const,
        order: 20,
        disabled: !hasSelection,
        visible: hasPages,
        onClick: () => onRotate(90),
      },
      {
        id: "tracks-insert-blank-after",
        icon: <Icon name="file-plus" size="1.25rem" />,
        tooltip: labels.insertBlankAfter,
        ariaLabel: labels.insertBlankAfter,
        section: "middle" as const,
        order: 25,
        disabled: !hasSelection,
        visible: hasPages,
        onClick: onInsertBlankAfter,
      },
      {
        id: "tracks-split-after",
        icon: <Icon name="scissors" size="1.25rem" />,
        tooltip: labels.splitAfter,
        ariaLabel: labels.splitAfter,
        section: "middle" as const,
        order: 27,
        disabled: !hasSelection,
        visible: hasPages,
        onClick: onSplitAfter,
      },
      {
        id: "tracks-delete-selected",
        icon: <Icon name="trash" size="1.5rem" />,
        tooltip: labels.deleteSelected,
        ariaLabel: labels.deleteSelected,
        section: "middle" as const,
        order: 30,
        disabled: !hasSelection,
        visible: hasPages,
        onClick: onDelete,
      },
      {
        id: "tracks-download-selected",
        icon: <Icon name={fileActionIcons.download} size="1.25rem" />,
        tooltip: labels.downloadSelected,
        ariaLabel: labels.downloadSelected,
        section: "middle" as const,
        order: 40,
        disabled: !hasSelection || downloadingSelection,
        visible: hasPages,
        onClick: onDownloadSelected,
      },
      {
        id: "tracks-undo",
        icon: <Icon name="undo-2" size="1.25rem" />,
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
        icon: <Icon name="redo-2" size="1.25rem" />,
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
              <Icon name="save" size="1.5rem" />
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
      selectAllLabel,
      allSelected,
      labels.selectByNumber,
      labels.rotateLeft,
      labels.rotateRight,
      labels.deleteSelected,
      labels.downloadSelected,
      fileActionIcons.download,
      labels.insertBlankAfter,
      labels.splitAfter,
      labels.undo,
      labels.redo,
      labels.save,
      hasPages,
      hasSelection,
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
      onToggleSelectAll,
      numberSelection,
      onRotate,
      onDelete,
      onInsertBlankAfter,
      onSplitAfter,
      downloadingSelection,
      onDownloadSelected,
      onUndo,
      onRedo,
      onSave,
    ],
  );

  useWorkbenchBarButtons(buttons);
}
