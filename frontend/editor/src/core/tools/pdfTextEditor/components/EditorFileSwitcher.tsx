import { Menu, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { useAllFiles } from "@app/contexts/FileContext";
import type { FileId } from "@app/types/file";

interface Props {
  /** Workbench file the editor currently holds, when it came from one. */
  currentFileId: FileId | null;
  currentFileName: string;
  dirty: boolean;
  onPick: (file: File) => void;
  /** Remove a document from the workbench, from its row in the menu. */
  onClose?: (file: File) => void;
  /** Leave for the Active Files view. */
  onViewActiveFiles?: () => void;
}

export function EditorFileSwitcher({
  currentFileId,
  currentFileName,
  dirty,
  onPick,
  onClose,
  onViewActiveFiles,
}: Props) {
  const { t } = useTranslation();
  const { files, fileStubs } = useAllFiles();
  // A rename lands on the stored record; the File object keeps its old name.
  const nameOf = (file: File) =>
    fileStubs.find((s) => s.id === (file as File & { fileId?: FileId }).fileId)
      ?.name ?? file.name;

  const pdfs = files.filter((f) => /\.pdf$/i.test(f.name));
  const label = (
    <span className="pdf-editor-topbar__file">
      <Icon name="file-text" size={20} style={{ flexShrink: 0 }} />
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

  // A menu still earns its place with one file when it also closes it or
  // leads to the file list.
  if (pdfs.length < 2 && !onClose && !onViewActiveFiles) {
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
          rightSection={<Icon name="chevron-down" size={20} />}
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
                  <Icon name="check" size={20} />
                ) : (
                  <Icon name="file-text" size={20} />
                )
              }
              disabled={fileId == null}
              data-testid="pdf-editor-file-switch"
              data-current={current ? "true" : "false"}
              onClick={() => {
                if (fileId == null || current) return;
                onPick(file);
              }}
              rightSection={
                onClose && fileId != null ? (
                  <Tooltip
                    label={t("pdfTextEditor.fileSwitcher.close", "Close")}
                  >
                    <ActionIcon
                      size="sm"
                      variant="tertiary"
                      aria-label={t("pdfTextEditor.fileSwitcher.closeFile", {
                        defaultValue: "Close {{name}}",
                        name: nameOf(file),
                      })}
                      data-testid="pdf-editor-file-close"
                      onClick={(e) => {
                        // Closing a row must not also switch to it.
                        e.stopPropagation();
                        onClose(file);
                      }}
                    >
                      <Icon name="x" size={14} />
                    </ActionIcon>
                  </Tooltip>
                ) : undefined
              }
            >
              {nameOf(file)}
            </Menu.Item>
          );
        })}
        {onViewActiveFiles && (
          <>
            <Menu.Divider />
            <Menu.Item
              leftSection={<Icon name="folder" size={20} />}
              onClick={onViewActiveFiles}
              data-testid="pdf-editor-view-active-files"
            >
              {t(
                "pdfTextEditor.fileSwitcher.viewActiveFiles",
                "View active files",
              )}
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
