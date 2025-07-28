import React from "react";
import { Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ConvertParameters } from "../../../hooks/tools/convert/useConvertParameters";

interface ConvertFromPdfToCsvSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: (key: keyof ConvertParameters, value: any) => void;
  disabled?: boolean;
}

const ConvertFromPdfToCsvSettings = ({
  parameters,
  onParameterChange,
  disabled = false
}: ConvertFromPdfToCsvSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm" data-testid="csv-options-section">
      <Text size="sm" fw={500} data-testid="csv-options-title">
        {t("convert.csvOptions", "CSV Options")}:
      </Text>
      <TextInput
        data-testid="page-numbers-input"
        label={t("convert.pageNumbers", "Page Numbers")}
        placeholder={t("convert.pageNumbersPlaceholder", "e.g., 1,3,5-9, 2n+1, or 'all'")}
        description={t("convert.pageNumbersDescription", "Specify pages to extract CSV data from. Supports ranges (e.g., '1,3,5-9'), functions (e.g., '2n+1', '3n'), or 'all' for all pages.")}
        value={parameters.pageNumbers}
        onChange={(event) => onParameterChange('pageNumbers', event.currentTarget.value)}
        disabled={disabled}
      />
    </Stack>
  );
};

export default ConvertFromPdfToCsvSettings;