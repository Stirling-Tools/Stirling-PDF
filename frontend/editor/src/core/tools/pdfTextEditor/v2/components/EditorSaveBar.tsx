import { Box, Group, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import DownloadIcon from "@mui/icons-material/FileDownloadOutlined";
import { EditorFileSwitcher } from "@app/tools/pdfTextEditor/v2/components/EditorFileSwitcher";
import type { FileId } from "@app/types/file";

interface Props {
  openedFileName: string | null;
  dirty: boolean;
  /** Workbench file currently open, so the switcher can mark it. */
  currentFileId: FileId | null;
  /** Open a different workbench file. */
  onPickFile: (file: File) => void;
  onSave: () => void;
  onDownload: () => void;
}

/**
 * Pinned footer: what file you are editing, and the one action that finishes.
 *
 * Save is the primary verb - it lands the edit back in the workbench like
 * every other tool. Download is the same save plus a file, so it rides along
 * as a subordinate icon rather than a second full-width button competing for
 * the same attention.
 */
export function EditorSaveBar({
  openedFileName,
  dirty,
  currentFileId,
  onPickFile,
  onSave,
  onDownload,
}: Props) {
  const { t } = useTranslation();
  return (
    <Box
      px="md"
      py="sm"
      // Sticky, not flex-pinned: the tool renders inside ToolPanel's own
      // ScrollArea, where height:100% resolves to content height, so a
      // flex-column footer would just sit wherever the content ended.
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 2,
        borderTop: "1px solid var(--mantine-color-default-border)",
        background: "var(--c-bg-raised)",
      }}
    >
      {/* Choosing which file to edit is navigation, not a document fact, so it
          stays reachable here rather than behind the Document tab. Renders
          nothing until the workbench holds more than one PDF. */}
      <EditorFileSwitcher currentFileId={currentFileId} onPick={onPickFile} />
      {openedFileName && (
        // The name truncates but the unsaved marker must not, so it sits in
        // its own non-shrinking element rather than inside the ellipsis.
        <Group gap={6} wrap="nowrap" mb={8} data-testid="v2-filename">
          <Text
            size="xs"
            c="dimmed"
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={openedFileName}
          >
            {openedFileName}
          </Text>
          {dirty && (
            <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
              {t("pdfTextEditorV2.unsaved", "(unsaved)")}
            </Text>
          )}
        </Group>
      )}
      <Group gap="xs" wrap="nowrap">
        <Tooltip
          label={t(
            "pdfTextEditorV2.saveTooltip",
            "Apply changes to the file in your workspace (Ctrl+S)",
          )}
        >
          <Button
            size="sm"
            onClick={onSave}
            data-testid="v2-save"
            style={{ flex: 1, minWidth: 0 }}
          >
            {t("pdfTextEditorV2.save", "Save PDF")}
          </Button>
        </Tooltip>
        <Tooltip
          label={t(
            "pdfTextEditorV2.downloadTooltip",
            "Save and download the edited PDF",
          )}
        >
          <Button
            size="sm"
            variant="secondary"
            accent="neutral"
            onClick={onDownload}
            data-testid="v2-download"
            aria-label={t("pdfTextEditorV2.download", "Download")}
            leftSection={<DownloadIcon fontSize="small" />}
          />
        </Tooltip>
      </Group>
    </Box>
  );
}
