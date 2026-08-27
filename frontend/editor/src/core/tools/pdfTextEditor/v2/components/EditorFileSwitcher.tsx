import { Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
import { Button } from "@app/ui/Button";
import { useAllFiles, useFileSelection } from "@app/contexts/FileContext";
import type { FileId } from "@app/types/file";

interface Props {
  /** Workbench file the editor currently holds, when it came from one. */
  currentFileId: FileId | null;
  /** Open the picked file; the editor never follows the selection on its own. */
  onPick: (file: File) => void;
}

/**
 * Switch which workbench file the editor is editing.
 *
 * The editor owns the whole canvas, so the workbench's own Active Files grid is
 * a view away; without this the user can open the tool with several files
 * loaded and have no way to say which one to edit. Picking here sets the
 * workbench selection rather than loading directly, so the rest of the app
 * agrees about which file is being worked on.
 */
export function EditorFileSwitcher({ currentFileId, onPick }: Props) {
  const { t } = useTranslation();
  const { files } = useAllFiles();
  const { setSelectedFiles } = useFileSelection();

  const pdfs = files.filter((f) => /\.pdf$/i.test(f.name));
  if (pdfs.length < 2) return null;

  return (
    <Stack gap={4} data-testid="v2-file-switcher">
      <Text size="xs" fw={600} c="dimmed" style={{ letterSpacing: "0.4px" }}>
        {t("pdfTextEditorV2.sidebar.document", "Document")}
      </Text>
      {pdfs.map((file) => {
        const fileId = (file as File & { fileId?: FileId }).fileId;
        const current = fileId != null && fileId === currentFileId;
        return (
          <Button
            key={fileId ?? file.name}
            size="sm"
            fullWidth
            justify="start"
            overflow="hidden"
            variant={current ? "primary" : "secondary"}
            accent={current ? "default" : "neutral"}
            leftSection={<DescriptionIcon fontSize="small" />}
            title={file.name}
            data-testid="v2-file-switch"
            data-current={current ? "true" : "false"}
            disabled={fileId == null}
            onClick={() => {
              if (fileId == null) return;
              setSelectedFiles([fileId]);
              onPick(file);
            }}
          >
            {file.name}
          </Button>
        );
      })}
    </Stack>
  );
}
