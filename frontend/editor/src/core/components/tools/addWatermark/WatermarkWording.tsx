import React from "react";
import { Stack, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddWatermarkParameters } from "@app/hooks/tools/addWatermark/useAddWatermarkParameters";
import { removeEmojis } from "@app/utils/textUtils";

interface WatermarkWordingProps {
  parameters: AddWatermarkParameters;
  onParameterChange: <K extends keyof AddWatermarkParameters>(
    key: K,
    value: AddWatermarkParameters[K],
  ) => void;
  disabled?: boolean;
  /** Render a visible label with a required asterisk (e.g. in policies, where
   * empty text is refused at save). */
  requireText?: boolean;
}

const WatermarkWording = ({
  parameters,
  onParameterChange,
  disabled = false,
  requireText = false,
}: WatermarkWordingProps) => {
  const { t } = useTranslation();

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const filteredValue = removeEmojis(value);
    onParameterChange("watermarkText", filteredValue);
  };

  return (
    <Stack gap="sm">
      <TextInput
        label={
          requireText
            ? t("watermark.settings.text.label", "Watermark text")
            : undefined
        }
        withAsterisk={requireText}
        placeholder={t(
          "watermark.settings.text.placeholder",
          "Enter watermark text",
        )}
        value={parameters.watermarkText}
        onChange={handleTextChange}
        disabled={disabled}
      />
    </Stack>
  );
};

export default WatermarkWording;
