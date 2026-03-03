import { Stack, Text, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  TimestampPdfParameters,
  TSA_PRESETS,
} from "@app/hooks/tools/timestampPdf/useTimestampPdfParameters";
import { useAppConfig } from "@app/contexts/AppConfigContext";

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
  const { config } = useAppConfig();

  // Build dropdown: built-in presets + admin-configured custom URLs from settings.yml
  const adminCustomUrls = config?.timestampCustomTsaUrls ?? [];
  const selectData = [
    ...TSA_PRESETS.map((preset) => ({ value: preset.url, label: preset.label })),
    ...adminCustomUrls.map((url) => ({ value: url, label: url })),
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
          "Pick a trusted Time Stamp Authority"
        )}
        data={selectData}
        value={parameters.tsaUrl}
        onChange={(value) => onParameterChange("tsaUrl", value ?? TSA_PRESETS[0].url)}
        disabled={disabled}
      />

      <Text size="xs" c="dimmed">
        {t(
          "timestampPdf.options.note",
          "Only a SHA-256 hash of your document is sent to the TSA server; the PDF file itself is never sent to the TSA server."
        )}
      </Text>
    </Stack>
  );
};

export default TimestampPdfSettings;
