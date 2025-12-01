import React from 'react';
import { Alert, Stack, Text, Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface ErrorStageProps {
  error: string;
  onClose: () => void;
}

export const ErrorStage: React.FC<ErrorStageProps> = ({ error, onClose }) => {
  const { t } = useTranslation();

  return (
    <Alert color="red" title={t('payment.error', 'Payment Error')}>
      <Stack gap="md">
        <Text size="sm">{error}</Text>
        <Button variant="outline" onClick={onClose}>
          {t('common.close', 'Close')}
        </Button>
      </Stack>
    </Alert>
  );
};
