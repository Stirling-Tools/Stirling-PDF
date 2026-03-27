import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import EmailIcon from '@mui/icons-material/Email';
import UserSelector from '@app/components/shared/UserSelector';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AddParticipantsFlowProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (userIds: number[], emails: string[], defaultReason?: string) => Promise<void>;
}

export const AddParticipantsFlow: React.FC<AddParticipantsFlowProps> = ({
  opened,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [externalEmails, setExternalEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState('');
  const [defaultReason, setDefaultReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const totalCount = selectedUserIds.length + externalEmails.length;

  const handleClose = () => {
    setSelectedUserIds([]);
    setExternalEmails([]);
    setEmailInput('');
    setEmailError('');
    setDefaultReason('');
    onClose();
  };

  function handleAddEmail() {
    const trimmed = emailInput.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError(
        t(
          'groupSigning.steps.selectParticipants.invalidEmail',
          'Please enter a valid email address'
        )
      );
      return;
    }
    if (externalEmails.includes(trimmed)) {
      setEmailError(
        t(
          'groupSigning.steps.selectParticipants.duplicateEmail',
          'This email has already been added'
        )
      );
      return;
    }
    setExternalEmails((prev) => [...prev, trimmed]);
    setEmailInput('');
    setEmailError('');
  }

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(selectedUserIds, externalEmails, defaultReason.trim() || undefined);
      handleClose();
    } catch (error) {
      console.error('Failed to add participants:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t('certSign.collab.sessionDetail.addParticipants', 'Add Participants')}
      size="lg"
    >
      <Stack gap="md">
        <Tabs defaultValue="registered">
          <Tabs.List>
            <Tabs.Tab value="registered" leftSection={<PersonIcon sx={{ fontSize: 16 }} />}>
              {t('groupSigning.steps.selectParticipants.tabRegistered', 'Registered Users')}
            </Tabs.Tab>
            <Tabs.Tab value="external" leftSection={<EmailIcon sx={{ fontSize: 16 }} />}>
              {t('groupSigning.steps.selectParticipants.tabExternal', 'External (by email)')}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="registered" pt="sm">
            <UserSelector
              value={selectedUserIds}
              onChange={setSelectedUserIds}
              placeholder={t('certSign.collab.sessionDetail.selectUsers', 'Select users...')}
            />
          </Tabs.Panel>

          <Tabs.Panel value="external" pt="sm">
            <Stack gap="xs">
              <Text size="sm" c="dimmed">
                {t(
                  'groupSigning.steps.selectParticipants.externalNote',
                  'An invitation email will be sent with a signing link. No account required.'
                )}
              </Text>
              <Group gap="xs" align="flex-start">
                <TextInput
                  style={{ flex: 1 }}
                  placeholder="signer@example.com"
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.currentTarget.value);
                    if (emailError) setEmailError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddEmail();
                    }
                  }}
                  error={emailError}
                />
                <Button onClick={handleAddEmail} variant="default">
                  {t('groupSigning.steps.selectParticipants.addEmail', 'Add')}
                </Button>
              </Group>
              {externalEmails.map((email) => (
                <Group key={email} gap="xs" justify="space-between" wrap="nowrap">
                  <Group gap="xs">
                    <Badge variant="light" color="orange" size="xs">
                      {t('groupSigning.steps.selectParticipants.badgeExternal', 'Guest')}
                    </Badge>
                    <Text size="sm">{email}</Text>
                  </Group>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    onClick={() => setExternalEmails((prev) => prev.filter((e) => e !== email))}
                  >
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
          </Tabs.Panel>
        </Tabs>

        <TextInput
          label={t('certSign.reason', 'Default Reason')}
          description={t(
            'certSign.collab.addParticipants.reasonHelp',
            'Pre-set a signing reason for these participants (optional, they can override when signing)'
          )}
          value={defaultReason}
          onChange={(e) => setDefaultReason(e.currentTarget.value)}
          placeholder={t(
            'certSign.collab.addParticipants.reasonPlaceholder',
            'e.g. Approval, Review...'
          )}
          size="sm"
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={handleClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            loading={submitting}
            disabled={totalCount === 0}
            leftSection={<AddIcon sx={{ fontSize: 16 }} />}
            color="green"
          >
            {t('certSign.collab.addParticipants.add', 'Add {{count}} Participant(s)', {
              count: totalCount,
            })}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
