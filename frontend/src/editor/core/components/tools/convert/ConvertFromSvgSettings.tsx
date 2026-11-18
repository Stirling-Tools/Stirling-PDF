import { Stack, Text, Checkbox, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
import { ConvertParameters } from "@editor/hooks/tools/convert/useConvertParameters";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";

interface ConvertFromSvgSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(
    key: K,
    value: ConvertParameters[K],
  ) => void;
  disabled?: boolean;
}

const ConvertFromSvgSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: ConvertFromSvgSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm" data-testid="svg-pdf-options-section">
      <Group gap={4}>
        <Text size="sm" fw={500}>
          {t("convert.svgPdfOptions", "SVG to PDF Options")}
        </Text>
        <InfoTooltip
          label={t(
            "convert.svgVectorNote",
            "SVG files are rendered as vector graphics for crisp output at any resolution. Dimensions from the SVG determine the PDF page size.",
          )}
        />
      </Group>

      <Checkbox
        data-testid="combine-svgs-switch"
        {...infoLabelProps(
          t("convert.combineSvgs", "Combine SVGs into single PDF"),
          t(
            "convert.combineSvgsDescription",
            "Combine all SVG files into one PDF with multiple pages, or create separate PDFs for each SVG",
          ),
        )}
        checked={parameters.imageOptions.combineImages}
        onChange={(event) =>
          onParameterChange("imageOptions", {
            ...parameters.imageOptions,
            combineImages: event.currentTarget.checked,
          })
        }
        disabled={disabled}
      />
    </Stack>
  );
};

export default ConvertFromSvgSettings;
