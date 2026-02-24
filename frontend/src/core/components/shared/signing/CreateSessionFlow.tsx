import { useState } from 'react';
import { Stack, Text, Group, Badge } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import CheckIcon from '@mui/icons-material/Check';
import { SelectDocumentStep } from '@app/components/shared/signing/steps/SelectDocumentStep';
import { SelectParticipantsStep } from '@app/components/shared/signing/steps/SelectParticipantsStep';
import { ConfigureSignatureDefaultsStep } from '@app/components/shared/signing/steps/ConfigureSignatureDefaultsStep';
import { ReviewSessionStep } from '@app/components/shared/signing/steps/ReviewSessionStep';
import { useGroupSigningTips } from '@app/components/tooltips/useGroupSigningTips';
import { useSignatureSettingsTips } from '@app/components/tooltips/useSignatureSettingsTips';
import type { SignatureSettings } from '@app/components/tools/certSign/SignatureSettingsInput';
import type { FileState } from '@app/types/file';

interface CreateSessionFlowProps {
  selectedFiles: FileState[];
  selectedUserIds: number[];
  onSelectedUserIdsChange: (userIds: number[]) => void;
  dueDate: string;
  onDueDateChange: (date: string) => void;
  creating: boolean;
  onSubmit: (signatureSettings: SignatureSettings) => void;
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

      {isActive && children}
    </div>
  );
};

export const CreateSessionFlow: React.FC<CreateSessionFlowProps> = ({
  selectedFiles,
  selectedUserIds,
  onSelectedUserIdsChange,
  dueDate,
  onDueDateChange,
  creating,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);

  // Signature settings state
  const [signatureSettings, setSignatureSettings] = useState<SignatureSettings>({
    showSignature: false,
    pageNumber: 1,
    reason: '',
    location: '',
    showLogo: false,
    includeSummaryPage: false,
  });

  const groupSigningTips = useGroupSigningTips();
  const signatureSettingsTips = useSignatureSettingsTips();

  const hasValidFile = selectedFiles.length === 1;
  const selectedFile = hasValidFile ? selectedFiles[0] : null;

  const steps = [
    {
      number: 1,
      title: t('groupSigning.steps.selectDocument.title', 'Select Document'),
      tooltip: groupSigningTips,
    },
    {
      number: 2,
      title: t('groupSigning.steps.selectParticipants.title', 'Choose Participants'),
      tooltip: null,
    },
    {
      number: 3,
      title: t('groupSigning.steps.configureDefaults.title', 'Configure Signature Settings'),
      tooltip: signatureSettingsTips,
    },
    {
      number: 4,
      title: t('groupSigning.steps.review.titleShort', 'Review & Send'),
      tooltip: null,
    },
  ];

  return (
    <div className="quick-access-popout__panel">
      <Stack gap="md">
        {/* Step 1: Select Document */}
        <StepWrapper
          number={1}
          title={steps[0].title}
          isActive={currentStep === 1}
          isCompleted={currentStep > 1}
        >
          {hasValidFile ? (
            <SelectDocumentStep
              selectedFiles={selectedFiles}
              onNext={() => setCurrentStep(2)}
            />
          ) : (
            <div style={{ padding: '12px 0' }}>
              <Text size="sm" c="dimmed" ta="center">
                {t(
                  'groupSigning.steps.selectDocument.noFile',
                  'Please select a single PDF file from your active files to create a signing session.'
                )}
              </Text>
            </div>
          )}
        </StepWrapper>

        {/* Step 2: Select Participants */}
        <StepWrapper
          number={2}
          title={steps[1].title}
          isActive={currentStep === 2}
          isCompleted={currentStep > 2}
        >
          <SelectParticipantsStep
            selectedUserIds={selectedUserIds}
            onSelectedUserIdsChange={onSelectedUserIdsChange}
            onBack={() => setCurrentStep(1)}
            onNext={() => setCurrentStep(3)}
            disabled={creating}
          />
        </StepWrapper>

        {/* Step 3: Configure Signature Defaults */}
        <StepWrapper
          number={3}
          title={steps[2].title}
          isActive={currentStep === 3}
          isCompleted={currentStep > 3}
        >
          <ConfigureSignatureDefaultsStep
            settings={signatureSettings}
            onSettingsChange={setSignatureSettings}
            onBack={() => setCurrentStep(2)}
            onNext={() => setCurrentStep(4)}
            disabled={creating}
          />
        </StepWrapper>

        {/* Step 4: Review & Send */}
        <StepWrapper
          number={4}
          title={steps[3].title}
          isActive={currentStep === 4}
          isCompleted={false}
        >
          {selectedFile && (
            <ReviewSessionStep
              selectedFile={selectedFile}
              participantCount={selectedUserIds.length}
              signatureSettings={signatureSettings}
              dueDate={dueDate}
              onDueDateChange={onDueDateChange}
              onBack={() => setCurrentStep(3)}
              onSubmit={() => onSubmit(signatureSettings)}
              disabled={creating}
            />
          )}
        </StepWrapper>
      </Stack>
    </div>
  );
};
