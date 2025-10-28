/**
 * AddPageNumbersAutomationSettings - Used for automation only
 *
 * Combines both position and appearance settings into a single view
 */

import { Stack, Divider, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddPageNumbersParameters } from "@app/components/tools/addPageNumbers/useAddPageNumbersParameters";
import AddPageNumbersPositionSettings from "@app/components/tools/addPageNumbers/AddPageNumbersPositionSettings";
import AddPageNumbersAppearanceSettings from "@app/components/tools/addPageNumbers/AddPageNumbersAppearanceSettings";

interface AddPageNumbersAutomationSettingsProps {
  parameters: AddPageNumbersParameters;
  onParameterChange: <K extends keyof AddPageNumbersParameters>(key: K, value: AddPageNumbersParameters[K]) => void;
  disabled?: boolean;
}

const AddPageNumbersAutomationSettings = ({
  parameters,
  onParameterChange,
  disabled = false
}: AddPageNumbersAutomationSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="lg">
      {/* Position & Pages Section */}
      <Stack gap="md">
        <Text size="sm" fw={600}>{t("addPageNumbers.positionAndPages", "Position & Pages")}</Text>
        <AddPageNumbersPositionSettings
          parameters={parameters}
          onParameterChange={onParameterChange}
          disabled={disabled}
          file={null}
          showQuickGrid={true}
        />
      </Stack>

      <Divider />

      {/* Appearance Section */}
      <Stack gap="md">
        <Text size="sm" fw={600}>{t("addPageNumbers.customize", "Customize Appearance")}</Text>
        <AddPageNumbersAppearanceSettings
          parameters={parameters}
          onParameterChange={onParameterChange}
          disabled={disabled}
        />
      </Stack>
    </Stack>
  );
};

export default AddPageNumbersAutomationSettings;
