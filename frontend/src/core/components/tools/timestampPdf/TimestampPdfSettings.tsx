import { useEffect, useRef } from "react";
import { Stack, Text, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  TimestampPdfParameters,
  FALLBACK_TSA_PRESETS,
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
  const defaultApplied = useRef(false);

  // Use backend presets (single source of truth) with fallback (TASK-10)
  const presets = config?.timestampTsaPresets ?? FALLBACK_TSA_PRESETS;

  // Build dropdown: presets + admin custom URLs, deduplicated (TASK-9)
  const presetUrls = new Set(presets.map((p) => p.url));
  const adminCustomUrls = (config?.timestampCustomTsaUrls ?? []).filter(
    (url) => !presetUrls.has(url)
  );
  const selectData = [
    ...presets.map((preset) => ({ value: preset.url, label: preset.label })),
    ...adminCustomUrls.map((url) => ({ value: url, label: url })),
  ];

  // Apply admin default TSA URL on first config load (TASK-2)
  useEffect(() => {
    if (!defaultApplied.current && config?.timestampDefaultTsaUrl) {
      defaultApplied.current = true;
      const adminDefault = config.timestampDefaultTsaUrl;
      if (adminDefault && adminDefault !== parameters.tsaUrl) {
        onParameterChange("tsaUrl", adminDefault);
      }
    }
  }, [config?.timestampDefaultTsaUrl]);

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
        onChange={(value) => onParameterChange("tsaUrl", value ?? presets[0].url)}
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
