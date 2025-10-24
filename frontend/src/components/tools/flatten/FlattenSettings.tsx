import { Stack, Text, Checkbox, SegmentedControl } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { FlattenParameters } from "../../../hooks/tools/flatten/useFlattenParameters";

interface FlattenSettingsProps {
  parameters: FlattenParameters;
  onParameterChange: <K extends keyof FlattenParameters>(key: K, value: FlattenParameters[K]) => void;
  disabled?: boolean;
}

const FlattenSettings = ({ parameters, onParameterChange, disabled = false }: FlattenSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t('flatten.processingMode.label', 'Processing mode')}
        </Text>
        <SegmentedControl
          value={parameters.processingMode}
          onChange={(value) => onParameterChange('processingMode', value as FlattenParameters['processingMode'])}
          data={[
            { label: t('flatten.processingMode.backend', 'Backend'), value: 'backend' },
            { label: t('flatten.processingMode.frontend', 'Browser'), value: 'frontend' }
          ]}
          fullWidth
          disabled={disabled}
        />
        <Text size="xs" c="dimmed">
          {parameters.processingMode === 'frontend'
            ? t('flatten.processingMode.frontendDescription', 'Flatten form fields directly in your browser (forms only).')
            : t('flatten.processingMode.backendDescription', 'Use the server for full flattening, including rasterising pages.')}
        </Text>
      </Stack>

      <Stack gap="sm">
        <Checkbox
          checked={parameters.flattenOnlyForms}
          onChange={(event) => onParameterChange('flattenOnlyForms', event.currentTarget.checked)}
          disabled={disabled}
          label={
            <div>
              <Text size="sm">{t('flatten.options.flattenOnlyForms', 'Flatten only forms')}</Text>
              <Text size="xs" c="dimmed">
                {t('flatten.options.flattenOnlyForms.desc', 'Only flatten form fields, leaving other interactive elements intact')}
              </Text>
            </div>
          }
        />
      </Stack>
    </Stack>
  );
};

export default FlattenSettings;