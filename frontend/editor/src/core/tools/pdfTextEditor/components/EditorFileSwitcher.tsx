import { Menu, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckIcon from "@mui/icons-material/Check";
import { Button } from "@app/ui/Button";
import { useAllFiles } from "@app/contexts/FileContext";
import type { FileId } from "@app/types/file";

interface Props {
  /** Workbench file the editor currently holds, when it came from one. */
  currentFileId: FileId | null;
  /** Name shown on the chip - the open document, workbench file or not. */
  currentFileName: string;
  /** Unsaved-changes marker, shown as a dot beside the name. */
  dirty: boolean;
  // Ask the editor to open the picked file. It may refuse - a dirty document
  // gets a confirmation first - so the workbench selection is NOT moved here;
  // the editor syncs it once the open actually goes ahead.
  onPick: (file: File) => void;
}

/**
 * Which document you are editing, and how to edit a different one.
 *
 * Sits at the top-left of the toolbar because that is where a document editor
 * puts the document's name; picking from it is the same gesture as any other
 * app's file title menu. With fewer than two PDFs in the workbench there is
 * nothing to switch to, so it collapses to a plain name.
 */
export function EditorFileSwitcher({
  currentFileId,
  currentFileName,
  dirty,
  onPick,
}: Props) {
  const { t } = useTranslation();
  const { files } = useAllFiles();

  const pdfs = files.filter((f) => /\.pdf$/i.test(f.name));
  const label = (
    <span className="pdf-editor-topbar__file">
      <DescriptionIcon fontSize="small" style={{ flexShrink: 0 }} />
      <span className="pdf-editor-topbar__filename">{currentFileName}</span>
      {dirty && (
        <span
          className="pdf-editor-topbar__dirty"
          data-testid="pdf-editor-dirty-dot"
          aria-label={t("pdfTextEditor.unsaved", "(unsaved)")}
        />
      )}
    </span>
  );

  if (pdfs.length < 2) {
    return (
      <Tooltip label={currentFileName}>
        <Text
          size="xs"
          c="dimmed"
          px={6}
          data-testid="pdf-editor-filename"
          component="div"
        >
          {label}
        </Text>
      </Tooltip>
    );
  }

  return (
    <Menu shadow="md" position="bottom-start" withinPortal closeOnItemClick>
      <Menu.Target>
        <Button
          size="sm"
          variant="tertiary"
          accent="neutral"
          rightSection={<ExpandMoreIcon fontSize="small" />}
          data-testid="pdf-editor-file-switcher"
          title={currentFileName}
        >
          <span data-testid="pdf-editor-filename">{label}</span>
        </Button>
      </Menu.Target>
      <Menu.Dropdown data-testid="pdf-editor-file-switcher-menu">
        <Menu.Label>
          {t("pdfTextEditor.sidebar.document", "Document")}
        </Menu.Label>
        {pdfs.map((file) => {
          const fileId = (file as File & { fileId?: FileId }).fileId;
          const current = fileId != null && fileId === currentFileId;
          return (
            <Menu.Item
              key={fileId ?? file.name}
              leftSection={
                current ? (
                  <CheckIcon fontSize="small" />
                ) : (
                  <DescriptionIcon fontSize="small" />
                )
              }
              disabled={fileId == null}
              data-testid="pdf-editor-file-switch"
              data-current={current ? "true" : "false"}
              onClick={() => {
                if (fileId == null) return;
                onPick(file);
              }}
            >
              {file.name}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
