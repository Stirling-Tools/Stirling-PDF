import React, { useState } from 'react';
import { Card, Stack, Text, PasswordInput, Button, Group, Alert, Code, Badge } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import auditService from '@app/services/auditService';
import LocalIcon from '@app/components/shared/LocalIcon';

interface AuditClearDataSectionProps {
  loginEnabled?: boolean;
}

const AuditClearDataSection: React.FC<AuditClearDataSectionProps> = ({ loginEnabled = true }) => {
  const { t } = useTranslation();
  const [confirmationCode, setConfirmationCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleInitiateDeletion = () => {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    setGeneratedCode(code);
    setConfirmationCode('');
    setShowConfirmation(true);
    setError(null);
  };

  const resetForm = () => {
    setConfirmationCode('');
    setGeneratedCode('');
    setShowConfirmation(false);
    setError(null);
  };

  const handleClearData = async () => {
    if (confirmationCode !== generatedCode) {
      setError('Confirmation code does not match');
      return;
    }

    try {
      setClearing(true);
      setError(null);
      await auditService.clearAllAuditData();
      setSuccess(true);
      resetForm();
      // Auto-dismiss success message after 5 seconds
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear audit data');
    } finally {
      setClearing(false);
    }
  };

  if (success) {
    return (
      <Stack gap="lg">
        <Alert
          color="green"
          icon={<LocalIcon icon="check-circle" width="1.2rem" height="1.2rem" />}
          title={t('audit.clearData.success', 'Success')}
          onClose={() => setSuccess(false)}
          closeButtonProps={{ 'aria-label': 'Close alert' }}
          withCloseButton
        >
          {t('audit.clearData.successMessage', 'All audit data has been cleared successfully')}
        </Alert>
      </Stack>
    );
  }

  if (showConfirmation) {
    return (
      <Stack gap="lg">
        <Alert
          color="orange"
          icon={<LocalIcon icon="warning" width="1.2rem" height="1.2rem" />}
          title={t('audit.clearData.confirmTitle', 'Please confirm you want to delete')}
        >
          <Text size="sm">
            {t('audit.clearData.confirmMessage', 'This will permanently remove all audit logs. Enter the confirmation code below to proceed.')}
          </Text>
        </Alert>

        <Card padding="lg" radius="md" withBorder style={{ borderColor: 'var(--mantine-color-red-4)' }}>
          <Stack gap="md">
            <div
              style={{
                backgroundColor: 'var(--mantine-color-gray-0)',
                padding: '1rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--mantine-color-gray-2)',
              }}
            >
              <Text size="xs" fw={600} c="dimmed" mb="xs">
                {t('audit.clearData.confirmationCode', 'Confirmation Code')}
              </Text>
              <Code
                style={{
                  fontSize: '1.5rem',
                  letterSpacing: '0.15em',
                  fontWeight: 600,
                  display: 'block',
                  textAlign: 'center',
                  padding: '0.75rem',
                }}
              >
                {generatedCode}
              </Code>
              <Text size="xs" c="dimmed" mt="xs">
                {t('audit.clearData.enterCodeBelow', 'Enter the code exactly as shown above (case-sensitive)')}
              </Text>
            </div>

            <PasswordInput
              label={t('audit.clearData.enterCode', 'Confirmation Code')}
              placeholder={t('audit.clearData.codePlaceholder', 'Type the code here')}
              value={confirmationCode}
              onChange={(e) => setConfirmationCode(e.currentTarget.value)}
              disabled={!loginEnabled}
              error={
                confirmationCode && confirmationCode !== generatedCode
                  ? t('audit.clearData.codeDoesNotMatch', 'Code does not match')
                  : false
              }
            />

            {error && (
              <Alert color="red" icon={<LocalIcon icon="error" width="1.2rem" height="1.2rem" />}>
                {error}
              </Alert>
            )}

            <Group justify="space-between">
              <Button variant="default" onClick={resetForm} disabled={clearing}>
                {t('audit.clearData.cancel', 'Cancel')}
              </Button>
              <Button
                color="red"
                onClick={handleClearData}
                loading={clearing}
                disabled={!loginEnabled || !generatedCode || confirmationCode !== generatedCode}
              >
                {t('audit.clearData.deleteButton', 'Delete')}
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Alert
        color="red"
        icon={<LocalIcon icon="warning" width="1.2rem" height="1.2rem" />}
        title={t('audit.clearData.warning1', 'This action cannot be undone')}
      >
        <Text size="sm">
          {t('audit.clearData.warning2', 'Deleting audit data will permanently remove all historical audit logs, including security events, user activities, and file operations from the database.')}
        </Text>
      </Alert>

      <Card padding="lg" radius="md" withBorder style={{ borderColor: 'var(--mantine-color-red-4)' }}>
        <Stack gap="md">
          <Group>
            <Text fw={600}>
              {t('audit.clearData.confirmationRequired', 'Delete All Audit Data')}
            </Text>
            <Badge color="red">
              {t('audit.clearData.irreversible', 'IRREVERSIBLE')}
            </Badge>
          </Group>

          <Button
            color="red"
            onClick={handleInitiateDeletion}
            disabled={!loginEnabled}
            fullWidth
          >
            {t('audit.clearData.initiateDelete', 'Delete All Data')}
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
};

export default AuditClearDataSection;
