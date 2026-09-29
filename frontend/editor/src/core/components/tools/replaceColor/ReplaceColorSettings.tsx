import { useId } from "react";
import { Stack, Text, Select, ColorInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ReplaceColorParameters } from "@app/hooks/tools/replaceColor/useReplaceColorParameters";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

interface ReplaceColorSettingsProps {
  parameters: ReplaceColorParameters;
  onParameterChange: <K extends keyof ReplaceColorParameters>(
    key: K,
    value: ReplaceColorParameters[K],
  ) => void;
  disabled?: boolean;
}

const ReplaceColorSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: ReplaceColorSettingsProps) => {
  const { t } = useTranslation();
  const operationLabelId = useId();
  const highContrastLabelId = useId();
  const textColorLabelId = useId();
  const backgroundColorLabelId = useId();

  const replaceAndInvertOptions = [
    {
      value: "HIGH_CONTRAST_COLOR",
      label: t("replaceColor.options.highContrast", "High contrast"),
    },
    {
      value: "FULL_INVERSION",
      label: t("replaceColor.options.invertAll", "Invert all colours"),
    },
    {
      value: "CUSTOM_COLOR",
      label: t("replaceColor.options.custom", "Custom"),
    },
    {
      value: "COLOR_SPACE_CONVERSION",
      label: t("replaceColor.options.cmyk", "Convert to CMYK"),
    },
  ];

  const highContrastOptions = [
    {
      value: "WHITE_TEXT_ON_BLACK",
      label: t("replace-color.selectText.6", "White text on black background"),
    },
    {
      value: "BLACK_TEXT_ON_WHITE",
      label: t("replace-color.selectText.7", "Black text on white background"),
    },
    {
      value: "YELLOW_TEXT_ON_BLACK",
      label: t("replace-color.selectText.8", "Yellow text on black background"),
    },
    {
      value: "GREEN_TEXT_ON_BLACK",
      label: t("replace-color.selectText.9", "Green text on black background"),
    },
  ];

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text id={operationLabelId} size="sm" fw={500}>
          {t("replaceColor.labels.colourOperation", "Colour operation")}
        </Text>
        <Select
          aria-labelledby={operationLabelId}
          value={parameters.replaceAndInvertOption}
          onChange={(value) =>
            value &&
            onParameterChange(
              "replaceAndInvertOption",
              value as ReplaceColorParameters["replaceAndInvertOption"],
            )
          }
          data={replaceAndInvertOptions}
          disabled={disabled}
          comboboxProps={{
            withinPortal: true,
            zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
          }}
        />
      </Stack>

      {parameters.replaceAndInvertOption === "HIGH_CONTRAST_COLOR" && (
        <Stack gap="xs">
          <Text id={highContrastLabelId} size="sm" fw={500}>
            {t("replace-color.selectText.5", "High contrast color options")}
          </Text>
          <Select
            aria-labelledby={highContrastLabelId}
            value={parameters.highContrastColorCombination}
            onChange={(value) =>
              value &&
              onParameterChange(
                "highContrastColorCombination",
                value as ReplaceColorParameters["highContrastColorCombination"],
              )
            }
            data={highContrastOptions}
            disabled={disabled}
            comboboxProps={{
              withinPortal: true,
              zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
            }}
          />
        </Stack>
      )}

      {parameters.replaceAndInvertOption === "CUSTOM_COLOR" && (
        <>
          <Stack gap="xs">
            <Text id={textColorLabelId} size="sm" fw={500}>
              {t("replace-color.selectText.10", "Choose text Color")}
            </Text>
            <ColorInput
              aria-labelledby={textColorLabelId}
              value={parameters.textColor}
              onChange={(value) => onParameterChange("textColor", value)}
              format="hex"
              disabled={disabled}
              popoverProps={{
                withinPortal: true,
                zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
              }}
            />
          </Stack>

          <Stack gap="xs">
            <Text id={backgroundColorLabelId} size="sm" fw={500}>
              {t("replace-color.selectText.11", "Choose background Color")}
            </Text>
            <ColorInput
              aria-labelledby={backgroundColorLabelId}
              value={parameters.backGroundColor}
              onChange={(value) => onParameterChange("backGroundColor", value)}
              format="hex"
              disabled={disabled}
              popoverProps={{
                withinPortal: true,
                zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
              }}
            />
          </Stack>
        </>
      )}
    </Stack>
  );
};

export default ReplaceColorSettings;
