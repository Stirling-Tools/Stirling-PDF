import { Stack, TextInput, Button, Group, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ChangeMetadataParameters } from "@app/hooks/tools/changeMetadata/useChangeMetadataParameters";

interface CustomMetadataStepProps {
  parameters: ChangeMetadataParameters;
  onParameterChange: <K extends keyof ChangeMetadataParameters>(key: K, value: ChangeMetadataParameters[K]) => void;
  disabled?: boolean;
  addCustomMetadata: (key?: string, value?: string) => void;
  removeCustomMetadata: (id: string) => void;
  updateCustomMetadata: (id: string, key: string, value: string) => void;
}

const CustomMetadataStep = ({
  parameters,
  disabled = false,
  addCustomMetadata,
  removeCustomMetadata,
  updateCustomMetadata
}: CustomMetadataStepProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={500}>
          {t('changeMetadata.customFields.title', 'Custom Metadata')}
        </Text>
        <Button
          size="xs"
          variant="light"
          onClick={() => addCustomMetadata()}
          disabled={disabled}
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
            disabled={disabled}
          />
          <TextInput
            placeholder={t('changeMetadata.customFields.valuePlaceholder', 'Custom value')}
            value={entry.value}
            onChange={(e) => updateCustomMetadata(entry.id, entry.key, e.target.value)}
            disabled={disabled}
          />
          <Button
            size="xs"
            variant="light"
            color="red"
            onClick={() => removeCustomMetadata(entry.id)}
            disabled={disabled}
          >
            {t('changeMetadata.customFields.remove', 'Remove')}
          </Button>
        </Stack>
      ))}
    </Stack>
  );
};

export default CustomMetadataStep;
