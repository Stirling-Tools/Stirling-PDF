import { useTranslation } from "react-i18next";
import { Checkbox, Select, Stack } from "@mantine/core";
import type { ToolAutomationSettingsProps } from "@app/hooks/tools/shared/toolOperationTypes";
import type {
  DocparseMode,
  ParseDocumentParameters,
} from "@app/hooks/tools/parseDocument/useParseDocumentParameters";
import DocparseToolIntro from "@app/components/tools/docparse/DocparseToolIntro";

const ParseDocumentSettings = ({
  parameters,
  onParameterChange,
  disabled,
}: ToolAutomationSettingsProps<ParseDocumentParameters>) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <DocparseToolIntro
        description={t(
          "parseDocument.intro",
          "Reads the document's layout - headings, paragraphs, tables - and turns it into clean structured JSON or Markdown you can feed to other systems.",
        )}
        aiBadge="layout"
      />
      <Select
        label={t("parseDocument.mode.label", "Mode")}
        value={parameters.mode}
        onChange={(value) =>
          onParameterChange("mode", (value ?? "auto") as DocparseMode)
        }
        data={[
          { value: "auto", label: t("parseDocument.mode.auto", "Auto") },
          { value: "basic", label: t("parseDocument.mode.basic", "Basic") },
          {
            value: "advanced",
            label: t("parseDocument.mode.advanced", "Advanced"),
          },
        ]}
        disabled={disabled}
      />
      <Select
        label={t("parseDocument.outputFormat.label", "Output format")}
        value={parameters.outputFormat}
        onChange={(value) =>
          onParameterChange(
            "outputFormat",
            (value ?? "json") as ParseDocumentParameters["outputFormat"],
          )
        }
        data={[
          {
            value: "json",
            label: t("parseDocument.outputFormat.json", "JSON"),
          },
          {
            value: "markdown",
            label: t("parseDocument.outputFormat.markdown", "Markdown"),
          },
        ]}
        disabled={disabled}
      />
      <Checkbox
        label={t(
          "parseDocument.withOcr.label",
          "Apply OCR to scanned pages (recommended)",
        )}
        checked={parameters.withOcr}
        onChange={(event) =>
          onParameterChange("withOcr", event.currentTarget.checked)
        }
        disabled={disabled}
      />
    </Stack>
  );
};

export default ParseDocumentSettings;
