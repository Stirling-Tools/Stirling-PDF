import { Stack, Text, NumberInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";

interface ConvertToCbrSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(key: K, value: ConvertParameters[K]) => void;
  disabled?: boolean;
}

const ConvertToCbrSettings = ({
  parameters,
  onParameterChange,
  disabled = false
}: ConvertToCbrSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="sm" data-testid="cbr-output-settings">
      <Text size="sm" fw={500}>{t("convert.cbrOutputOptions", "PDF to CBR Options")}:</Text>

      <NumberInput
        data-testid="cbr-dpi-input"
        label={t("convert.cbrDpi", "DPI for image rendering")}
        value={parameters.pdfToCbrOptions.dpi}
        onChange={(val) =>
          typeof val === 'number' &&
          onParameterChange('pdfToCbrOptions', { ...parameters.pdfToCbrOptions, dpi: val })
        }
        min={72}
        max={600}
        step={50}
        disabled={disabled}
      />
    </Stack>
  );
};

export default ConvertToCbrSettings;
