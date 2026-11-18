/**
 * RotateAutomationSettings - Used for automation only
 *
 * Simplified rotation settings for automation that allows selecting
 * one of four 90-degree rotation angles.
 */

import { Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { RotateParameters } from "@editor/hooks/tools/rotate/useRotateParameters";
import ButtonSelector from "@editor/components/shared/ButtonSelector";
import { ToolInfoTooltip } from "@editor/components/tools/shared/ToolInfoTooltip";

interface RotateAutomationSettingsProps {
  parameters: RotateParameters;
  onParameterChange: <K extends keyof RotateParameters>(
    key: K,
    value: RotateParameters[K],
  ) => void;
  disabled?: boolean;
}

const RotateAutomationSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: RotateAutomationSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Group gap={4} wrap="nowrap">
        <Text size="sm" fw={500}>
          {t("rotate.selectRotation", "Rotation Angle")}
        </Text>
        <ToolInfoTooltip
          label={t(
            "rotate.selectRotationDirection",
            "Pages are rotated clockwise by the selected angle.",
          )}
        />
      </Group>

      <ButtonSelector
        value={parameters.angle}
        onChange={(value: number) => onParameterChange("angle", value)}
        options={[
          { value: 0, label: "0°" },
          { value: 90, label: "90°" },
          { value: 180, label: "180°" },
          { value: 270, label: "270°" },
        ]}
        disabled={disabled}
      />
    </Stack>
  );
};

export default RotateAutomationSettings;
