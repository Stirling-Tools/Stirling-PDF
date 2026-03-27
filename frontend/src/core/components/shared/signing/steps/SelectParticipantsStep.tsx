import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Stack,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import EmailIcon from '@mui/icons-material/Email';
import UserSelector from '@app/components/shared/UserSelector';

// ─── Shared participant model ─────────────────────────────────────────────────

export interface Participant {
  type: 'registered' | 'external';
  /** Present for registered users */
  userId?: number;
  /** Present for external/guest users */
  email?: string;
  name?: string;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface SelectParticipantsStepProps {
  participants: Participant[];
  onParticipantsChange: (participants: Participant[]) => void;
  onBack: () => void;
  onNext: () => void;
  disabled?: boolean;
}

// ─── Email validation ─────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Component ───────────────────────────────────────────────────────────────

export const SelectParticipantsStep: React.FC<SelectParticipantsStepProps> = ({
  participants,
  onParticipantsChange,
  onBack,
  onNext,
  disabled = false,
}) => {
  const { t } = useTranslation();

  // External email input state
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState('');

  const registeredUserIds = participants
    .filter((p) => p.type === 'registered' && p.userId != null)
    .map((p) => p.userId as number);

  function handleRegisteredChange(userIds: number[]) {
    const external = participants.filter((p) => p.type === 'external');
    const registered: Participant[] = userIds.map((id) => ({ type: 'registered', userId: id }));
    onParticipantsChange([...registered, ...external]);
  }

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
    if (participants.some((p) => p.email === trimmed)) {
      setEmailError(
        t(
          'groupSigning.steps.selectParticipants.duplicateEmail',
          'This email has already been added'
        )
      );
      return;
    }
    onParticipantsChange([...participants, { type: 'external', email: trimmed }]);
    setEmailInput('');
    setEmailError('');
  }

  function handleRemove(participant: Participant) {
    onParticipantsChange(
      participants.filter((p) =>
        participant.type === 'registered'
          ? !(p.type === 'registered' && p.userId === participant.userId)
          : !(p.type === 'external' && p.email === participant.email)
      )
    );
  }

  return (
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
          <Stack gap="xs">
            <Text size="sm" c="dimmed">
              {t('groupSigning.steps.selectParticipants.label', 'Select participants')}
            </Text>
            <UserSelector
              value={registeredUserIds}
              onChange={handleRegisteredChange}
              placeholder={t(
                'groupSigning.steps.selectParticipants.placeholder',
                'Choose participants to sign...'
              )}
              disabled={disabled}
            />
          </Stack>
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
                placeholder={t(
                  'groupSigning.steps.selectParticipants.emailPlaceholder',
                  'signer@example.com'
                )}
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
                disabled={disabled}
              />
              <Button onClick={handleAddEmail} disabled={disabled} style={{ marginTop: emailError ? 0 : 0 }}>
                {t('groupSigning.steps.selectParticipants.addEmail', 'Add')}
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>
      </Tabs>

      {/* Combined participant list */}
      {participants.length > 0 && (
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            {t('groupSigning.steps.selectParticipants.count', {
              count: participants.length,
              defaultValue: '{{count}} participant(s)',
            })}
          </Text>
          {participants.map((p, i) => (
            <Group key={i} gap="xs" justify="space-between" wrap="nowrap">
              <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
                <Badge
                  variant="light"
                  color={p.type === 'external' ? 'orange' : 'blue'}
                  size="xs"
                >
                  {p.type === 'external'
                    ? t('groupSigning.steps.selectParticipants.badgeExternal', 'Guest')
                    : t('groupSigning.steps.selectParticipants.badgeRegistered', 'User')}
                </Badge>
                <Text size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.type === 'external' ? p.email : `User #${p.userId}`}
                </Text>
              </Group>
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={() => handleRemove(p)}
                disabled={disabled}
              >
                <CloseIcon sx={{ fontSize: 14 }} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      )}

      {participants.some((p) => p.type === 'external') && (
        <Alert color="blue" variant="light" icon={<EmailIcon sx={{ fontSize: 16 }} />}>
          {t(
            'groupSigning.steps.selectParticipants.emailInviteNote',
            'External participants will receive an email invitation with a signing link.'
          )}
        </Alert>
      )}

      <Group gap="sm">
        <Button
          variant="default"
          onClick={onBack}
          leftSection={<ArrowBackIcon sx={{ fontSize: 16 }} />}
        >
          {t('groupSigning.steps.back', 'Back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={participants.length === 0 || disabled}
          style={{ flex: 1 }}
        >
          {t('groupSigning.steps.selectParticipants.continue', 'Continue to Signature Settings')}
        </Button>
      </Group>
    </Stack>
  );
};
