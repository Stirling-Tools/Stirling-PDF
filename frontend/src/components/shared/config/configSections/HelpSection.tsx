import React from 'react';
import { Stack, Text, Button } from '@mantine/core';
import { useOnboarding } from '../../../../contexts/OnboardingContext';
import { useTranslation } from 'react-i18next';
import LocalIcon from '../../LocalIcon';

interface HelpSectionProps {
  onClose?: () => void;
}

const HelpSection: React.FC<HelpSectionProps> = ({ onClose }) => {
  const { startTour } = useOnboarding();
  const { t } = useTranslation();

  const handleStartTour = () => {
    startTour();
    // Close the modal so user can see the tour
    onClose?.();
  };

  return (
    <Stack gap="lg">
      <div>
        <Text fw={600} size="lg">Help & Support</Text>
        <Text size="sm" c="dimmed">
          Get help with Stirling PDF features and functionality.
        </Text>
      </div>

      <div>
        <Text fw={600} size="md" mb="xs">{t('onboarding.startTour', 'Start Tour')}</Text>
        <Text size="sm" c="dimmed" mb="sm">
          {t('onboarding.startTourDescription', "Take a guided tour of Stirling PDF's key features")}
        </Text>
        <Button
          leftSection={<LocalIcon icon="help-rounded" width={18} height={18} />}
          onClick={handleStartTour}
          variant="light"
        >
          {t('onboarding.startTour', 'Start Tour')}
        </Button>
      </div>
    </Stack>
  );
};

export default HelpSection;
