import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Divider,
  FileButton,
  Group,
  Stack,
  Switch,
  Text,
  Tooltip,
} from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { BookmarkNode } from '@app/utils/editTableOfContents';

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

  const infoLines = useMemo(() => ([
    t('editTableOfContents.info.line1', 'Each bookmark needs a descriptive title and the page it should open.'),
    t('editTableOfContents.info.line2', 'Use child bookmarks to build a hierarchy for chapters, sections, or subsections.'),
    t('editTableOfContents.info.line3', 'Import bookmarks from the selected PDF or from a JSON file to save time.'),
  ]), [t]);

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Text fw={600}>{t('editTableOfContents.actions.source', 'Load bookmarks')}</Text>
          <Button
            variant="subtle"
            color="blue"
            leftSection={<LocalIcon icon="folder-rounded" />}
            onClick={onSelectFiles}
          >
            {selectedFileName
              ? t('editTableOfContents.workbench.changeFile', 'Change PDF')
              : t('editTableOfContents.workbench.selectFile', 'Select PDF')}
          </Button>
        </Group>
        <Group gap="xs" align="center">
          <Text size="sm" c="dimmed">
            {selectedFileName
              ? t('editTableOfContents.actions.selectedFile', { file: selectedFileName })
              : t('editTableOfContents.actions.noFile', 'Select a PDF to extract existing bookmarks.')}
          </Text>
        </Group>
        <Group gap="sm" wrap="wrap">
          <Tooltip label={!selectedFileName ? t('editTableOfContents.actions.noFile', 'Select a PDF to extract existing bookmarks.') : ''} disabled={Boolean(selectedFileName)}>
            <Button
              variant="default"
              color="blue"
              leftSection={<LocalIcon icon="picture-as-pdf-rounded" />}
              onClick={onLoadFromPdf}
              loading={isLoading}
              disabled={disabled || !selectedFileName}
            >
              {t('editTableOfContents.actions.loadFromPdf', 'Load from selected PDF')}
            </Button>
          </Tooltip>
          <FileButton
            onChange={file => file && onImportJson(file)}
            accept="application/json"
            disabled={disabled}
          >
            {(props) => (
              <Button
                {...props}
                variant="outline"
                color="gray"
                leftSection={<LocalIcon icon="upload-rounded" />}
                disabled={disabled}
              >
                {t('editTableOfContents.actions.importJson', 'Import JSON')}
              </Button>
            )}
          </FileButton>
          <Tooltip
            label={canReadClipboard ? '' : t('editTableOfContents.actions.clipboardUnavailable', 'Clipboard access is not available in this browser.')}
            disabled={canReadClipboard}
          >
            <Button
              variant="outline"
              color="gray"
              leftSection={<LocalIcon icon="content-paste-rounded" />}
              onClick={onImportClipboard}
              disabled={disabled || !canReadClipboard}
            >
              {t('editTableOfContents.actions.importClipboard', 'Paste JSON from clipboard')}
            </Button>
          </Tooltip>
        </Group>
        {loadError && (
          <Alert color="red" radius="md" icon={<LocalIcon icon="error-outline-rounded" />}>
            {loadError}
          </Alert>
        )}
      </Stack>

      <Divider />

      <Stack gap="xs">
        <Text fw={600}>{t('editTableOfContents.actions.export', 'Export bookmarks')}</Text>
        <Group gap="sm" wrap="wrap">
          <Button
            variant="outline"
            color="gray"
            leftSection={<LocalIcon icon="download-rounded" />}
            onClick={onExportJson}
            disabled={disabled || bookmarks.length === 0}
          >
            {t('editTableOfContents.actions.exportJson', 'Download JSON')}
          </Button>
          <Tooltip
            label={canWriteClipboard ? '' : t('editTableOfContents.actions.clipboardUnavailable', 'Clipboard access is not available in this browser.')}
            disabled={canWriteClipboard}
          >
            <Button
              variant="outline"
              color="gray"
              leftSection={<LocalIcon icon="content-copy-rounded" />}
              onClick={onExportClipboard}
              disabled={disabled || bookmarks.length === 0 || !canWriteClipboard}
            >
              {t('editTableOfContents.actions.exportClipboard', 'Copy JSON to clipboard')}
            </Button>
          </Tooltip>
        </Group>
      </Stack>

      <Divider />

      <Switch
        checked={replaceExisting}
        onChange={(event) => onReplaceExistingChange(event.currentTarget.checked)}
        label={t('editTableOfContents.settings.replaceExisting', 'Replace existing bookmarks (uncheck to append)')}
        description={t('editTableOfContents.settings.replaceExistingHint', 'When disabled, the new outline is appended after the current bookmarks.')}
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
