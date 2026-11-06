import { useId } from "react";
import { Checkbox, Select, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ConvertParameters } from "@editor/hooks/tools/convert/useConvertParameters";
import { StirlingFile } from "@editor/types/fileContext";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";

interface ConvertToPdfxSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(
    key: K,
    value: ConvertParameters[K],
  ) => void;
  selectedFiles: StirlingFile[];
  disabled?: boolean;
}

const ConvertToPdfxSettings = ({
  parameters,
  onParameterChange,
  selectedFiles: _selectedFiles,
  disabled = false,
}: ConvertToPdfxSettingsProps) => {
  const { t } = useTranslation();
  const outputFormatLabelId = useId();

  const pdfxFormatOptions = [
    { value: "pdfx-1a", label: "PDF/X-1a:2001" },
    { value: "pdfx-3", label: "PDF/X-3:2002" },
    {
      value: "pdfx",
      label: t("convert.pdfxDefault", "PDF/X-4:2008 (default)"),
    },
    { value: "pdfx-4", label: "PDF/X-4:2008" },
    { value: "pdfx-6", label: "PDF/X-6:2020" },
  ];

  return (
    <Stack gap="sm" data-testid="pdfx-settings">
      <Text size="sm" fw={500}>
        {t("convert.pdfxOptions", "PDF/X Options")}:
      </Text>
      <Stack gap="xs">
        <Text id={outputFormatLabelId} size="xs" fw={500}>
          {t("convert.outputFormat", "Output Format")}:
        </Text>
        <Select
          aria-labelledby={outputFormatLabelId}
          value={parameters.pdfxOptions.outputFormat}
          onChange={(value) =>
            onParameterChange("pdfxOptions", {
              ...parameters.pdfxOptions,
              outputFormat: value || "pdfx",
            })
          }
          data={pdfxFormatOptions}
          disabled={disabled}
          data-testid="pdfx-output-format-select"
          comboboxProps={{
            withinPortal: true,
            zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
          }}
        />
        <Text size="xs" c="dimmed">
          {t(
            "convert.pdfxNote",
            "PDF/X-1a and PDF/X-3 are CMYK, no-transparency print profiles; PDF/X-4 and PDF/X-6 support live transparency.",
          )}
        </Text>
        <Checkbox
          checked={Boolean(parameters.pdfxOptions.strict)}
          onChange={(event) =>
            onParameterChange("pdfxOptions", {
              ...parameters.pdfxOptions,
              strict: event.currentTarget.checked,
            })
          }
          label={t(
            "convert.pdfxStrict",
            "Fail if the output has non-embedded fonts",
          )}
          disabled={disabled}
          data-testid="pdfx-strict-checkbox"
        />
      </Stack>
    </Stack>
  );
};

export default ConvertToPdfxSettings;
