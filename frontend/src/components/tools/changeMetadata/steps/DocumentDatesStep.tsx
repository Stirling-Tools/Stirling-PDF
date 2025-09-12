import { Stack, Text } from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useTranslation } from "react-i18next";
import { ChangeMetadataParameters } from "../../../../hooks/tools/changeMetadata/useChangeMetadataParameters";

interface DocumentDatesStepProps {
  parameters: ChangeMetadataParameters;
  onParameterChange: <K extends keyof ChangeMetadataParameters>(key: K, value: ChangeMetadataParameters[K]) => void;
  disabled?: boolean;
}

const DocumentDatesStep = ({
  parameters,
  onParameterChange,
  disabled = false
}: DocumentDatesStepProps) => {
  const { t } = useTranslation();

  const parseDate = (dateString: string): Date | null => {
    if (!dateString) return null;
    const date = new Date(dateString.replace(/(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/, '$1-$2-$3T$4:$5:$6'));
    return isNaN(date.getTime()) ? null : date;
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  };

  return (
    <Stack gap="md">
      <Text size="xs" c="dimmed">
        {t('changeMetadata.dates.format', 'Format: yyyy/MM/dd HH:mm:ss')}
      </Text>

      <DateTimePicker
        label={t('changeMetadata.creationDate.label', 'Creation Date')}
        placeholder={t('changeMetadata.creationDate.placeholder', 'e.g. 2025/01/17 14:30:00')}
        value={parseDate(parameters.creationDate)}
        onChange={(date) => onParameterChange('creationDate', formatDate(parseDate(date)))}
        disabled={disabled}
        clearable
      />

      <DateTimePicker
        label={t('changeMetadata.modificationDate.label', 'Modification Date')}
        placeholder={t('changeMetadata.modificationDate.placeholder', 'e.g. 2025/01/17 14:30:00')}
        value={parseDate(parameters.modificationDate)}
        onChange={(date) => onParameterChange('modificationDate', formatDate(parseDate(date)))}
        disabled={disabled}
        clearable
      />
    </Stack>
  );
};

export default DocumentDatesStep;
