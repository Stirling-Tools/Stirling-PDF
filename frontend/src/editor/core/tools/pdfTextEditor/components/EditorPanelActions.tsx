import { memo } from "react";
import { Box, Group, Tooltip } from "@mantine/core";
import { Icon } from "@editor/ui/Icon";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { modShortcut } from "@editor/utils/hotkeys";
import "@editor/tools/pdfTextEditor/components/EditorTopBar.css";

interface Props {
  compact: boolean;
  dirty: boolean;
  onSave: () => void;
  onDownload: () => void;
  onOpenFind: () => void;
  onShowHelp: () => void;
}

export const EditorPanelActions = memo(function EditorPanelActions({
  compact,
  dirty,
  onSave,
  onDownload,
  onOpenFind,
  onShowHelp,
}: Props) {
  const { t } = useTranslation();
  return (
    <Box
      px="md"
      py="sm"
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 2,
        borderTop: "1px solid var(--mantine-color-default-border)",
        background: "var(--c-bg-raised)",
      }}
      data-testid="pdf-editor-panel-actions"
    >
      <Group gap="xs" wrap="nowrap">
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
            data-testid="pdf-editor-save"
            style={{ flex: 1, minWidth: 0 }}
            // Phones show the unsaved dot by the file name instead.
            rightSection={
              dirty && !compact ? (
                <span
                  className="pdf-editor-topbar__dirty"
                  data-testid="pdf-editor-dirty-dot"
                  role="status"
                  aria-label={t("pdfTextEditor.unsaved", "(unsaved)")}
                  title={t("pdfTextEditor.unsaved", "(unsaved)")}
                />
              ) : undefined
            }
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
