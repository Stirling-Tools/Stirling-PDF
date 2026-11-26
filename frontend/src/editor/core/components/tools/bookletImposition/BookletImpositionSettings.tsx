import { useTranslation } from "react-i18next";
import { Stack, Text, Group, Checkbox, NumberInput } from "@mantine/core";
import { ToolInfoTooltip } from "@editor/components/tools/shared/ToolInfoTooltip";
import { BookletImpositionParameters } from "@editor/hooks/tools/bookletImposition/useBookletImpositionParameters";
import ButtonSelector from "@editor/components/shared/ButtonSelector";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";

interface BookletImpositionSettingsProps {
  parameters: BookletImpositionParameters;
  onParameterChange: <K extends keyof BookletImpositionParameters>(
    key: K,
    value: BookletImpositionParameters[K],
  ) => void;
  disabled?: boolean;
}

const BookletImpositionSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: BookletImpositionSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Checkbox
        checked={parameters.doubleSided}
        onChange={(event) => {
          const isDoubleSided = event.currentTarget.checked;
          onParameterChange("doubleSided", isDoubleSided);
          onParameterChange("duplexPass", isDoubleSided ? "BOTH" : "FIRST");
        }}
        disabled={disabled}
        {...infoLabelProps(
          t("bookletImposition.doubleSided.label", "Double-sided printing"),
          t(
            "bookletImposition.doubleSided.tooltip",
            "Creates both front and back sides for proper booklet printing",
          ),
        )}
      />

      {!parameters.doubleSided && (
        <Stack gap="sm" ml="lg">
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" fw={500}>
              {t("bookletImposition.manualDuplex.title", "Manual Duplex Mode")}
            </Text>
            <ToolInfoTooltip
              label={t(
                "bookletImposition.manualDuplex.instructions",
                "For printers without automatic duplex. Run the tool twice, once for each Print Pass below.",
              )}
            />
          </Group>

          <ButtonSelector
            {...infoLabelProps(
              t("bookletImposition.duplexPass.label", "Print Pass"),
              parameters.duplexPass === "FIRST"
                ? t(
                    "bookletImposition.duplexPass.firstInstructions",
                    "Prints front sides → stack face-down → run again with 2nd Pass",
                  )
                : t(
                    "bookletImposition.duplexPass.secondInstructions",
                    "Load printed stack face-down → prints back sides",
                  ),
            )}
            value={parameters.duplexPass}
            onChange={(value) => onParameterChange("duplexPass", value)}
            options={[
              {
                value: "FIRST",
                label: t("bookletImposition.duplexPass.first", "First Pass"),
              },
              {
                value: "SECOND",
                label: t("bookletImposition.duplexPass.second", "Second Pass"),
              },
            ]}
            disabled={disabled}
          />
        </Stack>
      )}

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

export default BookletImpositionSettings;
