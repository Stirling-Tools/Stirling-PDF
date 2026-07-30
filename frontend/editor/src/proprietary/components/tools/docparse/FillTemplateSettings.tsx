import { useTranslation } from "react-i18next";
import { Stack, Text, Textarea } from "@mantine/core";
import type { ToolAutomationSettingsProps } from "@app/hooks/tools/shared/toolOperationTypes";
import {
  isJsonObjectString,
  type FillTemplateParameters,
} from "@app/hooks/tools/fillTemplate/useFillTemplateParameters";
import DocparseToolIntro from "@app/components/tools/docparse/DocparseToolIntro";

const FillTemplateSettings = ({
  parameters,
  onParameterChange,
  disabled,
}: ToolAutomationSettingsProps<FillTemplateParameters>) => {
  const { t } = useTranslation();

  const dataJson = parameters.dataJson;
  const jsonError =
    dataJson.trim().length > 0 && !isJsonObjectString(dataJson)
      ? t("fillTemplate.data.invalid", "Enter a valid JSON object")
      : null;

  return (
    <Stack gap="sm">
      <DocparseToolIntro
        description={t(
          "fillTemplate.intro",
          "Replaces the placeholders in a Word (.docx) template with your JSON data and returns the filled document - deterministic, no AI involved.",
        )}
        showFallbackNote={false}
      />
      <Text size="sm" c="dimmed">
        {t(
          "fillTemplate.hint",
          "The input file must be a .docx template (not a PDF). Each placeholder in the template is replaced with the matching JSON value.",
        )}
      </Text>
      <Textarea
        label={t("fillTemplate.data.label", "Data (JSON)")}
        placeholder='{"customer": "ACME Corp", "total": "128.00"}'
        value={dataJson}
        onChange={(event) =>
          onParameterChange("dataJson", event.currentTarget.value)
        }
        minRows={5}
        autosize
        error={jsonError}
        disabled={disabled}
      />
    </Stack>
  );
};

export default FillTemplateSettings;
