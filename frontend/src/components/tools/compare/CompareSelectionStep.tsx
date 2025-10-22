import { useMemo } from 'react';
import { Badge, Card, Group, Select, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAllFiles } from '../../../contexts/FileContext';
import { formatFileSize } from '../../../utils/fileUtils';
import type { FileId } from '../../../types/file';

interface CompareSelectionStepProps {
  role: 'base' | 'comparison';
  selectedFileId: FileId | null;
  onFileSelect: (fileId: FileId | null) => void;
  disabled?: boolean;
}

export const CompareSelectionStep = ({
  role,
  selectedFileId,
  onFileSelect,
  disabled = false,
}: CompareSelectionStepProps) => {
  const { t } = useTranslation();
  const { fileStubs } = useAllFiles();

  const labels = useMemo(() => {
    if (role === 'base') {
      return {
        title: t('compare.base.label', 'Base document'),
        placeholder: t('compare.base.placeholder', 'Select a base PDF'),
      };
    }

    return {
      title: t('compare.comparison.label', 'Comparison document'),
      placeholder: t('compare.comparison.placeholder', 'Select a comparison PDF'),
    };
  }, [role, t]);

  const options = useMemo(() => {
    return fileStubs
      .filter((stub) => stub.type?.includes('pdf') || stub.name.toLowerCase().endsWith('.pdf'))
      .map((stub) => ({
        value: stub.id as unknown as string,
        label: stub.name,
      }));
  }, [fileStubs]);

  const selectedStub = useMemo(() => fileStubs.find((stub) => stub.id === selectedFileId), [fileStubs, selectedFileId]);

  const selectValue = selectedFileId ? (selectedFileId as unknown as string) : null;

  // Hide dropdown until there are files in the workbench
  if (options.length === 0) {
    return (
      <Card withBorder padding="sm" radius="md">
        <Text size="sm" c="dimmed">
          {t('compare.addFilesHint', 'Add PDFs in the Files step to enable selection.')}
        </Text>
      </Card>
    );
  }

  return (
    <Stack gap="sm">
      <Select
        data={options}
        searchable
        clearable
        value={selectValue}
        label={labels.title}
        placeholder={labels.placeholder}
        onChange={(value) => onFileSelect(value ? (value as FileId) : null)}
        nothingFoundMessage={t('compare.noFiles', 'No PDFs available yet')}
        disabled={disabled}
      />

      {selectedStub && (
        <Card withBorder padding="sm" radius="md">
          <Stack gap={4}>
            <Text fw={600} size="sm">
              {selectedStub.name}
            </Text>
            <Group gap="xs">
              <Badge color="blue" variant="light">
                {formatFileSize(selectedStub.size ?? 0)}
              </Badge>
              {selectedStub.processedFile?.totalPages && (
                <Badge color="gray" variant="light">
                  {t('compare.pageCount', '{{count}} pages', { count: selectedStub.processedFile.totalPages })}
                </Badge>
              )}
            </Group>
            {selectedStub.lastModified && (
              <Text size="xs" c="dimmed">
                {t('compare.lastModified', 'Last modified')}{' '}
                {new Date(selectedStub.lastModified).toLocaleString()}
              </Text>
            )}
          </Stack>
        </Card>
      )}
    </Stack>
  );
};

export default CompareSelectionStep;
