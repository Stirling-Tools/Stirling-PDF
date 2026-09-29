import { Tooltip } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";
import styles from "@app/components/pageEditor/PageEditorControls.module.css";

interface PageEditorControlsProps {
  // Close/Reset functions
  onClosePdf: () => void;

  // Undo/Redo
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Page operations
  onRotate: (direction: "left" | "right") => void;
  onDelete: () => void;
  onSplit: () => void;
  onSplitAll: () => void;
  onPageBreak: () => void;
  onPageBreakAll: () => void;

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
}: PageEditorControlsProps) => {
  const { t } = useTranslation();
  // Calculate split tooltip text using smart toggle logic
  const getSplitTooltip = () => {
    if (!splitPositions || !displayDocument || selectedPageIds.length === 0) {
      return "Split Selected";
    }

    const totalPages = displayDocument.pages.length;
    const selectedValidPageIds = displayDocument.pages
      .filter(
        (page, index) =>
          selectedPageIds.includes(page.id) && index < totalPages - 1,
      )
      .map((page) => page.id);

    if (selectedValidPageIds.length === 0) {
      return "Split Selected";
    }

    const existingSplitsCount = selectedValidPageIds.filter((id) =>
      splitPositions.has(id),
    ).length;
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
      ? `Insert ${selectedPageIds.length} Page Break${selectedPageIds.length > 1 ? "s" : ""}`
      : "Insert Page Breaks";
  };

  return (
    <div className={styles.dock}>
      <div className={styles.bar}>
        {/* Undo/Redo */}
        <Tooltip label={t("pageEditor.toolbar.undo", "Undo")}>
          <ActionIcon
            variant="tertiary"
            size="md"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label={t("pageEditor.toolbar.undo", "Undo")}
          >
            <Icon name="undo-2" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t("pageEditor.toolbar.redo", "Redo")}>
          <ActionIcon
            variant="tertiary"
            size="md"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label={t("pageEditor.toolbar.redo", "Redo")}
          >
            <Icon name="redo-2" />
          </ActionIcon>
        </Tooltip>

        <div className={styles.divider} />

        {/* Page Operations */}
        <Tooltip
          label={t("pageEditor.toolbar.rotateLeft", "Rotate Selected Left")}
        >
          <ActionIcon
            variant="tertiary"
            size="md"
            onClick={() => onRotate("left")}
            disabled={selectedPageIds.length === 0}
            aria-label={t(
              "pageEditor.toolbar.rotateLeft",
              "Rotate Selected Left",
            )}
          >
            <Icon name="rotate-ccw" />
          </ActionIcon>
        </Tooltip>
        <Tooltip
          label={t("pageEditor.toolbar.rotateRight", "Rotate Selected Right")}
        >
          <ActionIcon
            variant="tertiary"
            size="md"
            onClick={() => onRotate("right")}
            disabled={selectedPageIds.length === 0}
            aria-label={t(
              "pageEditor.toolbar.rotateRight",
              "Rotate Selected Right",
            )}
          >
            <Icon name="rotate-cw" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t("pageEditor.toolbar.delete", "Delete Selected")}>
          <ActionIcon
            variant="tertiary"
            size="md"
            onClick={onDelete}
            disabled={selectedPageIds.length === 0}
            aria-label={t("pageEditor.toolbar.delete", "Delete Selected")}
          >
            <Icon name="trash" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={getSplitTooltip()}>
          <ActionIcon
            variant="tertiary"
            size="md"
            onClick={onSplit}
            disabled={selectedPageIds.length === 0}
            aria-label={getSplitTooltip()}
          >
            <Icon name="scissors" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={getPageBreakTooltip()}>
          <ActionIcon
            variant="tertiary"
            size="md"
            onClick={onPageBreak}
            disabled={selectedPageIds.length === 0}
            aria-label={getPageBreakTooltip()}
          >
            <Icon name="square-split-vertical" />
          </ActionIcon>
        </Tooltip>
      </div>
    </div>
  );
};

export default PageEditorControls;
