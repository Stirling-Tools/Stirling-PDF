import { Stack, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ChangeMetadataParameters } from "@app/hooks/tools/changeMetadata/useChangeMetadataParameters";

interface StandardMetadataStepProps {
  parameters: ChangeMetadataParameters;
  onParameterChange: <K extends keyof ChangeMetadataParameters>(key: K, value: ChangeMetadataParameters[K]) => void;
  disabled?: boolean;
}

const StandardMetadataStep = ({
  parameters,
  onParameterChange,
  disabled = false
}: StandardMetadataStepProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <TextInput
        label={t('changeMetadata.title.label', 'Title')}
        placeholder={t('changeMetadata.title.placeholder', 'Document title')}
        value={parameters.title}
        onChange={(e) => onParameterChange('title', e.target.value)}
        disabled={disabled}
      />

      <TextInput
        label={t('changeMetadata.author.label', 'Author')}
        placeholder={t('changeMetadata.author.placeholder', 'Document author')}
        value={parameters.author}
        onChange={(e) => onParameterChange('author', e.target.value)}
        disabled={disabled}
      />

      <TextInput
        label={t('changeMetadata.subject.label', 'Subject')}
        placeholder={t('changeMetadata.subject.placeholder', 'Document subject')}
        value={parameters.subject}
        onChange={(e) => onParameterChange('subject', e.target.value)}
        disabled={disabled}
      />

      <TextInput
        label={t('changeMetadata.keywords.label', 'Keywords')}
        placeholder={t('changeMetadata.keywords.placeholder', 'Document keywords')}
        value={parameters.keywords}
        onChange={(e) => onParameterChange('keywords', e.target.value)}
        disabled={disabled}
      />

      <TextInput
        label={t('changeMetadata.creator.label', 'Creator')}
        placeholder={t('changeMetadata.creator.placeholder', 'Document creator')}
        value={parameters.creator}
        onChange={(e) => onParameterChange('creator', e.target.value)}
        disabled={disabled}
      />

      <TextInput
        label={t('changeMetadata.producer.label', 'Producer')}
        placeholder={t('changeMetadata.producer.placeholder', 'Document producer')}
        value={parameters.producer}
        onChange={(e) => onParameterChange('producer', e.target.value)}
        disabled={disabled}
      />
    </Stack>
  );
};

export default StandardMetadataStep;
