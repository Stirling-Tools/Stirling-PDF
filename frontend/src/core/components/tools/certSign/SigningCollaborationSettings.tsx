import { Stack, Text, TextInput, Switch, Textarea, Alert, TagsInput } from '@mantine/core';
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
    <Stack gap="sm">
      <Alert icon={<InfoIcon fontSize="small" />} radius="md" color="blue" variant="light" p="xs">
        <Text size="xs">
          {t('certSign.collab.helper', 'Invite multiple participants to sign by entering emails separated with commas. Each invite gets its own tracking token and you will receive a JSON summary back for sharing or automation.')}
        </Text>
      </Alert>

      <TagsInput
        label={t('certSign.collab.emails', 'Participant emails')}
        placeholder={t('certSign.collab.emailsPlaceholder', 'Enter email and press Enter')}
        value={parameters.participantEmails ? parameters.participantEmails.split(',').map(e => e.trim()).filter(Boolean) : []}
        onChange={(values) => onParameterChange('participantEmails', values.join(','))}
        disabled={disabled}
        size="xs"
        splitChars={[',']}
        clearable
        acceptValueOnBlur
      />

      <TagsInput
        label={t('certSign.collab.names', 'Participant names (optional)')}
        placeholder={t('certSign.collab.namesPlaceholder', 'Enter name and press Enter')}
        value={parameters.participantNames ? parameters.participantNames.split(',').map(n => n.trim()).filter(Boolean) : []}
        onChange={(values) => onParameterChange('participantNames', values.join(','))}
        disabled={disabled}
        size="xs"
        splitChars={[',']}
        clearable
        acceptValueOnBlur
      />

      <TextInput
        label={t('certSign.collab.owner', 'Your email for updates (optional)')}
        placeholder="you@example.com"
        value={parameters.ownerEmail}
        onChange={(event) => onParameterChange('ownerEmail', event.currentTarget.value)}
        disabled={disabled}
        size="xs"
      />

      <Textarea
        label={t('certSign.collab.messageLabel', 'Message to include in invitations')}
        placeholder={t('certSign.collab.message.placeholder', 'Please review and sign this document by the due date.')}
        value={parameters.message}
        onChange={(event) => onParameterChange('message', event.currentTarget.value)}
        disabled={disabled}
        autosize
        minRows={2}
        size="xs"
      />

      <TextInput
        label={t('certSign.collab.dueDate', 'Due date (optional, ISO date)')}
        placeholder="2025-01-31"
        value={parameters.dueDate}
        onChange={(event) => onParameterChange('dueDate', event.currentTarget.value)}
        disabled={disabled}
        size="xs"
      />

      <Switch
        label={t('certSign.collab.notify', 'Send notifications immediately')}
        checked={parameters.notifyOnCreate}
        onChange={(event) => onParameterChange('notifyOnCreate', event.currentTarget.checked)}
        disabled={disabled}
        size="xs"
      />

      <Text size="xs" c="dimmed">
        {t('certSign.collab.footer', 'After submitting you will get a session summary with per-signer links and can return later to finalize signatures.')}
      </Text>
    </Stack>
  );
};

export default SigningCollaborationSettings;
