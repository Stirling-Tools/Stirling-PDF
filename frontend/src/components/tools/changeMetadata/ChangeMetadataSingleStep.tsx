import { Stack, Divider, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ChangeMetadataParameters } from "../../../hooks/tools/changeMetadata/useChangeMetadataParameters";
import { useMetadataExtraction } from "../../../hooks/tools/changeMetadata/useMetadataExtraction";
import DeleteAllStep from "./steps/DeleteAllStep";
import StandardMetadataStep from "./steps/StandardMetadataStep";
import DocumentDatesStep from "./steps/DocumentDatesStep";
import CustomMetadataStep from "./steps/CustomMetadataStep";
import AdvancedOptionsStep from "./steps/AdvancedOptionsStep";

interface ChangeMetadataSingleStepProps {
  parameters: ChangeMetadataParameters;
  onParameterChange: <K extends keyof ChangeMetadataParameters>(key: K, value: ChangeMetadataParameters[K]) => void;
  disabled?: boolean;
  addCustomMetadata: (key?: string, value?: string) => void;
  removeCustomMetadata: (id: string) => void;
  updateCustomMetadata: (id: string, key: string, value: string) => void;
}

const ChangeMetadataSingleStep = ({
  parameters,
  onParameterChange,
  disabled = false,
  addCustomMetadata,
  removeCustomMetadata,
  updateCustomMetadata
}: ChangeMetadataSingleStepProps) => {
  const { t } = useTranslation();

  // Create a params object that matches the hook interface
  const paramsHook = {
    parameters,
    updateParameter: onParameterChange,
    addCustomMetadata,
    removeCustomMetadata,
    updateCustomMetadata,
  };

  // Extract metadata from uploaded files
  const { isExtractingMetadata } = useMetadataExtraction(paramsHook);

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

      {/* Custom Metadata */}
      <Stack gap="md">
        <Text size="sm" fw={500}>
          {t('changeMetadata.customFields.title', 'Custom Metadata')}
        </Text>
        <CustomMetadataStep
          parameters={parameters}
          onParameterChange={onParameterChange}
          disabled={fieldsDisabled}
          addCustomMetadata={addCustomMetadata}
          removeCustomMetadata={removeCustomMetadata}
          updateCustomMetadata={updateCustomMetadata}
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
        />
      </Stack>
    </Stack>
  );
};

export default ChangeMetadataSingleStep;
