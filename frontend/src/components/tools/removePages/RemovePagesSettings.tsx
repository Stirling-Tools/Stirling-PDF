import { Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { RemovePagesParameters } from "../../../hooks/tools/removePages/useRemovePagesParameters";

interface RemovePagesSettingsProps {
  parameters: RemovePagesParameters;
  onParameterChange: <K extends keyof RemovePagesParameters>(key: K, value: RemovePagesParameters[K]) => void;
  disabled?: boolean;
}

const RemovePagesSettings = ({ parameters, onParameterChange, disabled = false }: RemovePagesSettingsProps) => {
  const { t } = useTranslation();

  const handlePageNumbersChange = (value: string) => {
    // Remove spaces and normalize input
    const normalized = value.replace(/\s+/g, '');
    onParameterChange('pageNumbers', normalized);
  };

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <TextInput
          label={t('removePages.pageNumbers.label', 'Pages to Remove')}
          value={parameters.pageNumbers}
          onChange={(event) => handlePageNumbersChange(event.currentTarget.value)}
          placeholder={t('removePages.pageNumbers.placeholder', 'e.g., 1,3,5-8,10')}
          disabled={disabled}
          required
        />
        <Text size="xs" c="dimmed">
          {t('removePages.pageNumbers.desc', 'Enter page numbers or ranges separated by commas. Examples: 1,3,5 or 1-5,10-15')}
        </Text>
      </Stack>
    </Stack>
  );
};

export default RemovePagesSettings;
