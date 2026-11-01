import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Stack,
  Text,
  Divider,
  Group,
  NumberInput,
  Checkbox,
} from "@mantine/core";
import { Collapsible } from "@editor/ui/Collapsible";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
import { BookletImpositionParameters } from "@editor/hooks/tools/bookletImposition/useBookletImpositionParameters";
import ButtonSelector from "@editor/components/shared/ButtonSelector";

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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <Stack gap="md">
      <Divider ml="-md" />

      <Group gap="xs" wrap="nowrap">
        <Checkbox
          checked={parameters.doubleSided}
          onChange={(event) => {
            const isDoubleSided = event.currentTarget.checked;
            onParameterChange("doubleSided", isDoubleSided);
            onParameterChange("duplexPass", isDoubleSided ? "BOTH" : "FIRST");
          }}
          disabled={disabled}
          label={t(
            "bookletImposition.doubleSided.label",
            "Double-sided printing",
          )}
        />
        <InfoTooltip
          label={t(
            "bookletImposition.doubleSided.tooltip",
            "Creates both front and back sides for proper booklet printing",
          )}
        />
      </Group>

      {!parameters.doubleSided && (
        <Stack gap="sm" ml="lg">
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" fw={500}>
              {t("bookletImposition.manualDuplex.title", "Manual Duplex Mode")}
            </Text>
            <InfoTooltip
              label={t(
                "bookletImposition.manualDuplex.instructions",
                "For printers without automatic duplex. You'll need to run this twice:",
              )}
            />
          </Group>

          <Group gap="xs" wrap="nowrap">
            <Text size="sm" fw={500}>
              {t("bookletImposition.duplexPass.label", "Print Pass")}
            </Text>
            <InfoTooltip
              label={
                parameters.duplexPass === "FIRST"
                  ? t(
                      "bookletImposition.duplexPass.firstInstructions",
                      "Prints front sides → stack face-down → run again with 2nd Pass",
                    )
                  : t(
                      "bookletImposition.duplexPass.secondInstructions",
                      "Load printed stack face-down → prints back sides",
                    )
              }
            />
          </Group>
          <ButtonSelector
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

      <Divider />

      <Collapsible
        open={advancedOpen}
        onToggle={() => setAdvancedOpen((open) => !open)}
        header={t("bookletImposition.advanced.toggle", "Advanced Options")}
      >
        <Stack gap="md" inert={!advancedOpen}>
          <Group gap="xs" wrap="nowrap">
            <Checkbox
              checked={parameters.spineLocation === "RIGHT"}
              onChange={(event) =>
                onParameterChange(
                  "spineLocation",
                  event.currentTarget.checked ? "RIGHT" : "LEFT",
                )
              }
              disabled={disabled}
              label={t(
                "bookletImposition.rtlBinding.label",
                "Right-to-left binding",
              )}
            />
            <InfoTooltip
              label={t(
                "bookletImposition.rtlBinding.tooltip",
                "For Arabic, Hebrew, or other right-to-left languages",
              )}
            />
          </Group>

          <Group gap="xs" wrap="nowrap">
            <Checkbox
              checked={parameters.addBorder}
              onChange={(event) =>
                onParameterChange("addBorder", event.currentTarget.checked)
              }
              disabled={disabled}
              label={t(
                "bookletImposition.addBorder.label",
                "Add borders around pages",
              )}
            />
            <InfoTooltip
              label={t(
                "bookletImposition.addBorder.tooltip",
                "Adds borders around each page section to help with cutting and alignment",
              )}
            />
          </Group>

          <Stack gap="xs">
            <Group gap="xs" wrap="nowrap">
              <Checkbox
                checked={parameters.addGutter}
                onChange={(event) =>
                  onParameterChange("addGutter", event.currentTarget.checked)
                }
                disabled={disabled}
                label={t(
                  "bookletImposition.addGutter.label",
                  "Add gutter margin",
                )}
              />
              <InfoTooltip
                label={t(
                  "bookletImposition.addGutter.tooltip",
                  "Adds inner margin space for binding",
                )}
              />
            </Group>

            {parameters.addGutter && (
              <NumberInput
                label={t(
                  "bookletImposition.gutterSize.label",
                  "Gutter size (points)",
                )}
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
                size="sm"
              />
            )}
          </Stack>

          <Group gap="xs" wrap="nowrap">
            <Checkbox
              checked={parameters.flipOnShortEdge}
              onChange={(event) =>
                onParameterChange(
                  "flipOnShortEdge",
                  event.currentTarget.checked,
                )
              }
              disabled={disabled || !parameters.doubleSided}
              label={t(
                "bookletImposition.flipOnShortEdge.label",
                "Flip on short edge",
              )}
            />
            <InfoTooltip
              label={
                !parameters.doubleSided
                  ? t(
                      "bookletImposition.flipOnShortEdge.manualNote",
                      "Not needed in manual mode - you flip the stack yourself",
                    )
                  : t(
                      "bookletImposition.flipOnShortEdge.tooltip",
                      "Enable for short-edge duplex printing (automatic duplex only - ignored in manual mode)",
                    )
              }
            />
          </Group>
        </Stack>
      </Collapsible>
    </Stack>
  );
};

export default BookletImpositionSettings;
