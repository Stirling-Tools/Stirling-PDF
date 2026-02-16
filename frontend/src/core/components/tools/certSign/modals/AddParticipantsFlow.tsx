import { useState } from 'react';
import { Modal, Stack, Text, Button, Group, Divider, Badge } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import UserSelector from '@app/components/shared/UserSelector';
import SignatureSettingsInput, { SignatureSettings } from '@app/components/tools/certSign/SignatureSettingsInput';

interface AddParticipantsFlowProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (userIds: number[], settings: SignatureSettings) => Promise<void>;
}

interface StepWrapperProps {
  number: number;
  title: string;
  isActive: boolean;
  isCompleted: boolean;
  children: React.ReactNode;
}

const StepWrapper: React.FC<StepWrapperProps> = ({
  number,
  title,
  isActive,
  isCompleted,
  children,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        padding: '16px',
        border: isActive
          ? '2px solid var(--mantine-color-blue-6)'
          : '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-default)',
        backgroundColor: isActive
          ? 'var(--mantine-color-blue-0)'
          : isCompleted
          ? 'var(--mantine-color-gray-0)'
          : 'transparent',
        opacity: !isActive && !isCompleted ? 0.6 : 1,
        marginBottom: '12px',
      }}
    >
      <Group gap="sm" mb={isActive ? 'md' : 0}>
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isCompleted
              ? 'var(--mantine-color-green-6)'
              : isActive
              ? 'var(--mantine-color-blue-6)'
              : 'var(--mantine-color-gray-4)',
            color: 'white',
            fontWeight: 600,
            fontSize: '14px',
          }}
        >
          {isCompleted ? <CheckIcon sx={{ fontSize: 18 }} /> : number}
        </div>
        <div style={{ flex: 1 }}>
          <Text size="sm" fw={600}>
            {t('groupSigning.steps.stepLabel', 'Step {{number}}', { number })}
          </Text>
          <Text size="sm" c="dimmed">
            {title}
          </Text>
        </div>
        {isActive && (
          <Badge color="blue" variant="light">
            {t('groupSigning.steps.current', 'Current')}
          </Badge>
        )}
        {isCompleted && (
          <Badge color="green" variant="light">
            {t('groupSigning.steps.completed', 'Completed')}
          </Badge>
        )}
      </Group>

      {isActive && <div style={{ marginTop: '12px' }}>{children}</div>}
    </div>
  );
};

export const AddParticipantsFlow: React.FC<AddParticipantsFlowProps> = ({
  opened,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [signatureSettings, setSignatureSettings] = useState<SignatureSettings>({
    showSignature: false,
    pageNumber: 1,
    reason: '',
    location: '',
    showLogo: false,
    includeSummaryPage: false,
  });
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    setCurrentStep(1);
    setSelectedUserIds([]);
    setSignatureSettings({
      showSignature: false,
      pageNumber: 1,
      reason: '',
      location: '',
      showLogo: false,
      includeSummaryPage: false,
    });
    onClose();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(selectedUserIds, signatureSettings);
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
      <Stack gap="xs">
        {/* Step 1: Select Users */}
        <StepWrapper
          number={1}
          title={t('certSign.collab.addParticipants.selectUsers', 'Select Users')}
          isActive={currentStep === 1}
          isCompleted={currentStep > 1}
        >
          <Stack gap="md">
            <UserSelector
              value={selectedUserIds}
              onChange={setSelectedUserIds}
              placeholder={t('certSign.collab.sessionDetail.selectUsers', 'Select users...')}
            />
            <Button
              onClick={() => setCurrentStep(2)}
              disabled={selectedUserIds.length === 0}
              fullWidth
            >
              {t('certSign.collab.addParticipants.continue', 'Continue to Signature Settings')}
            </Button>
          </Stack>
        </StepWrapper>

        {/* Step 2: Configure Signatures */}
        <StepWrapper
          number={2}
          title={t('certSign.collab.addParticipants.configureSignatures', 'Configure Signature Settings')}
          isActive={currentStep === 2}
          isCompleted={false}
        >
          <Stack gap="md">
            <SignatureSettingsInput value={signatureSettings} onChange={setSignatureSettings} />

            <Divider />

            <Group gap="sm">
              <Button
                variant="default"
                onClick={() => setCurrentStep(1)}
                leftSection={<ArrowBackIcon sx={{ fontSize: 16 }} />}
              >
                {t('certSign.collab.addParticipants.back', 'Back')}
              </Button>
              <Button
                onClick={handleSubmit}
                loading={submitting}
                style={{ flex: 1 }}
                leftSection={<AddIcon sx={{ fontSize: 16 }} />}
                color="green"
              >
                {t('certSign.collab.addParticipants.add', 'Add {{count}} Participant(s)', {
                  count: selectedUserIds.length,
                })}
              </Button>
            </Group>
          </Stack>
        </StepWrapper>
      </Stack>
    </Modal>
  );
};
