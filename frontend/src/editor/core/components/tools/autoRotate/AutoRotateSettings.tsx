import { Stack, Text, NumberInput } from "@mantine/core";
import { SegmentedControl } from "@editor/ui/SegmentedControl";
import { Checkbox } from "@editor/ui/Checkbox";
import { useTranslation } from "react-i18next";
import {
  AutoRotateParametersHook,
  AutoRotateDetectionMode,
} from "@editor/hooks/tools/autoRotate/useAutoRotateParameters";

interface AutoRotateSettingsProps {
  parameters: AutoRotateParametersHook;
  disabled?: boolean;
}

// Explanatory copy for these controls lives in the step tooltip
// (useAutoRotateTips), so the panel itself stays to labels only.
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
      </Stack>

      <NumberInput
        label={t(
          "autoRotate.confidenceThreshold.title",
          "Confidence threshold",
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

      <Checkbox
        label={t(
          "autoRotate.inferUndetected.title",
          "Rotate low confidence pages to match",
        )}
        disabled={disabled}
        checked={parameters.parameters.inferUndetected}
        onChange={(event) =>
          parameters.updateParameter(
            "inferUndetected",
            event.currentTarget.checked,
          )
        }
      />
    </Stack>
  );
};

export default AutoRotateSettings;
