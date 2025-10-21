import { Stack, Divider, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ChangeMetadataParameters, createCustomMetadataFunctions } from "@app/hooks/tools/changeMetadata/useChangeMetadataParameters";
import { useMetadataExtraction } from "@app/hooks/tools/changeMetadata/useMetadataExtraction";
import DeleteAllStep from "@app/components/tools/changeMetadata/steps/DeleteAllStep";
import StandardMetadataStep from "@app/components/tools/changeMetadata/steps/StandardMetadataStep";
import DocumentDatesStep from "@app/components/tools/changeMetadata/steps/DocumentDatesStep";
import AdvancedOptionsStep from "@app/components/tools/changeMetadata/steps/AdvancedOptionsStep";

interface ChangeMetadataSingleStepProps {
  parameters: ChangeMetadataParameters;
  onParameterChange: <K extends keyof ChangeMetadataParameters>(key: K, value: ChangeMetadataParameters[K]) => void;
  disabled?: boolean;
}

const ChangeMetadataSingleStep = ({
  parameters,
  onParameterChange,
  disabled = false
}: ChangeMetadataSingleStepProps) => {
  const { t } = useTranslation();

  // Get custom metadata functions using the utility
  const { addCustomMetadata, removeCustomMetadata, updateCustomMetadata } = createCustomMetadataFunctions(
    parameters,
    onParameterChange
  );

  // Extract metadata from uploaded files
  const { isExtractingMetadata } = useMetadataExtraction({
    updateParameter: onParameterChange,
  });

  const isDeleteAllEnabled = parameters.deleteAll;
  const fieldsDisabled = disabled || isDeleteAllEnabled || isExtractingMetadata;

  return (
    <Stack gap="md">
      {/* Delete All */}
      <Stack gap="md">
        <Text size="sm" fw={500}>
          {t('changeMetadata.deleteAll.label', 'Delete All Metadata')}
        </Text>
        <DeleteAllStep
          parameters={parameters}
          onParameterChange={onParameterChange}
          disabled={disabled}
        />
      </Stack>

      <Divider />

      {/* Standard Metadata Fields */}
      <Stack gap="md">
        <Text size="sm" fw={500}>
          {t('changeMetadata.standardFields.title', 'Standard Metadata')}
        </Text>
        <StandardMetadataStep
          parameters={parameters}
          onParameterChange={onParameterChange}
          disabled={fieldsDisabled}
        />
      </Stack>

      <Divider />

      {/* Document Dates */}
      <Stack gap="md">
        <Text size="sm" fw={500}>
          {t('changeMetadata.dates.title', 'Document Dates')}
        </Text>
        <DocumentDatesStep
          parameters={parameters}
          onParameterChange={onParameterChange}
          disabled={fieldsDisabled}
        />
      </Stack>

      <Divider />

      {/* Advanced Options */}
      <Stack gap="md">
        <Text size="sm" fw={500}>
          {t('changeMetadata.advanced.title', 'Advanced Options')}
        </Text>
        <AdvancedOptionsStep
          parameters={parameters}
          onParameterChange={onParameterChange}
          disabled={fieldsDisabled}
          addCustomMetadata={addCustomMetadata}
          removeCustomMetadata={removeCustomMetadata}
          updateCustomMetadata={updateCustomMetadata}
        />
      </Stack>
    </Stack>
  );
};

export default ChangeMetadataSingleStep;
