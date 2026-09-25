import { useId } from "react";
import { Stack, Text, NumberInput, Slider } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";

interface ConvertFromWebSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(
    key: K,
    value: ConvertParameters[K],
  ) => void;
  disabled?: boolean;
}

const ConvertFromWebSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: ConvertFromWebSettingsProps) => {
  const { t } = useTranslation();
  const zoomLabelId = useId();
  const zoomLabel = t("convert.zoomLevel", "Zoom Level");

  return (
    <Stack gap="sm" data-testid="web-settings">
      <Text size="sm" fw={500}>
        {t("convert.webOptions", "Web to PDF Options")}:
      </Text>

      <Stack gap="xs">
        <Text id={zoomLabelId} size="xs" fw={500}>
          {zoomLabel}:
        </Text>
        <NumberInput
          aria-labelledby={zoomLabelId}
          value={parameters.htmlOptions.zoomLevel}
          onChange={(value) =>
            onParameterChange("htmlOptions", {
              ...parameters.htmlOptions,
              zoomLevel: Number(value) || 1.0,
            })
          }
          min={0.1}
          max={3.0}
          step={0.1}
          disabled={disabled}
          data-testid="zoom-level-input"
        />
        <Slider
          value={parameters.htmlOptions.zoomLevel}
          onChange={(value) =>
            onParameterChange("htmlOptions", {
              ...parameters.htmlOptions,
              zoomLevel: value,
            })
          }
          min={0.1}
          max={3.0}
          step={0.1}
          disabled={disabled}
          data-testid="zoom-level-slider"
          // The thumb is a div, so the heading above cannot name it.
          thumbLabel={zoomLabel}
        />
      </Stack>
    </Stack>
  );
};

export default ConvertFromWebSettings;
