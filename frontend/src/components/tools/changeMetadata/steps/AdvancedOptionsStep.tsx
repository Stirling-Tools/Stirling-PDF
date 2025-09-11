import { Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ChangeMetadataParameters } from "../../../../hooks/tools/changeMetadata/useChangeMetadataParameters";
import { TrappedStatus } from "../../../../types/metadata";

interface AdvancedOptionsStepProps {
  parameters: ChangeMetadataParameters;
  onParameterChange: <K extends keyof ChangeMetadataParameters>(key: K, value: ChangeMetadataParameters[K]) => void;
  disabled?: boolean;
}

const AdvancedOptionsStep = ({
  parameters,
  onParameterChange,
  disabled = false
}: AdvancedOptionsStepProps) => {
  const { t } = useTranslation();

  return (
    <Select
      label={t('changeMetadata.trapped.label', 'Trapped Status')}
      description={t('changeMetadata.trapped.description', 'Indicates whether the document has been trapped for high-quality printing')}
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
  );
};

export default AdvancedOptionsStep;
