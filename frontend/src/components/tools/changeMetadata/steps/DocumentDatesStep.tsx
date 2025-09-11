import { Stack, TextInput, Text } from "@mantine/core";
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

  return (
    <Stack gap="md">
      <Text size="xs" c="dimmed">
        {t('changeMetadata.dates.format', 'Format: yyyy/MM/dd HH:mm:ss')}
      </Text>

      <TextInput
        label={t('changeMetadata.creationDate.label', 'Creation Date')}
        placeholder={t('changeMetadata.creationDate.placeholder', 'e.g. 2025/01/17 14:30:00')}
        value={parameters.creationDate}
        onChange={(e) => onParameterChange('creationDate', e.target.value)}
        disabled={disabled}
      />

      <TextInput
        label={t('changeMetadata.modificationDate.label', 'Modification Date')}
        placeholder={t('changeMetadata.modificationDate.placeholder', 'e.g. 2025/01/17 14:30:00')}
        value={parameters.modificationDate}
        onChange={(e) => onParameterChange('modificationDate', e.target.value)}
        disabled={disabled}
      />
    </Stack>
  );
};

export default DocumentDatesStep;
