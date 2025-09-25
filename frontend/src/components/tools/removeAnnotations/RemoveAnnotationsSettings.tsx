import { useTranslation } from 'react-i18next';
import { Stack, Text, Alert } from '@mantine/core';
import LocalIcon from '../../shared/LocalIcon';
import { RemoveAnnotationsParameters } from '../../../hooks/tools/removeAnnotations/useRemoveAnnotationsParameters';

interface RemoveAnnotationsSettingsProps {
  parameters: RemoveAnnotationsParameters;
  onParameterChange: <K extends keyof RemoveAnnotationsParameters>(key: K, value: RemoveAnnotationsParameters[K]) => void;
  disabled?: boolean;
}

const RemoveAnnotationsSettings = ({
  parameters,
  onParameterChange,
  disabled = false
}: RemoveAnnotationsSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Alert
        icon={<LocalIcon icon="info-rounded" width="1.2rem" height="1.2rem" />}
        title={t('removeAnnotations.info.title', 'About Remove Annotations')}
        color="blue"
        variant="light"
      >
        <Text size="sm">
          {t('removeAnnotations.info.description',
            'This tool will remove all annotations (comments, highlights, notes, etc.) from your PDF documents.'
          )}
        </Text>
      </Alert>
    </Stack>
  );
};

export default RemoveAnnotationsSettings;