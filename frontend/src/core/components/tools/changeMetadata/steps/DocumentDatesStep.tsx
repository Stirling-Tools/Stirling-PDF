import { Stack } from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useTranslation } from "react-i18next";
import { ChangeMetadataParameters } from "@app/hooks/tools/changeMetadata/useChangeMetadataParameters";

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
      <DateTimePicker
        label={t('changeMetadata.creationDate.label', 'Creation Date')}
        placeholder={t('changeMetadata.creationDate.placeholder', 'Creation date')}
        value={parameters.creationDate}
        onChange={(date) => onParameterChange('creationDate', date ? new Date(date) : null)}
        disabled={disabled}
        clearable
      />

      <DateTimePicker
        label={t('changeMetadata.modificationDate.label', 'Modification Date')}
        placeholder={t('changeMetadata.modificationDate.placeholder', 'Modification date')}
        value={parameters.modificationDate}
        onChange={(date) => onParameterChange('modificationDate', date ? new Date(date) : null)}
        disabled={disabled}
        clearable
      />
    </Stack>
  );
};

export default DocumentDatesStep;
