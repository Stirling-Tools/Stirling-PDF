import { useTranslation } from "react-i18next";
import { NumberInput, Stack, Textarea } from "@mantine/core";
import type { ToolAutomationSettingsProps } from "@app/hooks/tools/shared/toolOperationTypes";
import type { SmartSplitParameters } from "@app/hooks/tools/smartSplit/useSmartSplitParameters";
import DocparseToolIntro from "@app/components/tools/docparse/DocparseToolIntro";

const SmartSplitSettings = ({
  parameters,
  onParameterChange,
  disabled,
}: ToolAutomationSettingsProps<SmartSplitParameters>) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <DocparseToolIntro
        description={t(
          "smartSplit.intro",
          "Describe where sub-documents start in plain language and AI reads the content to find those boundaries - no page numbers needed.",
        )}
        aiBadge="llm"
      />
      <Textarea
        label={t("smartSplit.rule.label", "Split rule")}
        placeholder={t(
          "smartSplit.rule.placeholder",
          "e.g. Start a new document at every invoice header",
        )}
        value={parameters.rule}
        onChange={(event) =>
          onParameterChange("rule", event.currentTarget.value)
        }
        minRows={3}
        autosize
        disabled={disabled}
      />
      <NumberInput
        label={t("smartSplit.maxParts.label", "Maximum parts")}
        value={parameters.maxParts}
        onChange={(value) =>
          onParameterChange("maxParts", typeof value === "number" ? value : 1)
        }
        min={1}
        max={100}
        disabled={disabled}
      />
    </Stack>
  );
};

export default SmartSplitSettings;
