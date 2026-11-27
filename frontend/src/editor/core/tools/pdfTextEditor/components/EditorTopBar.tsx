import type { ReactNode } from "react";
import { Icon } from "@editor/ui/Icon";
import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import {
  NO_SHRINK,
  type Controller,
} from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";
import { modShortcut } from "@editor/utils/hotkeys";
import "@editor/tools/pdfTextEditor/components/EditorTopBar.css";

interface EditorTopBarProps {
  controller: Controller;
  hasDocument: boolean;
  dirty: boolean;
  trail?: ReactNode;
}

/**
 * The accessibility review's bar above the pages. Editing has none; the review
 * keeps one because its panel slot exists only once its report has loaded.
 */
export function EditorTopBar({
  controller,
  hasDocument,
  dirty,
  trail,
}: EditorTopBarProps) {
  const { t } = useTranslation();

  return (
    <div className="pdf-editor-topbar" data-testid="pdf-editor-toolbar">
      {/* The viewer's own bar names the file; this only flags unsaved edits. */}
      {dirty && (
        <div className="pdf-editor-topbar__lead">
          <span
            className="pdf-editor-topbar__dirty"
            data-testid="pdf-editor-dirty-dot"
            role="status"
            aria-label={t("pdfTextEditor.unsaved", "(unsaved)")}
            title={t("pdfTextEditor.unsaved", "(unsaved)")}
          />
        </div>
      )}

      <div className="pdf-editor-topbar__band">
        <Tooltip
          label={t("pdfTextEditor.toolbar.undoTooltip", {
            defaultValue: "Undo ({{shortcut}})",
            shortcut: modShortcut("Z"),
          })}
        >
          <Button
            variant="tertiary"
            accent="neutral"
            size="sm"
            onClick={controller.onUndo}
            disabled={!hasDocument || !controller.canUndo}
            aria-label={t("pdfTextEditor.toolbar.undo", "Undo")}
            data-testid="pdf-editor-undo"
            style={NO_SHRINK}
            leftSection={<Icon name="undo-2" size={20} />}
          />
        </Tooltip>
        <Tooltip
          label={t("pdfTextEditor.toolbar.redoTooltip", {
            defaultValue: "Redo ({{shortcut}})",
            shortcut: modShortcut("Y"),
          })}
        >
          <Button
            variant="tertiary"
            accent="neutral"
            size="sm"
            onClick={controller.onRedo}
            disabled={!hasDocument || !controller.canRedo}
            aria-label={t("pdfTextEditor.toolbar.redo", "Redo")}
            data-testid="pdf-editor-redo"
            style={NO_SHRINK}
            leftSection={<Icon name="redo-2" size={20} />}
          />
        </Tooltip>
      </div>

      <div className="pdf-editor-topbar__trail">{trail}</div>
    </div>
  );
}
