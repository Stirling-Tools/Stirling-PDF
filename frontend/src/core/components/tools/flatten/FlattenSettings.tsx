import { Stack, Text, Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { FlattenParameters } from "@app/hooks/tools/flatten/useFlattenParameters";

interface FlattenSettingsProps {
  parameters: FlattenParameters;
  onParameterChange: <K extends keyof FlattenParameters>(key: K, value: FlattenParameters[K]) => void;
  disabled?: boolean;
}

const FlattenSettings = ({ parameters, onParameterChange, disabled = false }: FlattenSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Stack gap="sm">
        <Checkbox
          checked={parameters.flattenOnlyForms}
          onChange={(event) => onParameterChange('flattenOnlyForms', event.currentTarget.checked)}
          disabled={disabled}
          label={
            <div>
              <Text size="sm">{t('flatten.options.flattenOnlyForms.label', 'Flatten only forms')}</Text>
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