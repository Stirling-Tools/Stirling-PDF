import { Stack, Text, Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
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

      <Text size="xs" c="dimmed" mt="xs">
        {t("convert.svgVectorNote", "SVG files are rendered as vector graphics for crisp output at any resolution. Dimensions from the SVG determine the PDF page size.")}
      </Text>
    </Stack>
  );
};

export default ConvertFromSvgSettings;
