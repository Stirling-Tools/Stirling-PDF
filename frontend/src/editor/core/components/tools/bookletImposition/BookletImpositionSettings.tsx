import { useTranslation } from "react-i18next";
import { Stack, Text, Group, Checkbox } from "@mantine/core";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
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
            <InfoTooltip
              label={t(
                "bookletImposition.manualDuplex.instructions",
                "For printers without automatic duplex. You'll need to run this twice:",
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
    </Stack>
  );
};

export default BookletImpositionSettings;
