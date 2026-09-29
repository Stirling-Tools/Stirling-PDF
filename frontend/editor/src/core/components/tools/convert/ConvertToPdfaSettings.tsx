import { useId } from "react";
import { Stack, Text, Select, Alert, Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";
import { usePdfSignatureDetection } from "@app/hooks/usePdfSignatureDetection";
import { useEndpointEnabled } from "@app/hooks/useEndpointConfig";
import { StirlingFile } from "@app/types/fileContext";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

interface ConvertToPdfaSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(
    key: K,
    value: ConvertParameters[K],
  ) => void;
  selectedFiles: StirlingFile[];
  disabled?: boolean;
}

const ConvertToPdfaSettings = ({
  parameters,
  onParameterChange,
  selectedFiles,
  disabled = false,
}: ConvertToPdfaSettingsProps) => {
  const { t } = useTranslation();
  const { hasDigitalSignatures, isChecking } =
    usePdfSignatureDetection(selectedFiles);
  const outputFormatLabelId = useId();
  // Level A needs the same tagger as PDF/UA, so it stands or falls with that endpoint.
  const { enabled: taggingAvailable } = useEndpointEnabled("pdf-to-ua");

  const pdfaFormatOptions = [
    { value: "pdfa-1", label: "PDF/A-1b" },
    { value: "pdfa-2b", label: "PDF/A-2b" },
    { value: "pdfa-3b", label: "PDF/A-3b" },
    // Level A is level B plus accessibility: it additionally tags the document.
    ...(taggingAvailable === false
      ? []
      : [
          { value: "pdfa-1a", label: "PDF/A-1a (accessible)" },
          { value: "pdfa-2a", label: "PDF/A-2a (accessible)" },
          { value: "pdfa-3a", label: "PDF/A-3a (accessible)" },
        ]),
  ];

  return (
    <Stack gap="sm" data-testid="pdfa-settings">
      <Text size="sm" fw={500}>
        {t("convert.pdfaOptions", "PDF/A Options")}:
      </Text>

      {hasDigitalSignatures && (
        <Alert color="yellow">
          <Text size="sm">
            {t(
              "convert.pdfaDigitalSignatureWarning",
              "The PDF contains a digital signature. This will be removed in the next step.",
            )}
          </Text>
        </Alert>
      )}

      <Stack gap="xs">
        <Text id={outputFormatLabelId} size="xs" fw={500}>
          {t("convert.outputFormat", "Output Format")}:
        </Text>
        <Select
          aria-labelledby={outputFormatLabelId}
          value={parameters.pdfaOptions.outputFormat}
          onChange={(value) =>
            onParameterChange("pdfaOptions", {
              ...parameters.pdfaOptions,
              outputFormat: value || "pdfa-2b",
            })
          }
          data={pdfaFormatOptions}
          disabled={disabled || isChecking}
          data-testid="pdfa-output-format-select"
          comboboxProps={{
            withinPortal: true,
            zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
          }}
        />
        <Text size="xs" c="dimmed">
          {t(
            "convert.pdfaNote",
            "PDF/A-1b is more compatible, PDF/A-2b supports more features, PDF/A-3b supports embedded files.",
          )}
        </Text>
      </Stack>

      <Checkbox
        label={t("convert.strictMode", "Strict Mode")}
        description={t(
          "convert.strictModeDesc",
          "Error if conversion is not perfect (uses VeraPDF verification)",
        )}
        checked={parameters.pdfaOptions.strict}
        onChange={(event) =>
          onParameterChange("pdfaOptions", {
            ...parameters.pdfaOptions,
            strict: event.currentTarget.checked,
          })
        }
        disabled={disabled || isChecking}
      />
    </Stack>
  );
};

export default ConvertToPdfaSettings;
