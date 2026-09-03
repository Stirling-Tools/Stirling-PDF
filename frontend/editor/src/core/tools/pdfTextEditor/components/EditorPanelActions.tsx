import { Box, Group, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import DownloadIcon from "@mui/icons-material/FileDownloadOutlined";
import SearchIcon from "@mui/icons-material/SearchOutlined";
import HelpIcon from "@mui/icons-material/HelpOutlineOutlined";
import { EditorFileSwitcher } from "@app/tools/pdfTextEditor/components/EditorFileSwitcher";
import type { FileId } from "@app/types/file";

interface Props {
  /** Phones also lose the toolbar behind this panel, so it carries its extras. */
  compact: boolean;
  openedFileName: string | null;
  dirty: boolean;
  /** Workbench file currently open, so the switcher can mark it. */
  currentFileId: FileId | null;
  /** Open a different workbench file. */
  onPickFile: (file: File) => void;
  onSave: () => void;
  onDownload: () => void;
  onOpenFind: () => void;
  onShowHelp: () => void;
}

// The one Save, pinned to the panel foot like every other tool's primary
// action (createToolFlow's executeFooter). Extras ride along on phones only.
export function EditorPanelActions({
  compact,
  openedFileName,
  dirty,
  currentFileId,
  onPickFile,
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
      // Sticky, not flex-pinned: inside ToolPanel's ScrollArea height:100%
      // resolves to content height.
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 2,
        borderTop: "1px solid var(--mantine-color-default-border)",
        background: "var(--c-bg-raised)",
      }}
      data-testid="pdf-editor-panel-actions"
    >
      {compact && openedFileName && (
        <Group gap={6} wrap="nowrap" mb={8}>
          <EditorFileSwitcher
            currentFileId={currentFileId}
            currentFileName={openedFileName}
            dirty={dirty}
            onPick={onPickFile}
          />
        </Group>
      )}
      <Group gap="xs" wrap="nowrap">
        <Tooltip
          label={t(
            "pdfTextEditor.saveTooltip",
            "Apply changes to the file in your workspace (Ctrl+S)",
          )}
        >
          <Button
            size="sm"
            onClick={onSave}
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
            leftSection={<DownloadIcon fontSize="small" />}
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
                leftSection={<SearchIcon fontSize="small" />}
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
                leftSection={<HelpIcon fontSize="small" />}
              />
            </Tooltip>
          </>
        )}
      </Group>
    </Box>
  );
}
