import { Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ChangeMetadataParameters } from "@app/hooks/tools/changeMetadata/useChangeMetadataParameters";

interface DeleteAllStepProps {
  parameters: ChangeMetadataParameters;
  onParameterChange: <K extends keyof ChangeMetadataParameters>(key: K, value: ChangeMetadataParameters[K]) => void;
  disabled?: boolean;
}

const DeleteAllStep = ({
  parameters,
  onParameterChange,
  disabled = false
}: DeleteAllStepProps) => {
  const { t } = useTranslation();

  return (
    <Checkbox
      label={t('changeMetadata.deleteAll.checkbox', 'Delete all metadata')}
      checked={parameters.deleteAll}
      onChange={(e) => onParameterChange('deleteAll', e.target.checked)}
      disabled={disabled}
    />
  );
};

export default DeleteAllStep;
