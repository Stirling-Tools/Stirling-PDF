import { Stack, Text, NumberInput } from "@mantine/core";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { useTranslation } from "react-i18next";
import {
  AutoRotateParametersHook,
  AutoRotateDetectionMode,
} from "@app/hooks/tools/autoRotate/useAutoRotateParameters";

interface AutoRotateSettingsProps {
  parameters: AutoRotateParametersHook;
  disabled?: boolean;
}

const AutoRotateSettings = ({
  parameters,
  disabled = false,
}: AutoRotateSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {t("autoRotate.detectionMode.title", "Detection method")}
        </Text>
        <SegmentedControl<AutoRotateDetectionMode>
          fullWidth
          disabled={disabled}
          ariaLabel={t("autoRotate.detectionMode.title", "Detection method")}
          value={parameters.parameters.detectionMode}
          onChange={(value) =>
            parameters.updateParameter("detectionMode", value)
          }
          options={[
            {
              value: "auto",
              label: t("autoRotate.detectionMode.auto", "Auto"),
            },
            {
              value: "text",
              label: t("autoRotate.detectionMode.text", "Text only"),
            },
            {
              value: "osd",
              label: t("autoRotate.detectionMode.osd", "OCR only"),
            },
          ]}
        />
        <Text size="xs" c="dimmed">
          {t(
            "autoRotate.detectionMode.desc",
            "Auto reads embedded text direction first and falls back to Tesseract orientation detection (OCR) for scanned pages.",
          )}
        </Text>
      </Stack>

      <NumberInput
        label={t(
          "autoRotate.confidenceThreshold.title",
          "OCR confidence threshold",
        )}
        description={t(
          "autoRotate.confidenceThreshold.desc",
          "Pages below this orientation confidence are left unchanged. Lower it to rotate more aggressively.",
        )}
        min={0}
        step={1}
        disabled={disabled}
        value={parameters.parameters.confidenceThreshold}
        onChange={(value) =>
          parameters.updateParameter(
            "confidenceThreshold",
            typeof value === "number" ? value : 14,
          )
        }
      />
    </Stack>
  );
};

export default AutoRotateSettings;
