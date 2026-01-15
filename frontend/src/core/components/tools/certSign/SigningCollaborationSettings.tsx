import { Stack, Text, TextInput, Switch, Textarea, Alert } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import InfoIcon from '@mui/icons-material/Info';
import { SigningWorkflowParameters } from '@app/hooks/tools/certSign/useSigningWorkflowParameters';
import UserSelector from '@app/components/tools/certSign/UserSelector';
import SignatureSettingsInput from '@app/components/tools/certSign/SignatureSettingsInput';

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
          {t('certSign.collab.helper', 'Select users from your organization to participate in signing. You can configure signature appearance and set a due date.')}
        </Text>
      </Alert>

      <UserSelector
        value={parameters.participantUserIds}
        onChange={(userIds) => onParameterChange('participantUserIds', userIds)}
        placeholder={t('certSign.collab.userSelector.placeholder', 'Select users...')}
        size="xs"
        disabled={disabled}
      />

      <SignatureSettingsInput
        value={{
          showSignature: parameters.showSignature,
          pageNumber: parameters.pageNumber,
          reason: parameters.reason,
          location: parameters.location,
          showLogo: parameters.showLogo,
        }}
        onChange={(settings) => {
          onParameterChange('showSignature', settings.showSignature);
          onParameterChange('pageNumber', settings.pageNumber);
          onParameterChange('reason', settings.reason);
          onParameterChange('location', settings.location);
          onParameterChange('showLogo', settings.showLogo);
        }}
        disabled={disabled}
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
        {t('certSign.collab.footer', 'After submitting, users will see sign requests in their inbox. You can track status and finalize when all signatures are collected.')}
      </Text>
    </Stack>
  );
};

export default SigningCollaborationSettings;
