import { Modal, Title, Text, Button, Stack, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface TourWelcomeModalProps {
  opened: boolean;
  onStartTour: () => void;
  onMaybeLater: () => void;
  onDontShowAgain: () => void;
}

export default function TourWelcomeModal({
  opened,
  onStartTour,
  onMaybeLater,
  onDontShowAgain,
}: TourWelcomeModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      opened={opened}
      onClose={onMaybeLater}
      centered
      size="md"
      radius="lg"
      withCloseButton={false}
    >
      <Stack gap="lg">
        <Stack gap="xs">
          <Title order={2}>
            {t('onboarding.welcomeModal.title', 'Welcome to Stirling PDF!')}
          </Title>
          <Text size="md" c="dimmed">
            {t('onboarding.welcomeModal.description',
              "Would you like to take a quick 1-minute tour to learn the key features and how to get started?"
            )}
          </Text>
          <Text
            size="md"
            c="dimmed"
            dangerouslySetInnerHTML={{
              __html: t('onboarding.welcomeModal.helpHint',
                'You can always access this tour later from the <strong>Help</strong> button in the bottom left.'
              )
            }}
          />
        </Stack>

        <Stack gap="sm">
          <Button
            onClick={onStartTour}
            size="md"
            variant="filled"
            fullWidth
          >
            {t('onboarding.welcomeModal.startTour', 'Start Tour')}
          </Button>

          <Group grow>
            <Button
              onClick={onMaybeLater}
              size="md"
              variant="light"
            >
              {t('onboarding.welcomeModal.maybeLater', 'Maybe Later')}
            </Button>

            <Button
              onClick={onDontShowAgain}
              size="md"
              variant="light"
            >
              {t('onboarding.welcomeModal.dontShowAgain', "Don't Show Again")}
            </Button>
          </Group>
        </Stack>
      </Stack>
    </Modal>
  );
}
