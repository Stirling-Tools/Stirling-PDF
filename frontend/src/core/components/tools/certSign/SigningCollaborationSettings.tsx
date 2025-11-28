import { Stack, Text, TextInput, Switch, Textarea, Alert } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import InfoIcon from '@mui/icons-material/Info';
import { SigningWorkflowParameters } from '@app/hooks/tools/certSign/useSigningWorkflowParameters';

interface SigningCollaborationSettingsProps {
  parameters: SigningWorkflowParameters;
  onParameterChange: (key: keyof SigningWorkflowParameters, value: any) => void;
  disabled?: boolean;
}

const SigningCollaborationSettings = ({ parameters, onParameterChange, disabled = false }: SigningCollaborationSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Alert icon={<InfoIcon fontSize="small" />} radius="md" color="blue" variant="light">
        {t('certSign.collab.helper', 'Invite multiple participants to sign by entering emails separated with commas. Each invite gets its own tracking token and you will receive a JSON summary back for sharing or automation.')}
      </Alert>

      <TextInput
        label={t('certSign.collab.emails', 'Participant emails')}
        placeholder="jane@example.com, john@example.com"
        value={parameters.participantEmails}
        onChange={(event) => onParameterChange('participantEmails', event.currentTarget.value)}
        disabled={disabled}
        required
      />

      <TextInput
        label={t('certSign.collab.names', 'Participant names (optional, comma separated)')}
        placeholder="Jane Smith, John Doe"
        value={parameters.participantNames}
        onChange={(event) => onParameterChange('participantNames', event.currentTarget.value)}
        disabled={disabled}
      />

      <TextInput
        label={t('certSign.collab.owner', 'Your email for updates (optional)')}
        placeholder="you@example.com"
        value={parameters.ownerEmail}
        onChange={(event) => onParameterChange('ownerEmail', event.currentTarget.value)}
        disabled={disabled}
      />

      <Textarea
        label={t('certSign.collab.message', 'Message to include in invitations')}
        placeholder={t('certSign.collab.message.placeholder', 'Please review and sign this document by the due date.')}
        value={parameters.message}
        onChange={(event) => onParameterChange('message', event.currentTarget.value)}
        disabled={disabled}
        autosize
        minRows={2}
      />

      <TextInput
        label={t('certSign.collab.dueDate', 'Due date (optional, ISO date)')}
        placeholder="2025-01-31"
        value={parameters.dueDate}
        onChange={(event) => onParameterChange('dueDate', event.currentTarget.value)}
        disabled={disabled}
      />

      <Switch
        label={t('certSign.collab.notify', 'Send notifications immediately')}
        checked={parameters.notifyOnCreate}
        onChange={(event) => onParameterChange('notifyOnCreate', event.currentTarget.checked)}
        disabled={disabled}
      />

      <Text size="sm" c="dimmed">
        {t('certSign.collab.footer', 'After submitting you will get a session summary with per-signer links and can return later to finalize signatures.')}
      </Text>
    </Stack>
  );
};

export default SigningCollaborationSettings;
