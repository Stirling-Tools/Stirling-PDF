/**
 * SplitAutomationSettings - Used for automation only
 *
 * Combines split method selection and method-specific settings
 * into a single component for automation workflows.
 */

import { Stack, Text, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SplitParameters } from "@app/hooks/tools/split/useSplitParameters";
import { METHOD_OPTIONS, SplitMethod } from "@app/constants/splitConstants";
import SplitSettings from "@app/components/tools/split/SplitSettings";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

interface SplitAutomationSettingsProps {
  parameters: SplitParameters;
  onParameterChange: <K extends keyof SplitParameters>(key: K, value: SplitParameters[K]) => void;
  disabled?: boolean;
}

const SplitAutomationSettings = ({ parameters, onParameterChange, disabled = false }: SplitAutomationSettingsProps) => {
  const { t } = useTranslation();

  // Convert METHOD_OPTIONS to Select data format
  const methodSelectOptions = METHOD_OPTIONS.map((option) => {
    const prefix = t(option.prefixKey, "Split");
    const name = t(option.nameKey, "Method");
    return {
      value: option.value,
      label: `${prefix} ${name}`,
    };
  });

  return (
    <Stack gap="lg">
      {/* Method Selection */}
      <Select
        label={t("split.steps.chooseMethod", "Choose Method")}
        placeholder={t("split.selectMethod", "Select a split method")}
        value={parameters.method}
        onChange={(value) => onParameterChange('method', value as (SplitMethod | '') || '')}
        data={methodSelectOptions}
        disabled={disabled}
        comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
      />

      {/* Method-Specific Settings */}
      {parameters.method && (
        <>
          <Text size="sm" fw={500}>
            {t("split.steps.settings", "Settings")}
          </Text>
          <SplitSettings
            parameters={parameters}
            onParameterChange={onParameterChange}
            disabled={disabled}
          />
        </>
      )}
    </Stack>
  );
};

export default SplitAutomationSettings;
