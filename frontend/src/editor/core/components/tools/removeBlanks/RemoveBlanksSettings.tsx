import { useId } from "react";
import {
  Stack,
  Text,
  Checkbox,
  Slider,
  NumberInput,
  Group,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import NumberInputWithUnit from "@app/components/tools/shared/NumberInputWithUnit";
import { RemoveBlanksParameters } from "@app/hooks/tools/removeBlanks/useRemoveBlanksParameters";

interface RemoveBlanksSettingsProps {
  parameters: RemoveBlanksParameters;
  onParameterChange: <K extends keyof RemoveBlanksParameters>(
    key: K,
    value: RemoveBlanksParameters[K],
  ) => void;
  disabled?: boolean;
}

const RemoveBlanksSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: RemoveBlanksSettingsProps) => {
  const { t } = useTranslation();
  const whitePercentLabelId = useId();
  const whitePercentLabel = t(
    "removeBlanks.whitePercent.label",
    "White Percent",
  );

  return (
    <Stack gap="lg" mt="md">
      <Stack gap="xs">
        <NumberInputWithUnit
          label={t("removeBlanks.threshold.label", "Pixel Whiteness Threshold")}
          value={parameters.threshold}
          onChange={(v) =>
            onParameterChange(
              "threshold",
              typeof v === "string" ? Number(v) : v,
            )
          }
          unit=""
          min={0}
          max={255}
          disabled={disabled}
        />
      </Stack>

      <Stack gap="xs">
        <Text id={whitePercentLabelId} size="sm" fw={500}>
          {whitePercentLabel}
        </Text>
        <Group align="center">
          <NumberInput
            aria-labelledby={whitePercentLabelId}
            value={parameters.whitePercent}
            onChange={(v) =>
              onParameterChange("whitePercent", typeof v === "number" ? v : 0.1)
            }
            min={0.1}
            max={100}
            step={0.1}
            size="sm"
            rightSection="%"
            style={{ width: "80px" }}
            disabled={disabled}
          />
          <Slider
            value={parameters.whitePercent}
            onChange={(value) => onParameterChange("whitePercent", value)}
            min={0.1}
            max={100}
            step={0.1}
            style={{ flex: 1 }}
            disabled={disabled}
            // The thumb is a div, so the heading above cannot name it.
            thumbLabel={whitePercentLabel}
          />
        </Group>
      </Stack>

      <Stack gap="xs">
        <Checkbox
          checked={parameters.includeBlankPages}
          onChange={(event) =>
            onParameterChange("includeBlankPages", event.currentTarget.checked)
          }
          disabled={disabled}
          label={
            <div>
              <Text size="sm">
                {t(
                  "removeBlanks.includeBlankPages.label",
                  "Include detected blank pages",
                )}
              </Text>
            </div>
          }
        />
      </Stack>
    </Stack>
  );
};

export default RemoveBlanksSettings;
