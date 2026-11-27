import { Stack, Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ConvertParameters } from "@editor/hooks/tools/convert/useConvertParameters";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";

interface ConvertFromEbookSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(
    key: K,
    value: ConvertParameters[K],
  ) => void;
  disabled?: boolean;
}

const ConvertFromEbookSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: ConvertFromEbookSettingsProps) => {
  const { t } = useTranslation();

  const handleIncludeTableOfContentsChange = (value: boolean) => {
    onParameterChange("ebookOptions", {
      includeTableOfContents: value,
      includePageNumbers: parameters.ebookOptions?.includePageNumbers ?? false,
      optimizeForEbook: parameters.ebookOptions?.optimizeForEbook ?? false,
    });
  };

  const handleIncludePageNumbersChange = (value: boolean) => {
    onParameterChange("ebookOptions", {
      includeTableOfContents:
        parameters.ebookOptions?.includeTableOfContents ?? false,
      includePageNumbers: value,
      optimizeForEbook: parameters.ebookOptions?.optimizeForEbook ?? false,
    });
  };

  const handleOptimizeForEbookChange = (value: boolean) => {
    onParameterChange("ebookOptions", {
      includeTableOfContents:
        parameters.ebookOptions?.includeTableOfContents ?? false,
      includePageNumbers: parameters.ebookOptions?.includePageNumbers ?? false,
      optimizeForEbook: value,
    });
  };

  // Initialize ebookOptions if not present
  const ebookOptions = parameters.ebookOptions || {
    includeTableOfContents: false,
    includePageNumbers: false,
    optimizeForEbook: false,
  };

  return (
    <Stack gap="sm">
      <Checkbox
        label={t(
          "convert.ebookOptions.includeTableOfContents",
          "Include table of contents",
        )}
        checked={ebookOptions.includeTableOfContents}
        onChange={(event) =>
          handleIncludeTableOfContentsChange(event.currentTarget.checked)
        }
        disabled={disabled}
      />
      <Checkbox
        label={t(
          "convert.ebookOptions.includePageNumbers",
          "Include page numbers",
        )}
        checked={ebookOptions.includePageNumbers}
        onChange={(event) =>
          handleIncludePageNumbersChange(event.currentTarget.checked)
        }
        disabled={disabled}
      />
      <Checkbox
        {...infoLabelProps(
          t(
            "convert.ebookOptions.optimizeForEbookPdf",
            "Optimize for ebook readers",
          ),
          t(
            "convert.ebookOptions.optimizeForEbookPdfDesc",
            "Optimize the PDF for eBook reading (smaller file size, better rendering on eInk devices)",
          ),
        )}
        checked={ebookOptions.optimizeForEbook}
        onChange={(event) =>
          handleOptimizeForEbookChange(event.currentTarget.checked)
        }
        disabled={disabled}
      />
    </Stack>
  );
};

export default ConvertFromEbookSettings;
