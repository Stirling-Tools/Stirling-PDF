import { Checkbox, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  REDACT_PRESETS,
  isRedactPresetId,
  type RedactPresetId,
} from "@editor/data/redactPresets";

interface RedactPresetSelectProps {
  value: RedactPresetId[];
  onChange: (ids: RedactPresetId[]) => void;
  disabled?: boolean;
}

/**
 * Picker for the common redaction types. Selection only: each surface decides
 * how the chosen ids land in `wordsToRedact`.
 */
export function RedactPresetSelect({
  value,
  onChange,
  disabled,
}: RedactPresetSelectProps) {
  const { t } = useTranslation();
  return (
    <Checkbox.Group
      label={t("redact.presets.title", "Common types")}
      value={value}
      onChange={(values) => onChange(values.filter(isRedactPresetId))}
      disabled={disabled}
    >
      <Stack gap="xs" mt="xs">
        {REDACT_PRESETS.map((preset) => (
          <Checkbox
            key={preset.id}
            value={preset.id}
            label={t(`redact.presets.${preset.id}`, preset.label)}
            size="sm"
          />
        ))}
      </Stack>
    </Checkbox.Group>
  );
}
