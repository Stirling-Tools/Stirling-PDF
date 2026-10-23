import { Stack, Select, TextInput, Textarea } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  type OutputNaming,
  SplitParameters,
} from "@editor/hooks/tools/split/useSplitParameters";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";
import { describeNamePattern } from "@editor/components/tools/split/splitOutputNamePattern";

const OUTPUT_NAME_PRESETS = [
  { naming: "part", key: "split.outputNames.preset.part", pattern: "Part {n}" },
  {
    naming: "chapter",
    key: "split.outputNames.preset.chapter",
    pattern: "Chapter {n}",
  },
  {
    naming: "section",
    key: "split.outputNames.preset.section",
    pattern: "Section {n}",
  },
] as const satisfies readonly {
  naming: OutputNaming;
  key: string;
  pattern: string;
}[];

const OUTPUT_NAMINGS: readonly OutputNaming[] = [
  "",
  ...OUTPUT_NAME_PRESETS.map((preset) => preset.naming),
  "custom",
  "list",
];

function isOutputNaming(value: string): value is OutputNaming {
  return (OUTPUT_NAMINGS as readonly string[]).includes(value);
}

export interface SplitOutputNamingSettingsProps {
  parameters: SplitParameters;
  onParameterChange: <K extends keyof SplitParameters>(
    key: K,
    value: SplitParameters[K],
  ) => void;
  disabled?: boolean;
}

/** How the documents a split produces are named; shared by every split method. */
const SplitOutputNamingSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: SplitOutputNamingSettingsProps) => {
  const { t } = useTranslation();
  const pattern = parameters.outputNamePattern.trim();

  const handleOutputNamingChange = (value: string | null) => {
    const naming = value && isOutputNaming(value) ? value : "";
    onParameterChange("outputNaming", naming);
    const preset = OUTPUT_NAME_PRESETS.find((p) => p.naming === naming);
    if (preset) {
      onParameterChange("outputNamePattern", t(preset.key, preset.pattern));
    }
  };

  return (
    <Stack gap="sm">
      <Select
        label={t("split.outputNames.label", "Name output files")}
        placeholder={t("split.outputNames.placeholder", "Default names")}
        value={parameters.outputNaming || null}
        onChange={handleOutputNamingChange}
        clearable
        data={[
          ...OUTPUT_NAME_PRESETS.map((preset) => ({
            value: preset.naming,
            label: describeNamePattern(t(preset.key, preset.pattern)),
          })),
          {
            value: "custom",
            label: t("split.outputNames.option.custom", "Custom pattern…"),
          },
          {
            value: "list",
            label: t("split.outputNames.option.list", "Type each name…"),
          },
        ]}
        disabled={disabled}
        comboboxProps={{
          withinPortal: true,
          zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
        }}
      />
      {parameters.outputNaming === "custom" && (
        <TextInput
          label={t("split.outputNames.pattern.label", "Pattern")}
          description={
            pattern
              ? t(
                  "split.outputNames.pattern.description",
                  "{n} becomes the file number: {{example}}",
                  { example: describeNamePattern(pattern) },
                )
              : t(
                  "split.outputNames.pattern.hint",
                  "{n} becomes the file number",
                )
          }
          placeholder={t(
            "split.outputNames.pattern.placeholder",
            "Invoice {n}",
          )}
          value={parameters.outputNamePattern}
          onChange={(e) =>
            onParameterChange("outputNamePattern", e.target.value)
          }
          disabled={disabled}
        />
      )}
      {parameters.outputNaming === "list" && (
        <Textarea
          label={t("split.outputNames.list.label", "File names")}
          description={t(
            "split.outputNames.list.description",
            "One name per line, in order. A blank line, or a file beyond the list, keeps the default name.",
          )}
          placeholder={t("split.outputNames.list.placeholder", "Cover")}
          value={parameters.outputNames}
          onChange={(e) => onParameterChange("outputNames", e.target.value)}
          autosize
          minRows={3}
          maxRows={10}
          disabled={disabled}
        />
      )}
    </Stack>
  );
};

export default SplitOutputNamingSettings;
