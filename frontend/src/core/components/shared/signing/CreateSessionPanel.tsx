import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Badge, Group, Switch, Tabs, Text, TextInput } from '@mantine/core';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import EmailIcon from '@mui/icons-material/Email';
import UserSelector from '@app/components/shared/UserSelector';
import type { Participant } from '@app/components/shared/signing/steps/SelectParticipantsStep';
import type { FileState } from '@app/types/file';

interface CreateSessionPanelProps {
  selectedFiles: FileState[];
  participants: Participant[];
  onParticipantsChange: (participants: Participant[]) => void;
  dueDate: string;
  onDueDateChange: (date: string) => void;
  creating: boolean;
  includeSummaryPage: boolean;
  onIncludeSummaryPageChange: (value: boolean) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CreateSessionPanel = ({
  selectedFiles,
  participants,
  onParticipantsChange,
  dueDate,
  onDueDateChange,
  creating,
  includeSummaryPage,
  onIncludeSummaryPageChange,
}: CreateSessionPanelProps) => {
  const { t } = useTranslation();
  const [emailInput, setEmailInput] = useState('');

  const hasValidFile = selectedFiles.length === 1;

  const registeredUserIds = participants
    .filter((p) => p.type === 'registered' && p.userId != null)
    .map((p) => p.userId as number);

  function handleRegisteredChange(userIds: number[]) {
    const external = participants.filter((p) => p.type === 'external');
    onParticipantsChange([
      ...userIds.map((id): Participant => ({ type: 'registered', userId: id })),
      ...external,
    ]);
  }

  function handleAddEmail() {
    const trimmed = emailInput.trim();
    if (!EMAIL_RE.test(trimmed)) return;
    if (participants.some((p) => p.email === trimmed)) return;
    onParticipantsChange([...participants, { type: 'external', email: trimmed }]);
    setEmailInput('');
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
    <div className="quick-access-popout__panel">
      {!hasValidFile ? (
        <div className="quick-access-popout__section">
          <Text size="sm" c="dimmed" ta="center" py="xl">
            {t('quickAccess.selectSingleFileToRequest', 'Select a single PDF file to request signatures')}
          </Text>
        </div>
      ) : (
        <>
          <div className="quick-access-popout__section">
            <div className="quick-access-popout__label">{t('quickAccess.selectedFile', 'Selected file')}</div>
            <div className="quick-access-popout__row-title">
              {selectedFiles[0]?.name || t('quickAccess.noFile', 'No file selected')}
            </div>
          </div>

          <div className="quick-access-popout__section">
            <div className="quick-access-popout__label">{t('quickAccess.selectUsers', 'Select participants to sign')}</div>

            <Tabs defaultValue="registered" style={{ marginBottom: 8 }}>
              <Tabs.List>
                <Tabs.Tab value="registered" leftSection={<PersonIcon sx={{ fontSize: 13 }} />} style={{ fontSize: 11, padding: '4px 8px' }}>
                  {t('groupSigning.steps.selectParticipants.tabRegistered', 'Registered')}
                </Tabs.Tab>
                <Tabs.Tab value="external" leftSection={<EmailIcon sx={{ fontSize: 13 }} />} style={{ fontSize: 11, padding: '4px 8px' }}>
                  {t('groupSigning.steps.selectParticipants.tabExternal', 'External')}
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="registered" pt="xs">
                <UserSelector
                  value={registeredUserIds}
                  onChange={handleRegisteredChange}
                  size="xs"
                  placeholder={t('quickAccess.selectUsersPlaceholder', 'Choose participants...')}
                  disabled={creating}
                />
              </Tabs.Panel>

              <Tabs.Panel value="external" pt="xs">
                <Group gap="xs" align="center">
                  <TextInput
                    style={{ flex: 1 }}
                    size="xs"
                    placeholder="signer@example.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddEmail();
                      }
                    }}
                    disabled={creating}
                  />
                  <button
                    type="button"
                    className="quick-access-popout__secondary"
                    onClick={handleAddEmail}
                    disabled={creating || !EMAIL_RE.test(emailInput.trim())}
                    style={{ padding: '4px 8px', fontSize: 12 }}
                  >
                    {t('groupSigning.steps.selectParticipants.addEmail', 'Add')}
                  </button>
                </Group>
              </Tabs.Panel>
            </Tabs>

            {/* Combined participant list */}
            {participants.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {participants.map((p, i) => (
                  <Group key={i} gap={4} justify="space-between" wrap="nowrap" style={{ marginBottom: 2 }}>
                    <Group gap={4} style={{ flex: 1, minWidth: 0 }}>
                      <Badge
                        variant="light"
                        color={p.type === 'external' ? 'orange' : 'blue'}
                        size="xs"
                      >
                        {p.type === 'external'
                          ? t('groupSigning.steps.selectParticipants.badgeExternal', 'Guest')
                          : t('groupSigning.steps.selectParticipants.badgeRegistered', 'User')}
                      </Badge>
                      <Text size="xs" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.type === 'external' ? p.email : `#${p.userId}`}
                      </Text>
                    </Group>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="xs"
                      onClick={() => handleRemove(p)}
                      disabled={creating}
                    >
                      <CloseIcon sx={{ fontSize: 12 }} />
                    </ActionIcon>
                  </Group>
                ))}
              </div>
            )}
          </div>

          <div className="quick-access-popout__section">
            <div className="quick-access-popout__label">{t('quickAccess.dueDate', 'Due date (optional)')}</div>
            <input
              type="date"
              className="quick-access-popout__input"
              value={dueDate}
              onChange={(e) => onDueDateChange(e.target.value)}
              disabled={creating}
            />
          </div>

          <div className="quick-access-popout__section">
            <Switch
              label={t('certSign.collab.sessionCreation.includeSummaryPage', 'Include Signature Summary Page')}
              description={t('certSign.collab.sessionCreation.includeSummaryPageHelp', 'Add a summary page at the end with all signature details')}
              checked={includeSummaryPage}
              onChange={(e) => onIncludeSummaryPageChange(e.currentTarget.checked)}
              disabled={creating}
              size="sm"
            />
          </div>
        </>
      )}
    </div>
  );
};

export default CreateSessionPanel;
