import { Stack, Text, Select, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  TimestampPdfParameters,
  TSA_PRESETS,
  CUSTOM_TSA_VALUE,
} from "@app/hooks/tools/timestampPdf/useTimestampPdfParameters";

interface TimestampPdfSettingsProps {
  parameters: TimestampPdfParameters;
  onParameterChange: <K extends keyof TimestampPdfParameters>(
    key: K,
    value: TimestampPdfParameters[K]
  ) => void;
  disabled?: boolean;
}

const TimestampPdfSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: TimestampPdfSettingsProps) => {
  const { t } = useTranslation();

  const selectData = [
    ...TSA_PRESETS.map((preset) => ({ value: preset.url, label: preset.label })),
    { value: CUSTOM_TSA_VALUE, label: t("timestampPdf.options.tsaUrl.custom", "Custom TSA URL...") },
  ];

  return (
    <Stack gap="md">
      <Text size="sm" fw={500}>
        {t("timestampPdf.options.title", "Timestamp Server (TSA)")}
      </Text>

      <Select
        label={t("timestampPdf.options.tsaUrl.label", "Select a TSA server")}
        description={t(
          "timestampPdf.options.tsaUrl.desc",
          "Pick a trusted Time Stamp Authority or enter a custom URL"
        )}
        data={selectData}
        value={parameters.tsaUrl}
        onChange={(value) => onParameterChange("tsaUrl", value ?? TSA_PRESETS[0].url)}
        disabled={disabled}
      />

      {parameters.tsaUrl === CUSTOM_TSA_VALUE && (
        <TextInput
          label={t("timestampPdf.options.customTsaUrl.label", "Custom TSA URL")}
          placeholder="https://your-tsa-server.com/timestamp"
          value={parameters.customTsaUrl}
          onChange={(e) => onParameterChange("customTsaUrl", e.currentTarget.value)}
          disabled={disabled}
        />
      )}

      <Text size="xs" c="dimmed">
        {t(
          "timestampPdf.options.note",
          "Only a SHA-256 hash of your document is sent to the TSA server. The PDF itself stays on the server."
        )}
      </Text>
    </Stack>
  );
};

export default TimestampPdfSettings;
