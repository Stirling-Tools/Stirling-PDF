import React from 'react';
import { Modal, Text, Button, Group, Stack } from '@mantine/core';
import { useFileContext } from '../../contexts/FileContext';

interface NavigationWarningModalProps {
  onApplyAndContinue?: () => Promise<void>;
  onExportAndContinue?: () => Promise<void>;
}

const NavigationWarningModal = ({
  onApplyAndContinue,
  onExportAndContinue
}: NavigationWarningModalProps) => {
  const { 
    showNavigationWarning, 
    hasUnsavedChanges,
    confirmNavigation, 
    cancelNavigation,
    setHasUnsavedChanges
  } = useFileContext();

  const handleKeepWorking = () => {
    cancelNavigation();
  };

  const handleDiscardChanges = () => {
    setHasUnsavedChanges(false);
    confirmNavigation();
  };

  const handleApplyAndContinue = async () => {
    if (onApplyAndContinue) {
      await onApplyAndContinue();
    }
    setHasUnsavedChanges(false);
    confirmNavigation();
  };

  const handleExportAndContinue = async () => {
    if (onExportAndContinue) {
      await onExportAndContinue();
    }
    setHasUnsavedChanges(false);
    confirmNavigation();
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