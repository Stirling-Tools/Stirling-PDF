import React from 'react';
import { Button, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import DownloadIcon from '@mui/icons-material/Download';
import ErrorNotification from './ErrorNotification';
import ResultsPreview from './ResultsPreview';
import { ToolOperationHook } from '../../../hooks/tools/shared/useToolOperation';

export interface ResultsToolStepProps<TParams = any> {
  isVisible: boolean;
  operation: ToolOperationHook<TParams>;
  title?: string;
  onFileClick?: (file: File) => void;
}

export function createResultsToolStep<TParams = any>(
  createStep: (title: string, props: any, children?: React.ReactNode) => React.ReactElement,
  props: ResultsToolStepProps<TParams>
): React.ReactElement {
  const { t } = useTranslation();
  const { operation } = props;
  
  const previewFiles = operation.files?.map((file, index) => ({
    file,
    thumbnail: operation.thumbnails[index]
  })) || [];

  return createStep("Results", {
    isVisible: props.isVisible
  }, (
    <Stack gap="sm">
      {operation.status && (
        <Text size="sm" c="dimmed">{operation.status}</Text>
      )}

      <ErrorNotification
        error={operation.errorMessage}
        onClose={operation.clearError}
      />

      {operation.downloadUrl && (
        <Button
          component="a"
          href={operation.downloadUrl}
          download={operation.downloadFilename}
          leftSection={<DownloadIcon />}
          color="green"
          fullWidth
          mb="md"
        >
          {t("download", "Download")}
        </Button>
      )}

      {previewFiles.length > 0 && (
        <ResultsPreview
          files={previewFiles}
          onFileClick={props.onFileClick}
          isGeneratingThumbnails={operation.isGeneratingThumbnails}
          title={props.title || "Results"}
        />
      )}
    </Stack>
  ));
}