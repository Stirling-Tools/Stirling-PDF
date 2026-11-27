import { memo } from "react";
import { Box, Group, Tooltip } from "@mantine/core";
import { Icon } from "@editor/ui/Icon";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { modShortcut } from "@editor/utils/hotkeys";
import { ToolIconButton } from "@editor/tools/pdfTextEditor/components/ToolIconButton";
import { useHistoryFlags } from "@editor/tools/pdfTextEditor/hooks/useToolbarController";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import "@editor/tools/pdfTextEditor/components/EditorTopBar.css";

interface Props {
  store: EditorStore;
  compact: boolean;
  dirty: boolean;
  onSave: () => void;
  onDownload: () => void;
  onOpenFind: () => void;
  onShowHelp: () => void;
}

export const EditorPanelActions = memo(function EditorPanelActions({
  store,
  compact,
  dirty,
  onSave,
  onDownload,
  onOpenFind,
  onShowHelp,
}: Props) {
  const { t } = useTranslation();
  const history = useHistoryFlags(store);
  return (
    <Box
      px="md"
      py="sm"
      style={{
        position: "sticky",
        bottom: 0,
        // Pinned to the panel's foot even when what is above it is short.
        marginTop: "auto",
        zIndex: 2,
        borderTop: "1px solid var(--mantine-color-default-border)",
        background: "var(--c-bg-raised)",
      }}
      data-testid="pdf-editor-panel-actions"
    >
      <Group gap="xs" wrap="nowrap">
        {/* Phones undo from their own top bar. */}
        {!compact && (
          // With the row's xs gap, the same 1rem after the pair as the padding before it.
          <Group gap={2} wrap="nowrap" style={{ marginInlineEnd: "0.75rem" }}>
            <ToolIconButton
              label={t("pdfTextEditor.toolbar.undo", "Undo")}
              icon="undo-2"
              onClick={() => store.undo()}
              testId="pdf-editor-undo"
              disabled={!history.canUndo}
              tooltip={t("pdfTextEditor.toolbar.undoTooltip", {
                defaultValue: "Undo ({{shortcut}})",
                shortcut: modShortcut("Z"),
              })}
            />
            <ToolIconButton
              label={t("pdfTextEditor.toolbar.redo", "Redo")}
              icon="redo-2"
              onClick={() => store.redo()}
              testId="pdf-editor-redo"
              disabled={!history.canRedo}
              tooltip={t("pdfTextEditor.toolbar.redoTooltip", {
                defaultValue: "Redo ({{shortcut}})",
                shortcut: modShortcut("Y"),
              })}
            />
          </Group>
        )}
        <Tooltip
          label={t("pdfTextEditor.saveTooltip", {
            defaultValue:
              "Apply changes to the file in your workspace ({{shortcut}})",
            shortcut: modShortcut("S"),
          })}
        >
          <Button
            size="sm"
            onClick={onSave}
            // Live only once there is something to save, which is itself the
            // sign of unsaved edits.
            disabled={!dirty}
            data-testid="pdf-editor-save"
            style={{ flex: 1, minWidth: 0 }}
          >
            {t("pdfTextEditor.save", "Save PDF")}
          </Button>
        </Tooltip>
        <Tooltip
          label={t(
            "pdfTextEditor.downloadTooltip",
            "Save and download the edited PDF",
          )}
        >
          <Button
            size="sm"
            variant="secondary"
            accent="neutral"
            onClick={onDownload}
            data-testid="pdf-editor-download"
            aria-label={t("pdfTextEditor.download", "Download")}
            leftSection={<Icon name="download" size={20} />}
          />
        </Tooltip>
        {compact && (
          <>
            <Tooltip
              label={t("pdfTextEditor.settings.find", "Find in document")}
            >
              <Button
                size="sm"
                variant="secondary"
                accent="neutral"
                onClick={onOpenFind}
                data-testid="pdf-editor-open-find-panel"
                aria-label={t(
                  "pdfTextEditor.settings.find",
                  "Find in document",
                )}
                leftSection={<Icon name="search" size={20} />}
              />
            </Tooltip>
            <Tooltip
              label={t("pdfTextEditor.help.ariaLabel", "Keyboard shortcuts")}
            >
              <Button
                size="sm"
                variant="secondary"
                accent="neutral"
                onClick={onShowHelp}
                data-testid="pdf-editor-help-panel"
                aria-label={t(
                  "pdfTextEditor.help.ariaLabel",
                  "Keyboard shortcuts",
                )}
                leftSection={<Icon name="circle-question-mark" size={20} />}
              />
            </Tooltip>
          </>
        )}
      </Group>
    </Box>
  );
});
