import { Stack, NumberInput, ColorInput, Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { RedactParameters } from "@editor/hooks/tools/redact/useRedactParameters";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";
import { selectedPresetIds } from "@editor/components/tools/redact/redactWords";

interface RedactAdvancedSettingsProps {
  parameters: RedactParameters;
  onParameterChange: <K extends keyof RedactParameters>(
    key: K,
    value: RedactParameters[K],
  ) => void;
  disabled?: boolean;
}

const RedactAdvancedSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: RedactAdvancedSettingsProps) => {
  const { t } = useTranslation();
  const regexLocked = selectedPresetIds(parameters).length > 0;

  return (
    <Stack gap="md">
      {/* Box Color */}
      <ColorInput
        label={t("redact.auto.colorLabel", "Box Colour")}
        value={parameters.redactColor}
        onChange={(value) => onParameterChange("redactColor", value)}
        disabled={disabled}
        size="sm"
        format="hex"
        popoverProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
      />

      {/* Box Padding */}
      <NumberInput
        label={t("redact.auto.customPaddingLabel", "Custom Extra Padding")}
        value={parameters.customPadding}
        onChange={(value) =>
          onParameterChange(
            "customPadding",
            typeof value === "number" ? value : 0.1,
          )
        }
        min={0}
        max={10}
        step={0.1}
        disabled={disabled}
        size="sm"
        placeholder="0.1"
      />

      <Checkbox
        {...infoLabelProps(
          t("redact.auto.useRegexLabel", "Use Regex"),
          regexLocked
            ? t(
                "redact.auto.useRegexLockedTooltip",
                "Common types are regular expressions, so Use Regex stays on while any are selected.",
              )
            : undefined,
        )}
        checked={parameters.useRegex}
        onChange={(e) => onParameterChange("useRegex", e.currentTarget.checked)}
        disabled={disabled || regexLocked}
        size="sm"
      />

      {/* Whole Word Search */}
      <Checkbox
        label={t("redact.auto.wholeWordSearchLabel", "Whole Word Search")}
        checked={parameters.wholeWordSearch}
        onChange={(e) =>
          onParameterChange("wholeWordSearch", e.currentTarget.checked)
        }
        disabled={disabled}
        size="sm"
      />

      <Checkbox
        label={t("redact.auto.caseSensitiveLabel", "Case Sensitive Matching")}
        checked={parameters.caseSensitive}
        onChange={(e) =>
          onParameterChange("caseSensitive", e.currentTarget.checked)
        }
        disabled={disabled}
        size="sm"
      />

      {/* Convert PDF to PDF-Image */}
      <Checkbox
        {...infoLabelProps(
          t("redact.auto.convertPDFToImageLabel", "Convert PDF to PDF-Image"),
          t(
            "redact.tooltip.advanced.convert.text",
            "Converts the PDF to an image-based PDF after redaction. This ensures text behind redaction boxes is completely removed and unrecoverable.",
          ),
        )}
        checked={parameters.convertPDFToImage}
        onChange={(e) =>
          onParameterChange("convertPDFToImage", e.currentTarget.checked)
        }
        disabled={disabled}
        size="sm"
      />
    </Stack>
  );
};

export default RedactAdvancedSettings;
