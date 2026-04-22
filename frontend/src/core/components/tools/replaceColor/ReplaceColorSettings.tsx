import {
  Stack,
  Text,
  Select,
  ColorInput,
  Checkbox,
  Group,
  Button,
  Loader,
  Box,
  Divider,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ReplaceColorParameters } from "@app/hooks/tools/replaceColor/useReplaceColorParameters";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

export interface DetectedTextColor {
  hexColor: string;
  occurrenceCount: number;
}

interface ReplaceColorSettingsProps {
  parameters: ReplaceColorParameters;
  onParameterChange: <K extends keyof ReplaceColorParameters>(
    key: K,
    value: ReplaceColorParameters[K],
  ) => void;
  detectedTextColors: DetectedTextColor[];
  onScanTextColors: () => void;
  isScanningTextColors: boolean;
  scanError: string | null;
  disabled?: boolean;
}

const ReplaceColorSettings = ({
  parameters,
  onParameterChange,
  detectedTextColors,
  onScanTextColors,
  isScanningTextColors,
  scanError,
  disabled = false,
}: ReplaceColorSettingsProps) => {
  const { t } = useTranslation();

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
        <Text size="sm" fw={500}>
          {t("replaceColor.labels.mode", "Mode")}
        </Text>
        <Select
          value={parameters.mode}
          onChange={(value) =>
            value &&
            onParameterChange(
              "mode",
              value as ReplaceColorParameters["mode"],
            )
          }
          data={[
            {
              value: "TEXT_COLOR_REPLACEMENT",
              label: t(
                "replaceColor.options.textColorReplacement",
                "Detect and replace text colours",
              ),
            },
            {
              value: "LEGACY",
              label: t(
                "replaceColor.options.legacy",
                "Legacy full-page colour operations",
              ),
            },
          ]}
          disabled={disabled}
          comboboxProps={{
            withinPortal: true,
            zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
          }}
        />
      </Stack>

      {parameters.mode === "TEXT_COLOR_REPLACEMENT" && (
        <>
          <Group justify="space-between" align="center">
            <Text size="sm" fw={500}>
              {t("replaceColor.labels.detectedTextColours", "Detected text colours")}
            </Text>
            <Button
              size="xs"
              variant="light"
              onClick={onScanTextColors}
              disabled={disabled || isScanningTextColors}
              leftSection={isScanningTextColors ? <Loader size="xs" /> : undefined}
            >
              {t("replaceColor.actions.scanTextColours", "Scan")}
            </Button>
          </Group>

          {detectedTextColors.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t(
                "replaceColor.labels.scanPrompt",
                "Scan the PDF to list text colours and select what to replace.",
              )}
            </Text>
          ) : (
            <Stack gap="xs">
              {detectedTextColors.map((color) => {
                const selected = parameters.sourceColors.includes(color.hexColor);
                return (
                  <Checkbox
                    key={color.hexColor}
                    checked={selected}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      const updated = checked
                        ? [...parameters.sourceColors, color.hexColor]
                        : parameters.sourceColors.filter((c) => c !== color.hexColor);
                      onParameterChange("sourceColors", updated);
                    }}
                    disabled={disabled}
                    label={
                      <Group gap="xs">
                        <Box
                          w={14}
                          h={14}
                          style={{
                            borderRadius: 2,
                            border: "1px solid var(--mantine-color-gray-4)",
                            backgroundColor: color.hexColor,
                          }}
                        />
                        <Text size="sm">
                          {color.hexColor} - {color.occurrenceCount}
                        </Text>
                      </Group>
                    }
                  />
                );
              })}
            </Stack>
          )}
          {scanError && (
            <Text size="sm" c="red">
              {scanError}
            </Text>
          )}

          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t("replaceColor.labels.targetTextColor", "Target text colour")}
            </Text>
            <ColorInput
              value={parameters.targetColor}
              onChange={(value) => onParameterChange("targetColor", value)}
              format="hex"
              disabled={disabled}
              popoverProps={{
                withinPortal: true,
                zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
              }}
            />
          </Stack>

          <Divider />
        </>
      )}

      {parameters.mode === "LEGACY" && (
        <>
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t("replaceColor.labels.colourOperation", "Colour operation")}
            </Text>
            <Select
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
              <Text size="sm" fw={500}>
                {t("replace-color.selectText.5", "High contrast color options")}
              </Text>
              <Select
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
                <Text size="sm" fw={500}>
                  {t("replace-color.selectText.10", "Choose text Color")}
                </Text>
                <ColorInput
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
                <Text size="sm" fw={500}>
                  {t("replace-color.selectText.11", "Choose background Color")}
                </Text>
                <ColorInput
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
        </>
      )}
    </Stack>
  );
};

export default ReplaceColorSettings;
