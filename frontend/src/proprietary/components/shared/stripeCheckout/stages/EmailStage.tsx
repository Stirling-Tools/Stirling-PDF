import React from 'react';
import { Stack, Title, Text, TextInput, Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface EmailStageProps {
  emailInput: string;
  setEmailInput: (email: string) => void;
  emailError: string;
  onSubmit: () => void;
}

export const EmailStage: React.FC<EmailStageProps> = ({
  emailInput,
  setEmailInput,
  emailError,
  onSubmit,
}) => {
  const { t } = useTranslation();

  return (
    <Stack gap="lg" style={{ maxWidth: '500px', margin: '0 auto', padding: '2rem 0' }}>
      <div>
        <Title order={3} mb="xs">
          {t('payment.emailStage.title', 'Enter Your Email')}
        </Title>
        <Text size="sm" c="dimmed">
          {t('payment.emailStage.description', "We'll use this to send your license key and receipts.")}
        </Text>
      </div>

      <TextInput
        label={t('payment.emailStage.emailLabel', 'Email Address')}
        placeholder={t('payment.emailStage.emailPlaceholder', 'your@email.com')}
        value={emailInput}
        onChange={(e) => setEmailInput(e.currentTarget.value)}
        error={emailError}
        size="lg"
        required
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSubmit();
          }
        }}
      />

      <Button
        size="lg"
        onClick={onSubmit}
        disabled={!emailInput.trim()}
      >
        {t('payment.emailStage.continue', 'Continue')}
      </Button>
    </Stack>
  );
};
