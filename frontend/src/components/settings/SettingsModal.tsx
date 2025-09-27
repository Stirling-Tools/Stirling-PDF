import { Modal, Tabs } from '@mantine/core';
import React from 'react';
import HotkeySettingsSection from './HotkeySettingsSection';

interface SettingsModalProps {
  opened: boolean;
  onClose: () => void;
}

export function SettingsModal({ opened, onClose }: SettingsModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Settings" size="lg" centered>
      <Tabs defaultValue="hotkeys" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="hotkeys">Hotkeys</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="hotkeys" mt="md">
          <HotkeySettingsSection isOpen={opened} />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

export default SettingsModal;
