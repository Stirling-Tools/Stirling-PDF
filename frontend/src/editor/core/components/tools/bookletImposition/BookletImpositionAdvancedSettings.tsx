import { useTranslation } from "react-i18next";
import { Stack, NumberInput, Checkbox } from "@mantine/core";
import { BookletImpositionParameters } from "@editor/hooks/tools/bookletImposition/useBookletImpositionParameters";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";

interface BookletImpositionAdvancedSettingsProps {
  parameters: BookletImpositionParameters;
  onParameterChange: <K extends keyof BookletImpositionParameters>(
    key: K,
    value: BookletImpositionParameters[K],
  ) => void;
  disabled?: boolean;
}

const BookletImpositionAdvancedSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: BookletImpositionAdvancedSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Checkbox
        checked={parameters.spineLocation === "RIGHT"}
        onChange={(event) =>
          onParameterChange(
            "spineLocation",
            event.currentTarget.checked ? "RIGHT" : "LEFT",
          )
        }
        disabled={disabled}
        {...infoLabelProps(
          t("bookletImposition.rtlBinding.label", "Right-to-left binding"),
          t(
            "bookletImposition.rtlBinding.tooltip",
            "For Arabic, Hebrew, or other right-to-left languages",
          ),
        )}
      />

      <Checkbox
        checked={parameters.addBorder}
        onChange={(event) =>
          onParameterChange("addBorder", event.currentTarget.checked)
        }
        disabled={disabled}
        {...infoLabelProps(
          t("bookletImposition.addBorder.label", "Add borders around pages"),
          t(
            "bookletImposition.addBorder.tooltip",
            "Adds borders around each page section to help with cutting and alignment",
          ),
        )}
      />

      <Checkbox
        checked={parameters.addGutter}
        onChange={(event) =>
          onParameterChange("addGutter", event.currentTarget.checked)
        }
        disabled={disabled}
        {...infoLabelProps(
          t("bookletImposition.addGutter.label", "Add gutter margin"),
          t(
            "bookletImposition.addGutter.tooltip",
            "Adds inner margin space for binding",
          ),
        )}
      />

      {parameters.addGutter && (
        <NumberInput
          label={t("bookletImposition.gutterSize.label", "Gutter size")}
          suffix=" pt"
          value={parameters.gutterSize}
          onChange={(value) =>
            onParameterChange(
              "gutterSize",
              typeof value === "number" ? value : 12,
            )
          }
          min={6}
          max={72}
          step={6}
          disabled={disabled}
        />
      )}

      <Checkbox
        checked={parameters.flipOnShortEdge}
        onChange={(event) =>
          onParameterChange("flipOnShortEdge", event.currentTarget.checked)
        }
        disabled={disabled || !parameters.doubleSided}
        {...infoLabelProps(
          t("bookletImposition.flipOnShortEdge.label", "Flip on short edge"),
          !parameters.doubleSided
            ? t(
                "bookletImposition.flipOnShortEdge.manualNote",
                "Not needed in manual mode - you flip the stack yourself",
              )
            : t(
                "bookletImposition.flipOnShortEdge.tooltip",
                "Enable for short-edge duplex printing (automatic duplex only - ignored in manual mode)",
              ),
        )}
      />
    </Stack>
  );
};

export default BookletImpositionAdvancedSettings;
