import { Stack, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ExtractPagesParameters } from "@app/hooks/tools/extractPages/useExtractPagesParameters";
import PageSelectionSyntaxHint from "@app/components/shared/PageSelectionSyntaxHint";

interface ExtractPagesSettingsProps {
  parameters: ExtractPagesParameters;
  onParameterChange: <K extends keyof ExtractPagesParameters>(key: K, value: ExtractPagesParameters[K]) => void;
  disabled?: boolean;
}

const ExtractPagesSettings = ({ parameters, onParameterChange, disabled = false }: ExtractPagesSettingsProps) => {
  const { t } = useTranslation();

  const handleChange = (value: string) => {
    onParameterChange('pageNumbers', value);
  };

  return (
    <Stack gap="md">
      <TextInput
        label={t('extractPages.pageNumbers.label', 'Pages to Extract')}
        value={parameters.pageNumbers || ''}
        onChange={(event) => handleChange(event.currentTarget.value)}
        placeholder={t('extractPages.pageNumbers.placeholder', 'e.g., 1,3,5-8 or odd & 1-10')}
        disabled={disabled}
        required
      />
      <PageSelectionSyntaxHint input={parameters.pageNumbers || ''} variant="compact" />
    </Stack>
  );
};

export default ExtractPagesSettings;


