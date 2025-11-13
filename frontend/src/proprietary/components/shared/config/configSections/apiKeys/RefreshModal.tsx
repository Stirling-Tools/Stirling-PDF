import React from "react";
import {
  Modal,
  Stack,
  Text,
  Group,
  Button,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";

interface RefreshModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function RefreshModal({ opened, onClose, onConfirm }: RefreshModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('config.apiKeys.refreshModal.title', 'Refresh API Keys')}
      centered
      size="sm"
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
    >
      <Stack gap="md">
        <Text size="sm" c="red">
          {t('config.apiKeys.refreshModal.warning', '⚠️ Warning: This action will generate new API keys and make your previous keys invalid.')}
        </Text>
        <Text size="sm">
          {t('config.apiKeys.refreshModal.impact', 'Any applications or services currently using these keys will stop working until you update them with the new keys.')}
        </Text>
        <Text size="sm" fw={500}>
          {t('config.apiKeys.refreshModal.confirmPrompt', 'Are you sure you want to continue?')}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button color="red" onClick={onConfirm}>
            {t('config.apiKeys.refreshModal.confirmCta', 'Refresh Keys')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
