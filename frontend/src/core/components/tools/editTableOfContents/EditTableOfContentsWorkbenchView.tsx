import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Card,
  Divider,
  Group,
  Stack,
  Text,
} from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { BookmarkNode } from '@app/utils/editTableOfContents';
import ErrorNotification from '@app/components/tools/shared/ErrorNotification';
import ResultsPreview from '@app/components/tools/shared/ResultsPreview';
import BookmarkEditor from '@app/components/tools/editTableOfContents/BookmarkEditor';
import { useFileActionTerminology } from '@app/hooks/useFileActionTerminology';
import { downloadFromUrl } from '@app/services/downloadService';

export interface EditTableOfContentsWorkbenchViewData {
  bookmarks: BookmarkNode[];
  selectedFileName?: string;
  disabled: boolean;
  files: File[];
  thumbnails: (string | undefined)[];
  downloadUrl: string | null;
  downloadFilename: string | null;
  errorMessage: string | null;
  isGeneratingThumbnails: boolean;
  isExecuteDisabled: boolean;
  isExecuting: boolean;
  onClearError: () => void;
  onBookmarksChange: (bookmarks: BookmarkNode[]) => void;
  onExecute: () => void;
  onUndo: () => void;
  onFileClick: (file: File) => void;
}

interface EditTableOfContentsWorkbenchViewProps {
  data: EditTableOfContentsWorkbenchViewData | null;
}

const EditTableOfContentsWorkbenchView = ({ data }: EditTableOfContentsWorkbenchViewProps) => {
  const { t } = useTranslation();
  const terminology = useFileActionTerminology();

  if (!data) {
    return (
      <Box p="xl">
        <Card withBorder radius="md">
          <Stack gap="sm">
            <Text fw={600}>{t('editTableOfContents.workbench.empty.title', 'Open the tool to start editing')}</Text>
            <Text size="sm" c="dimmed">
              {t('editTableOfContents.workbench.empty.description', 'Select the Edit Table of Contents tool to load its workspace.')}
            </Text>
          </Stack>
        </Card>
      </Box>
    );
  }

  const {
    bookmarks,
    selectedFileName,
    disabled,
    files,
    thumbnails,
    downloadUrl,
    downloadFilename,
    errorMessage,
    isGeneratingThumbnails,
    isExecuteDisabled,
    isExecuting,
    onClearError,
    onBookmarksChange,
    onExecute,
    onUndo,
    onFileClick,
  } = data;

  const previewFiles = useMemo(
    () =>
      files?.map((file, index) => ({
        file,
        thumbnail: thumbnails[index],
      })) ?? [],
    [files, thumbnails]
  );

  const showResults = Boolean(
    previewFiles.length > 0 || downloadUrl || errorMessage
  );

  return (
    <Box
      p="lg"
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        background: 'var(--bg-raised)',
      }}
    >
      <Stack gap="xl" maw={1200} mx="auto">
        <Stack gap={4}>
          <Text size="xl" fw={700}>
            {t('home.editTableOfContents.title', 'Edit Table of Contents')}
          </Text>
          <Text size="sm" c="dimmed">
            {t('editTableOfContents.workbench.subtitle', 'Import bookmarks, build hierarchies, and apply the outline without cramped side panels.')}
          </Text>
        </Stack>

        <Card
          withBorder
          radius="md"
          p="xl"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-default)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <Stack gap="md">
            <Stack gap={2}>
              <Text fw={600}>{t('editTableOfContents.editor.heading', 'Bookmark editor')}</Text>
              <Text size="sm" c="dimmed">
                {selectedFileName
                  ? t('editTableOfContents.actions.selectedFile', { file: selectedFileName })
                  : t('editTableOfContents.workbench.filePrompt', 'Select a PDF from your library or upload a new one to begin.')}
              </Text>
            </Stack>
            <BookmarkEditor bookmarks={bookmarks} onChange={onBookmarksChange} disabled={disabled} />
            <Divider />
            <Group justify="flex-end">
              <Button
                leftSection={<LocalIcon icon="menu-book-rounded" />}
                color="blue"
                onClick={onExecute}
                disabled={isExecuteDisabled}
                loading={isExecuting}
              >
                {t('editTableOfContents.submit', 'Apply table of contents')}
              </Button>
            </Group>
          </Stack>
        </Card>

        {showResults && (
          <Card
            withBorder
            radius="md"
            p="xl"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-default)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <Stack gap="md">
              <Stack gap={4}>
                <Text fw={600}>{t('editTableOfContents.results.title', 'Updated PDF with bookmarks')}</Text>
                <Text size="sm" c="dimmed">
                  {t('editTableOfContents.results.subtitle', 'Download the processed file or undo the operation below.')}
                </Text>
              </Stack>

              <ErrorNotification error={errorMessage} onClose={onClearError} />

              {previewFiles.length > 0 && (
                <ResultsPreview
                  files={previewFiles}
                  onFileClick={onFileClick}
                  isGeneratingThumbnails={isGeneratingThumbnails}
                />
              )}

              <Group justify="flex-end" gap="sm">
                {downloadUrl && (
                  <Button
                    leftSection={<LocalIcon icon='download-rounded' />}
                    onClick={() => downloadFromUrl(downloadUrl, downloadFilename ?? "download")}
                  >
                    {terminology.download}
                  </Button>
                )}
                <Button
                  variant="outline"
                  leftSection={<LocalIcon icon="rotate-left" />}
                  onClick={onUndo}
                  disabled={isExecuting}
                >
                  {t('undo', 'Undo')}
                </Button>
              </Group>
            </Stack>
          </Card>
        )}
      </Stack>
    </Box>
  );
};

export default EditTableOfContentsWorkbenchView;
