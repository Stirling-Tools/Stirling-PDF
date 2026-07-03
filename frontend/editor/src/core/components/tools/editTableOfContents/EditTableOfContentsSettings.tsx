import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Divider, Stack, Switch, Text, Tooltip } from "@mantine/core";
import { Button as DSButton } from "@app/ui/Button";
import { FilePicker } from "@app/ui/FilePicker";
import LocalIcon from "@app/components/shared/LocalIcon";
import { BookmarkNode } from "@app/utils/editTableOfContents";
interface EditTableOfContentsSettingsProps {
  bookmarks: BookmarkNode[];
  replaceExisting: boolean;
  onReplaceExistingChange: (value: boolean) => void;
  onSelectFiles: () => void;
  onLoadFromPdf: () => void;
  onImportJson: (file: File) => void;
  onImportClipboard: () => void;
  onExportJson: () => void;
  onExportClipboard: () => void;
  isLoading: boolean;
  loadError?: string | null;
  canReadClipboard: boolean;
  canWriteClipboard: boolean;
  disabled?: boolean;
  selectedFileName?: string;
}
export default function EditTableOfContentsSettings({
  bookmarks,
  replaceExisting,
  onReplaceExistingChange,
  onSelectFiles,
  onLoadFromPdf,
  onImportJson,
  onImportClipboard,
  onExportJson,
  onExportClipboard,
  isLoading,
  loadError,
  canReadClipboard,
  canWriteClipboard,
  disabled,
  selectedFileName,
}: EditTableOfContentsSettingsProps) {
  const { t } = useTranslation();
  const infoLines = useMemo(
    () => [
      t(
        "editTableOfContents.info.line1",
        "Each bookmark needs a descriptive title and the page it should open.",
      ),
      t(
        "editTableOfContents.info.line2",
        "Use child bookmarks to build a hierarchy for chapters, sections, or subsections.",
      ),
      t(
        "editTableOfContents.info.line3",
        "Import bookmarks from the selected PDF or from a JSON file to save time.",
      ),
    ],
    [t],
  );
  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t("editTableOfContents.actions.source", "Load bookmarks")}
        </Text>
        <Text size="xs" c="dimmed">
          {selectedFileName
            ? t("editTableOfContents.actions.selectedFile", {
                file: selectedFileName,
              })
            : t(
                "editTableOfContents.actions.noFile",
                "Select a PDF to extract existing bookmarks.",
              )}
        </Text>
      </Stack>
      <Stack gap="sm">
        <DSButton
          variant="secondary"
          leftSection={<LocalIcon icon="folder-rounded" />}
          onClick={onSelectFiles}
          fullWidth
        >
          {selectedFileName
            ? t("editTableOfContents.workbench.changeFile", "Change PDF")
            : t("editTableOfContents.workbench.selectFile", "Select PDF")}
        </DSButton>
        <Tooltip
          label={
            !selectedFileName
              ? t(
                  "editTableOfContents.actions.noFile",
                  "Select a PDF to extract existing bookmarks.",
                )
              : ""
          }
          disabled={Boolean(selectedFileName)}
        >
          <DSButton
            variant="secondary"
            leftSection={<LocalIcon icon="picture-as-pdf-rounded" />}
            onClick={onLoadFromPdf}
            loading={isLoading}
            disabled={disabled || !selectedFileName}
            fullWidth
          >
            {t("editTableOfContents.actions.loadFromPdf", "Load from PDF")}
          </DSButton>
        </Tooltip>
        <FilePicker
          onChange={(file) => file && onImportJson(file)}
          accept="application/json"
          disabled={disabled}
          variant="secondary"
          leftSection={<LocalIcon icon="upload-rounded" />}
          fullWidth
        >
          {t("editTableOfContents.actions.importJson", "Import JSON")}
        </FilePicker>
        <Tooltip
          label={
            canReadClipboard
              ? ""
              : t(
                  "editTableOfContents.actions.clipboardUnavailable",
                  "Clipboard access is not available in this browser.",
                )
          }
          disabled={canReadClipboard}
        >
          <DSButton
            variant="secondary"
            leftSection={<LocalIcon icon="content-paste-rounded" />}
            onClick={onImportClipboard}
            disabled={disabled || !canReadClipboard}
            fullWidth
          >
            {t(
              "editTableOfContents.actions.importClipboard",
              "Paste from clipboard",
            )}
          </DSButton>
        </Tooltip>
      </Stack>
      {loadError && (
        <Alert
          color="red"
          radius="md"
          icon={<LocalIcon icon="error-outline-rounded" />}
        >
          {loadError}
        </Alert>
      )}
      <Divider />
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t("editTableOfContents.actions.export", "Export bookmarks")}
        </Text>
      </Stack>
      <Stack gap="sm">
        <DSButton
          variant="secondary"
          leftSection={<LocalIcon icon="download-rounded" />}
          onClick={onExportJson}
          disabled={disabled || bookmarks.length === 0}
          fullWidth
        >
          {t("editTableOfContents.actions.exportJson", "Download JSON")}
        </DSButton>
        <Tooltip
          label={
            canWriteClipboard
              ? ""
              : t(
                  "editTableOfContents.actions.clipboardUnavailable",
                  "Clipboard access is not available in this browser.",
                )
          }
          disabled={canWriteClipboard}
        >
          <DSButton
            variant="secondary"
            leftSection={<LocalIcon icon="content-copy-rounded" />}
            onClick={onExportClipboard}
            disabled={disabled || bookmarks.length === 0 || !canWriteClipboard}
            fullWidth
          >
            {t(
              "editTableOfContents.actions.exportClipboard",
              "Copy to clipboard",
            )}
          </DSButton>
        </Tooltip>
      </Stack>
      <Divider />
      <Switch
        checked={replaceExisting}
        onChange={(event) =>
          onReplaceExistingChange(event.currentTarget.checked)
        }
        label={t(
          "editTableOfContents.settings.replaceExisting",
          "Replace existing bookmarks",
        )}
        description={t(
          "editTableOfContents.settings.replaceExistingHint",
          "When disabled, the new outline is appended after the current bookmarks.",
        )}
        disabled={disabled}
      />
      <Stack gap="xs">
        {infoLines.map((line, index) => (
          <Text key={index} size="sm" c="dimmed">
            {line}
          </Text>
        ))}
      </Stack>
    </Stack>
  );
}
