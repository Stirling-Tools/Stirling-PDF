import { Stack, Text, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import LocalIcon from "@app/components/shared/LocalIcon";
import {
  AutoFormDetectionParameters,
  DetectionSensitivity,
} from "@app/hooks/tools/autoFormDetection/useAutoFormDetectionParameters";

interface AutoFormDetectionSettingsProps {
  parameters: AutoFormDetectionParameters;
  onParameterChange: <K extends keyof AutoFormDetectionParameters>(
    key: K,
    value: AutoFormDetectionParameters[K],
  ) => void;
  disabled?: boolean;
}

const FIELD_TYPES = [
  { icon: "text-fields-rounded", key: "text", fallback: "Text fields" },
  { icon: "check-box-outline-rounded", key: "checkboxes", fallback: "Checkboxes" },
  { icon: "signature-rounded", key: "signatures", fallback: "Signatures" },
] as const;

export default function AutoFormDetectionSettings({
  parameters,
  onParameterChange,
  disabled,
}: AutoFormDetectionSettingsProps) {
  const { t } = useTranslation();

  const sensitivity = parameters.sensitivity ?? "balanced";
  const sensitivityHint: Record<DetectionSensitivity, string> = {
    low: t(
      "autoFormDetection.sensitivity.lowHint",
      "Only very confident matches - fewer fields, fewer mistakes.",
    ),
    balanced: t(
      "autoFormDetection.sensitivity.balancedHint",
      "Recommended for most forms.",
    ),
    high: t(
      "autoFormDetection.sensitivity.highHint",
      "Finds more fields, but may add some where none belong.",
    ),
  };

  return (
    <Stack gap="sm">
      <div>
        <Text size="sm" fw={500} mb={4}>
          {t("autoFormDetection.detects.label", "Finds and makes fillable")}
        </Text>
        <Group gap="xs">
          {FIELD_TYPES.map((f) => (
            <Group
              key={f.key}
              gap={4}
              wrap="nowrap"
              style={{
                border: "1px solid var(--c-border-subtle)",
                borderRadius: "var(--mantine-radius-xl)",
                padding: "0.125rem 0.5rem",
              }}
            >
              <LocalIcon icon={f.icon} width="0.9rem" height="0.9rem" />
              <Text size="xs">
                {t(`autoFormDetection.detects.${f.key}`, f.fallback)}
              </Text>
            </Group>
          ))}
        </Group>
      </div>

      <div>
        <Text size="sm" fw={500} mb={4}>
          {t("autoFormDetection.sensitivity.label", "Detection sensitivity")}
        </Text>
        <SegmentedControl<DetectionSensitivity>
          fullWidth
          value={sensitivity}
          disabled={disabled}
          onChange={(v) => onParameterChange("sensitivity", v)}
          ariaLabel={t(
            "autoFormDetection.sensitivity.label",
            "Detection sensitivity",
          )}
          options={[
            {
              value: "low",
              label: t("autoFormDetection.sensitivity.low", "Strict"),
            },
            {
              value: "balanced",
              label: t("autoFormDetection.sensitivity.balanced", "Balanced"),
            },
            {
              value: "high",
              label: t("autoFormDetection.sensitivity.high", "Thorough"),
            },
          ]}
        />
        <Text size="xs" c="dimmed" mt={4}>
          {sensitivityHint[sensitivity]}
        </Text>
      </div>
    </Stack>
  );
}
