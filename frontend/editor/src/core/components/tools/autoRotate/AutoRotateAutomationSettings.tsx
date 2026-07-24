import { Stack, Text, NumberInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  AutoRotateParameters,
  AutoRotateDetectionMode,
} from "@app/hooks/tools/autoRotate/useAutoRotateParameters";
import ButtonSelector from "@app/components/shared/ButtonSelector";

interface AutoRotateAutomationSettingsProps {
  parameters: AutoRotateParameters;
  onParameterChange: <K extends keyof AutoRotateParameters>(
    key: K,
    value: AutoRotateParameters[K],
  ) => void;
  disabled?: boolean;
}

const AutoRotateAutomationSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: AutoRotateAutomationSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Text size="sm" fw={500}>
        {t("autoRotate.detectionMode.title", "Detection method")}
      </Text>

      <ButtonSelector
        value={parameters.detectionMode}
        onChange={(value: AutoRotateDetectionMode) =>
          onParameterChange("detectionMode", value)
        }
        options={[
          { value: "auto", label: t("autoRotate.detectionMode.auto", "Auto") },
          {
            value: "text",
            label: t("autoRotate.detectionMode.text", "Text only"),
          },
          {
            value: "osd",
            label: t("autoRotate.detectionMode.osd", "OCR only"),
          },
        ]}
        disabled={disabled}
      />

      <NumberInput
        label={t(
          "autoRotate.confidenceThreshold.title",
          "OCR confidence threshold",
        )}
        min={0}
        step={1}
        disabled={disabled}
        value={parameters.confidenceThreshold}
        onChange={(value) =>
          onParameterChange(
            "confidenceThreshold",
            typeof value === "number" ? value : 14,
          )
        }
      />
    </Stack>
  );
};

export default AutoRotateAutomationSettings;
