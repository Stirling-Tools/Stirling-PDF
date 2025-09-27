import React from 'react';
import { Drawer, ScrollArea, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import HotkeysSection from './HotkeysSection';

interface SettingsDrawerProps {
  opened: boolean;
  onClose: () => void;
}

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ opened, onClose }) => {
  const { t } = useTranslation();

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="lg"
      padding="md"
      title={t('settings.title', 'Settings')}
      overlayProps={{ opacity: 0.25, blur: 4 }}
    >
      <ScrollArea h="100%" type="hover">
        <Stack gap="xl" py="sm">
          <HotkeysSection />
        </Stack>
      </ScrollArea>
    </Drawer>
  );
};

export default SettingsDrawer;
