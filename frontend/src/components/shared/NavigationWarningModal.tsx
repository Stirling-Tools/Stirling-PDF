import React from 'react';
import { Modal, Text, Button, Group, Stack } from '@mantine/core';
import { useFileState, useFileActions } from '../../contexts/FileContext';

interface NavigationWarningModalProps {
  onApplyAndContinue?: () => Promise<void>;
  onExportAndContinue?: () => Promise<void>;
}

const NavigationWarningModal = ({
  onApplyAndContinue,
  onExportAndContinue
}: NavigationWarningModalProps) => {
  const { state } = useFileState();
  const { actions } = useFileActions();
  const showNavigationWarning = state.ui.showNavigationWarning;
  const hasUnsavedChanges = state.ui.hasUnsavedChanges;

  const handleKeepWorking = () => {
    actions.cancelNavigation();
  };

  const handleDiscardChanges = () => {
    actions.setHasUnsavedChanges(false);
    actions.confirmNavigation();
  };

  const handleApplyAndContinue = async () => {
    if (onApplyAndContinue) {
      await onApplyAndContinue();
    }
    actions.setHasUnsavedChanges(false);
    actions.confirmNavigation();
  };

  const handleExportAndContinue = async () => {
    if (onExportAndContinue) {
      await onExportAndContinue();
    }
    actions.setHasUnsavedChanges(false);
    actions.confirmNavigation();
  };

  if (!hasUnsavedChanges) {
    return null;
  }

  return (
    <Modal
      opened={showNavigationWarning}
      onClose={handleKeepWorking}
      title="Unsaved Changes"
      centered
      closeOnClickOutside={false}
      closeOnEscape={false}
    >
      <Stack gap="md">
        <Text>
          You have unsaved changes to your PDF. What would you like to do?
        </Text>
        
        <Group justify="flex-end" gap="sm">
          <Button
            variant="light"
            color="gray"
            onClick={handleKeepWorking}
          >
            Keep Working
          </Button>
          
          <Button
            variant="light"
            color="red"
            onClick={handleDiscardChanges}
          >
            Discard Changes
          </Button>
          
          {onApplyAndContinue && (
            <Button
              variant="light"
              color="blue"
              onClick={handleApplyAndContinue}
            >
              Apply & Continue
            </Button>
          )}
          
          {onExportAndContinue && (
            <Button
              color="green"
              onClick={handleExportAndContinue}
            >
              Export & Continue
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
};

export default NavigationWarningModal;