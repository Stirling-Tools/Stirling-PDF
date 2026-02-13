import { useCallback, useMemo } from 'react';
import { Alert, Button, Group, Loader, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { GetPdfInfoOperationHook } from '@app/hooks/tools/getPdfInfo/useGetPdfInfoOperation';
import { downloadFile } from '@app/services/downloadService';

interface GetPdfInfoResultsProps {
  operation: GetPdfInfoOperationHook;
  isLoading: boolean;
  errorMessage: string | null;
}

const findFileByExtension = (files: File[], extension: string) => {
  return files.find((file) => file.name.toLowerCase().endsWith(extension));
};

const GetPdfInfoResults = ({ operation, isLoading, errorMessage }: GetPdfInfoResultsProps) => {
  const { t } = useTranslation();

  const jsonFile = useMemo(() => findFileByExtension(operation.files, '.json'), [operation.files]);
  const selectedFile = useMemo(() => jsonFile ?? null, [jsonFile]);
  const selectedDownloadLabel = useMemo(() => t('getPdfInfo.downloadJson', 'Download JSON'), [t]);

  const handleDownload = useCallback((file: File) => {
    void downloadFile({ data: file, filename: file.name });
  }, []);

  if (isLoading && operation.results.length === 0) {
    return (
      <Group justify="center" gap="sm" py="md">
        <Loader size="sm" />
        <Text>{t('getPdfInfo.processing', 'Extracting information...')}</Text>
      </Group>
    );
  }

  if (!isLoading && operation.results.length === 0) {
    return (
      <Alert color="gray" variant="light" title={t('getPdfInfo.results', 'Results')}>
        <Text size="sm">{t('getPdfInfo.noResults', 'Run the tool to generate a report.')}</Text>
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {/* No background post-processing once JSON is ready */}
      {errorMessage && (
        <Alert color="yellow" variant="light">
          <Text size="sm">{errorMessage}</Text>
        </Alert>
      )}

      <Stack gap="xs">
        <Text size="sm" fw={600}>
          {t('getPdfInfo.downloads', 'Downloads')}
        </Text>
        <Button
          color="blue"
          onClick={() => selectedFile && handleDownload(selectedFile)}
          disabled={!selectedFile}
          fullWidth
        >
          {selectedDownloadLabel}
        </Button>
      </Stack>
    </Stack>
  );
};

export default GetPdfInfoResults;

