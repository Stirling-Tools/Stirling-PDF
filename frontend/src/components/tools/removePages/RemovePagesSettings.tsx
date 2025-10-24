import { Stack, TextInput, SegmentedControl, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { RemovePagesParameters } from "../../../hooks/tools/removePages/useRemovePagesParameters";
import { validatePageNumbers } from "../../../utils/pageSelection";

interface RemovePagesSettingsProps {
  parameters: RemovePagesParameters;
  onParameterChange: <K extends keyof RemovePagesParameters>(key: K, value: RemovePagesParameters[K]) => void;
  disabled?: boolean;
}

const RemovePagesSettings = ({ parameters, onParameterChange, disabled = false }: RemovePagesSettingsProps) => {
  const { t } = useTranslation();

  const handlePageNumbersChange = (value: string) => {
    // Allow user to type naturally - don't normalize input in real-time
    onParameterChange('pageNumbers', value);
  };

  // Check if current input is valid
  const isValid = validatePageNumbers(parameters.pageNumbers || '');
  const hasValue = (parameters?.pageNumbers?.trim().length ?? 0) > 0;

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text size="sm" fw={500}>{t('removePages.processingMode.label', 'Processing mode')}</Text>
        <SegmentedControl
          value={parameters.processingMode}
          onChange={(value) => onParameterChange('processingMode', value as 'backend' | 'frontend')}
          data={[
            { label: t('removePages.processingMode.backend', 'Backend'), value: 'backend' },
            { label: t('removePages.processingMode.frontend', 'Browser'), value: 'frontend' },
          ]}
          disabled={disabled}
        />
        <Text size="xs" c="dimmed">
          {parameters.processingMode === 'frontend'
            ? t('removePages.processingMode.frontendDescription', 'Remove the selected pages locally in your browser.')
            : t('removePages.processingMode.backendDescription', 'Use the server to remove pages (required for complex formulas).')}
        </Text>
      </Stack>
      <TextInput
        label={t('removePages.pageNumbers.label', 'Pages to Remove')}
        value={parameters.pageNumbers || ''}
        onChange={(event) => handlePageNumbersChange(event.currentTarget.value)}
        placeholder={t('removePages.pageNumbers.placeholder', 'e.g., 1,3,5-8,10')}
        disabled={disabled}
        required
        error={hasValue && !isValid ? t('removePages.pageNumbers.error', 'Invalid page number format. Use numbers, ranges (1-5), or mathematical expressions (2n+1)') : undefined}
      />
    </Stack>
  );
};

export default RemovePagesSettings;
