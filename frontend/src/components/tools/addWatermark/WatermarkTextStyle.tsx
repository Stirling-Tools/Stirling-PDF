import React from "react";
import { Stack, Text, Select, ColorInput, NumberInput, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddWatermarkParameters } from "./types";

interface WatermarkTextStyleProps {
  parameters: AddWatermarkParameters;
  onParameterChange: (key: keyof AddWatermarkParameters, value: any) => void;
  disabled?: boolean;
}

const WatermarkTextStyle = ({ parameters, onParameterChange, disabled = false }: WatermarkTextStyleProps) => {
  const { t } = useTranslation();

  const alphabetOptions = [
    { value: "roman", label: "Roman" },
    { value: "arabic", label: "العربية" },
    { value: "japanese", label: "日本語" },
    { value: "korean", label: "한국어" },
    { value: "chinese", label: "简体中文" },
    { value: "thai", label: "ไทย" },
  ];

  return (
    <Stack gap="sm">
      <Group align="flex-start">
        <Stack gap="xs" style={{ flex: 1 }}>
          <Text size="xs" fw={500}>
            {t("watermark.settings.color", "Colour")}
          </Text>
          <ColorInput
            value={parameters.customColor}
            onChange={(value) => onParameterChange("customColor", value)}
            disabled={disabled}
            format="hex"
          />
        </Stack>

        <Stack gap="xs" style={{ flex: 0.5 }}>
          <Text size="xs" fw={500}>
            {t("watermark.settings.fontSize", "Size")}
          </Text>
          <NumberInput
            value={parameters.fontSize}
            onChange={(value) => onParameterChange("fontSize", value || 12)}
            min={8}
            max={72}
            disabled={disabled}
          />
        </Stack>
      </Group>
      <Text size="xs" fw={500}>
        {t("watermark.settings.alphabet", "Alphabet")}
      </Text>
      <Select
        value={parameters.alphabet}
        onChange={(value) => value && onParameterChange("alphabet", value)}
        data={alphabetOptions}
        disabled={disabled}
      />
    </Stack>
  );
};

export default WatermarkTextStyle;
