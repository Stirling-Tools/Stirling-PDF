import { Stack, Text, Select, Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { FIT_OPTIONS } from "@app/constants/convertConstants";
import { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";

interface ConvertFromSvgSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(key: K, value: ConvertParameters[K]) => void;
  disabled?: boolean;
}

const ConvertFromSvgSettings = ({
  parameters,
  onParameterChange,
  disabled = false
}: ConvertFromSvgSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm" data-testid="svg-pdf-options-section">
      <Text size="sm" fw={500}>{t("convert.svgPdfOptions", "SVG to PDF Options")}:</Text>
      
      <Switch
        data-testid="combine-svgs-switch"
        label={t("convert.combineSvgs", "Combine SVGs into single PDF")}
        description={t("convert.combineSvgsDescription", "Combine all SVG files into one PDF with multiple pages, or create separate PDFs for each SVG")}
        checked={parameters.imageOptions.combineImages}
        onChange={(event) => onParameterChange('imageOptions', {
          ...parameters.imageOptions,
          combineImages: event.currentTarget.checked
        })}
        disabled={disabled}
      />

      {parameters.imageOptions.combineImages && (
        <>
          <Select
            data-testid="svg-fit-option-select"
            label={t("convert.fitOption", "Fit Option")}
            description={t("convert.svgFitOptionDescription", "How to fit SVGs onto PDF pages")}
            value={parameters.imageOptions.fitOption}
            onChange={(val) => val && onParameterChange('imageOptions', {
              ...parameters.imageOptions,
              fitOption: val as typeof FIT_OPTIONS[keyof typeof FIT_OPTIONS]
            })}
            data={[
              { value: FIT_OPTIONS.MAINTAIN_ASPECT, label: t("convert.maintainAspectRatio", "Maintain Aspect Ratio") },
              { value: FIT_OPTIONS.FIT_PAGE, label: t("convert.fitDocumentToImage", "Fit Document to Image") },
              { value: FIT_OPTIONS.FILL_PAGE, label: t("convert.fillPage", "Fill Page") },
            ]}
            disabled={disabled}
          />

          <Switch
            data-testid="svg-auto-rotate-switch"
            label={t("convert.autoRotate", "Auto Rotate")}
            description={t("convert.autoRotateDescription", "Automatically rotate SVGs to better fit the PDF page")}
            checked={parameters.imageOptions.autoRotate}
            onChange={(event) => onParameterChange('imageOptions', {
              ...parameters.imageOptions,
              autoRotate: event.currentTarget.checked
            })}
            disabled={disabled}
          />
        </>
      )}

      <Text size="xs" c="dimmed" mt="xs">
        {t("convert.svgVectorNote", "SVG files are rendered as vector graphics for crisp output at any resolution. Dimensions from the SVG determine the PDF page size (defaults to A4 if not specified).")}
      </Text>
    </Stack>
  );
};

export default ConvertFromSvgSettings;
