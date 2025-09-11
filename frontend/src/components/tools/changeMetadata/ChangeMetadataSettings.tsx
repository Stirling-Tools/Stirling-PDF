import { Stack, TextInput, Select, Checkbox, Button, Group, Divider, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { ChangeMetadataParameters } from "../../../hooks/tools/changeMetadata/useChangeMetadataParameters";
import { TrappedStatus } from "../../../types/metadata";
import { PDFMetadataService } from "../../../services/pdfMetadataService";
import { useSelectedFiles } from "../../../contexts/file/fileHooks";

interface ChangeMetadataSettingsProps {
  parameters: ChangeMetadataParameters;
  onParameterChange: <K extends keyof ChangeMetadataParameters>(key: K, value: ChangeMetadataParameters[K]) => void;
  disabled?: boolean;
  addCustomMetadata: (key?: string, value?: string) => void;
  removeCustomMetadata: (id: string) => void;
  updateCustomMetadata: (id: string, key: string, value: string) => void;
}


const ChangeMetadataSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  addCustomMetadata,
  removeCustomMetadata,
  updateCustomMetadata
}: ChangeMetadataSettingsProps) => {
  const { t } = useTranslation();
  const { selectedFiles } = useSelectedFiles();
  const [isExtractingMetadata, setIsExtractingMetadata] = useState(false);
  const [hasExtractedMetadata, setHasExtractedMetadata] = useState(false);

  const isDeleteAllEnabled = parameters.deleteAll;
  const fieldsDisabled = disabled || isDeleteAllEnabled || isExtractingMetadata;

  // Extract metadata from first file when files change
  useEffect(() => {
    const extractMetadata = async () => {
      if (selectedFiles.length === 0 || hasExtractedMetadata) {
        return;
      }

      const firstFile = selectedFiles[0];
      if (!firstFile) {
        return;
      }

      setIsExtractingMetadata(true);
      try {
        const result = await PDFMetadataService.extractMetadata(firstFile);

        if (result.success) {
          const metadata = result.metadata;

          // Pre-populate all fields with extracted metadata
          onParameterChange('title', metadata.title);
          onParameterChange('author', metadata.author);
          onParameterChange('subject', metadata.subject);
          onParameterChange('keywords', metadata.keywords);
          onParameterChange('creator', metadata.creator);
          onParameterChange('producer', metadata.producer);
          onParameterChange('creationDate', metadata.creationDate);
          onParameterChange('modificationDate', metadata.modificationDate);
          onParameterChange('trapped', metadata.trapped);

          // Set custom metadata entries directly to avoid state update timing issues
          onParameterChange('customMetadata', metadata.customMetadata);

          setHasExtractedMetadata(true);
        }
      } catch (error) {
        console.warn('Failed to extract metadata:', error);
      } finally {
        setIsExtractingMetadata(false);
      }
    };

    extractMetadata();
  }, [selectedFiles, hasExtractedMetadata, onParameterChange, addCustomMetadata, updateCustomMetadata, removeCustomMetadata, parameters.customMetadata]);

  return (
    <Stack gap="md">
      {/* Delete All Option */}
      <Checkbox
        label={t('changeMetadata.deleteAll.label', 'Delete all metadata')}
        description={t('changeMetadata.deleteAll.description', 'Remove all metadata from the PDF document')}
        checked={parameters.deleteAll}
        onChange={(e) => onParameterChange('deleteAll', e.target.checked)}
        disabled={disabled}
      />

      <Divider />

      {/* Standard Metadata Fields */}
      <Stack gap="md">
        <Text size="sm" fw={500}>
          {t('changeMetadata.standardFields.title', 'Standard Metadata')}
        </Text>

        <TextInput
          label={t('changeMetadata.title.label', 'Title')}
          placeholder={t('changeMetadata.title.placeholder', 'Document title')}
          value={parameters.title}
          onChange={(e) => onParameterChange('title', e.target.value)}
          disabled={fieldsDisabled}
        />

        <TextInput
          label={t('changeMetadata.author.label', 'Author')}
          placeholder={t('changeMetadata.author.placeholder', 'Document author')}
          value={parameters.author}
          onChange={(e) => onParameterChange('author', e.target.value)}
          disabled={fieldsDisabled}
        />

        <TextInput
          label={t('changeMetadata.subject.label', 'Subject')}
          placeholder={t('changeMetadata.subject.placeholder', 'Document subject')}
          value={parameters.subject}
          onChange={(e) => onParameterChange('subject', e.target.value)}
          disabled={fieldsDisabled}
        />

        <TextInput
          label={t('changeMetadata.keywords.label', 'Keywords')}
          placeholder={t('changeMetadata.keywords.placeholder', 'Document keywords')}
          value={parameters.keywords}
          onChange={(e) => onParameterChange('keywords', e.target.value)}
          disabled={fieldsDisabled}
        />

        <TextInput
          label={t('changeMetadata.creator.label', 'Creator')}
          placeholder={t('changeMetadata.creator.placeholder', 'Document creator')}
          value={parameters.creator}
          onChange={(e) => onParameterChange('creator', e.target.value)}
          disabled={fieldsDisabled}
        />

        <TextInput
          label={t('changeMetadata.producer.label', 'Producer')}
          placeholder={t('changeMetadata.producer.placeholder', 'Document producer')}
          value={parameters.producer}
          onChange={(e) => onParameterChange('producer', e.target.value)}
          disabled={fieldsDisabled}
        />

        <Divider />

        {/* Date Fields */}
        <Text size="sm" fw={500}>
          {t('changeMetadata.dates.title', 'Document Dates')}
        </Text>
        <Text size="xs" c="dimmed">
          {t('changeMetadata.dates.format', 'Format: yyyy/MM/dd HH:mm:ss')}
        </Text>

        <TextInput
          label={t('changeMetadata.creationDate.label', 'Creation Date')}
          placeholder={t('changeMetadata.creationDate.placeholder', 'e.g. 2025/01/17 14:30:00')}
          value={parameters.creationDate}
          onChange={(e) => onParameterChange('creationDate', e.target.value)}
          disabled={fieldsDisabled}
        />

        <TextInput
          label={t('changeMetadata.modificationDate.label', 'Modification Date')}
          placeholder={t('changeMetadata.modificationDate.placeholder', 'e.g. 2025/01/17 14:30:00')}
          value={parameters.modificationDate}
          onChange={(e) => onParameterChange('modificationDate', e.target.value)}
          disabled={fieldsDisabled}
        />

        {/* Trapped Status */}
        <Select
          label={t('changeMetadata.trapped.label', 'Trapped Status')}
          description={t('changeMetadata.trapped.description', 'Indicates whether the document has been trapped for high-quality printing')}
          value={parameters.trapped}
          onChange={(value) => {
            if (value) {
              onParameterChange('trapped', value as TrappedStatus);
            }
          }}
          disabled={fieldsDisabled}
          data={[
            { value: TrappedStatus.UNKNOWN, label: t('changeMetadata.trapped.unknown', 'Unknown') },
            { value: TrappedStatus.TRUE, label: t('changeMetadata.trapped.true', 'True') },
            { value: TrappedStatus.FALSE, label: t('changeMetadata.trapped.false', 'False') }
          ]}
        />

        <Divider />

        {/* Custom Metadata */}
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Text size="sm" fw={500}>
              {t('changeMetadata.customFields.title', 'Custom Metadata')}
            </Text>
            <Button
              size="xs"
              variant="light"
              onClick={() => addCustomMetadata()}
              disabled={fieldsDisabled}
            >
              {t('changeMetadata.customFields.add', 'Add Field')}
            </Button>
          </Group>

          {parameters.customMetadata.length > 0 && (
            <Text size="xs" c="dimmed">
              {t('changeMetadata.customFields.description', 'Add custom metadata fields to the document')}
            </Text>
          )}

          {parameters.customMetadata.map((entry) => (
            <Stack key={entry.id} gap="xs">
              <TextInput
                placeholder={t('changeMetadata.customFields.keyPlaceholder', 'Custom key')}
                value={entry.key}
                onChange={(e) => updateCustomMetadata(entry.id, e.target.value, entry.value)}
                disabled={fieldsDisabled}
              />
              <TextInput
                placeholder={t('changeMetadata.customFields.valuePlaceholder', 'Custom value')}
                value={entry.value}
                onChange={(e) => updateCustomMetadata(entry.id, entry.key, e.target.value)}
                disabled={fieldsDisabled}
              />
              <Button
                size="xs"
                variant="light"
                color="red"
                onClick={() => removeCustomMetadata(entry.id)}
                disabled={fieldsDisabled}
              >
                {t('changeMetadata.customFields.remove', 'Remove')}
              </Button>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
};

export default ChangeMetadataSettings;
