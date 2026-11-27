import { Stack, Text, Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ConvertParameters } from "@editor/hooks/tools/convert/useConvertParameters";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";

interface ConvertFromCbzSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(
    key: K,
    value: ConvertParameters[K],
  ) => void;
  disabled?: boolean;
}

const ConvertFromCbzSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: ConvertFromCbzSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm" data-testid="cbz-settings">
      <Text size="sm" fw={500}>
        {t("convert.cbzOptions", "CBZ to PDF Options")}
      </Text>

      <Checkbox
        {...infoLabelProps(
          t("convert.optimizeForEbook", "Optimize PDF for ebook readers"),
          t(
            "convert.optimizeForEbookInfo",
            "Uses Ghostscript to reduce file size and improve rendering on ebook readers.",
          ),
        )}
        checked={parameters.cbzOptions.optimizeForEbook}
        onChange={(event) =>
          onParameterChange("cbzOptions", {
            ...parameters.cbzOptions,
            optimizeForEbook: event.currentTarget.checked,
          })
        }
        disabled={disabled}
        data-testid="optimize-ebook-checkbox"
      />
    </Stack>
  );
};

export default ConvertFromCbzSettings;
