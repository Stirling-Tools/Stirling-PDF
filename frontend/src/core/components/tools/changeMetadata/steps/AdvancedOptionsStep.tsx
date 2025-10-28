import { Stack, Select, Divider } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ChangeMetadataParameters } from "@app/hooks/tools/changeMetadata/useChangeMetadataParameters";
import { TrappedStatus } from "@app/types/metadata";
import CustomMetadataStep from "@app/components/tools/changeMetadata/steps/CustomMetadataStep";

interface AdvancedOptionsStepProps {
  parameters: ChangeMetadataParameters;
  onParameterChange: <K extends keyof ChangeMetadataParameters>(key: K, value: ChangeMetadataParameters[K]) => void;
  disabled?: boolean;
  addCustomMetadata: (key?: string, value?: string) => void;
  removeCustomMetadata: (id: string) => void;
  updateCustomMetadata: (id: string, key: string, value: string) => void;
}

const AdvancedOptionsStep = ({
  parameters,
  onParameterChange,
  disabled = false,
  addCustomMetadata,
  removeCustomMetadata,
  updateCustomMetadata
}: AdvancedOptionsStepProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      {/* Trapped Status */}
      <Select
        label={t('changeMetadata.trapped.label', 'Trapped Status')}
        value={parameters.trapped}
        onChange={(value) => {
          if (value) {
            onParameterChange('trapped', value as TrappedStatus);
          }
        }}
        disabled={disabled || parameters.deleteAll}
        data={[
          { value: TrappedStatus.UNKNOWN, label: t('changeMetadata.trapped.unknown', 'Unknown') },
          { value: TrappedStatus.TRUE, label: t('changeMetadata.trapped.true', 'True') },
          { value: TrappedStatus.FALSE, label: t('changeMetadata.trapped.false', 'False') }
        ]}
      />

      <Divider />

      {/* Custom Metadata */}
      <CustomMetadataStep
        parameters={parameters}
        onParameterChange={onParameterChange}
        disabled={disabled}
        addCustomMetadata={addCustomMetadata}
        removeCustomMetadata={removeCustomMetadata}
        updateCustomMetadata={updateCustomMetadata}
      />
    </Stack>
  );
};

export default AdvancedOptionsStep;
