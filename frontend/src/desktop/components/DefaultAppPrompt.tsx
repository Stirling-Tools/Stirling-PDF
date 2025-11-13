import { Modal, Text, Button, Stack, Flex } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelIcon from '@mui/icons-material/Cancel';
import { CSSProperties } from 'react';

interface DefaultAppPromptProps {
  opened: boolean;
  onSetDefault: () => void;
  onDismiss: () => void;
}

const ICON_STYLE: CSSProperties = {
  fontSize: 48,
  display: 'block',
  margin: '0 auto 12px',
  color: 'var(--mantine-color-blue-6)',
};

export const DefaultAppPrompt = ({ opened, onSetDefault, onDismiss }: DefaultAppPromptProps) => {
  const { t } = useTranslation();

  return (
    <Modal
      opened={opened}
      onClose={onDismiss}
      title={t('defaultApp.title', 'Set as Default PDF App')}
      centered
      size="auto"
      closeOnClickOutside={true}
      closeOnEscape={true}
    >
      <Stack ta="center" p="md" gap="sm">
        <PictureAsPdfIcon style={ICON_STYLE} />
        <Text size="lg" fw={500}>
          {t(
            'defaultApp.message',
            'Would you like to set Stirling PDF as your default PDF editor?'
          )}
        </Text>
        <Text size="sm" c="dimmed">
          {t(
            'defaultApp.description',
            'You can change this later in your system settings.'
          )}
        </Text>
      </Stack>

      <Flex
        mt="md"
        gap="sm"
        justify="center"
        align="center"
        direction={{ base: 'column', md: 'row' }}
      >
        <Button
          variant="light"
          color="var(--mantine-color-gray-8)"
          onClick={onDismiss}
          leftSection={<CancelIcon fontSize="small" />}
          w="10rem"
        >
          {t('defaultApp.notNow', 'Not Now')}
        </Button>
        <Button
          variant="filled"
          color="var(--mantine-color-blue-9)"
          onClick={onSetDefault}
          leftSection={<CheckCircleOutlineIcon fontSize="small" />}
          w="10rem"
        >
          {t('defaultApp.setDefault', 'Set Default')}
        </Button>
      </Flex>
    </Modal>
  );
};
