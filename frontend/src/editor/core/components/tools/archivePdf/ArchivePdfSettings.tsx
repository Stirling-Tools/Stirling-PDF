import { Checkbox, Select, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useEndpointEnabled } from "@editor/hooks/useEndpointConfig";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";
import {
  type ArchivePdfParameters,
  type PdfaOutputFormat,
  isPdfaOutputFormat,
} from "@editor/hooks/tools/archivePdf/useArchivePdfParameters";

interface ArchivePdfSettingsProps {
  parameters: ArchivePdfParameters;
  onParameterChange: <K extends keyof ArchivePdfParameters>(
    key: K,
    value: ArchivePdfParameters[K],
  ) => void;
  disabled?: boolean;
}

const LEVEL_B_FORMATS: Partial<Record<PdfaOutputFormat, string>> = {
  "pdfa-1": "PDF/A-1b",
  "pdfa-2b": "PDF/A-2b",
  "pdfa-3b": "PDF/A-3b",
};

const LEVEL_A_FORMATS: Partial<Record<PdfaOutputFormat, string>> = {
  "pdfa-1a": "PDF/A-1a",
  "pdfa-2a": "PDF/A-2a",
  "pdfa-3a": "PDF/A-3a",
};

const ArchivePdfSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: ArchivePdfSettingsProps) => {
  const { t } = useTranslation();
  // Level A needs the same tagger as PDF/UA, so it stands or falls with that endpoint.
  const { enabled: taggingAvailable } = useEndpointEnabled("pdf-to-ua");

  const options = [
    ...Object.entries(LEVEL_B_FORMATS).map(([value, label]) => ({
      value,
      label,
    })),
    ...(taggingAvailable === false
      ? []
      : Object.entries(LEVEL_A_FORMATS).map(([value, format]) => ({
          value,
          label: t("archivePdf.accessibleFormat", "{{format}} (accessible)", {
            format,
          }),
        }))),
  ];

  return (
    <Stack gap="md">
      <Select
        {...infoLabelProps(
          t("archivePdf.outputFormat.label", "PDF/A version"),
          t("archivePdf.outputFormat.desc", "PDF/A-2b suits most archives."),
        )}
        data={options}
        value={parameters.outputFormat}
        onChange={(value) => {
          if (isPdfaOutputFormat(value))
            onParameterChange("outputFormat", value);
        }}
        allowDeselect={false}
        disabled={disabled}
        comboboxProps={{
          withinPortal: true,
          zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
        }}
      />
      <Checkbox
        {...infoLabelProps(
          t("archivePdf.strict.label", "Strict mode"),
          t(
            "archivePdf.strict.desc",
            "Fails instead of returning a file that does not fully comply.",
          ),
        )}
        checked={parameters.strict}
        onChange={(event) =>
          onParameterChange("strict", event.currentTarget.checked)
        }
        disabled={disabled}
      />
    </Stack>
  );
};

export default ArchivePdfSettings;
