import React from 'react';
import { Modal, Text, Button, Group, Stack } from '@mantine/core';
import { useNavigationGuard } from '../../contexts/NavigationContext';
import { useTranslation } from 'react-i18next';

interface NavigationWarningModalProps {
  onApplyAndContinue?: () => Promise<void>;
  onExportAndContinue?: () => Promise<void>;
}

const NavigationWarningModal = ({
  onApplyAndContinue,
  onExportAndContinue
}: NavigationWarningModalProps) => {

  const { t } = useTranslation();
  const {
    showNavigationWarning,
    hasUnsavedChanges,
    cancelNavigation,
    confirmNavigation,
    setHasUnsavedChanges
  } = useNavigationGuard();

  const handleKeepWorking = () => {
    cancelNavigation();
  };

  const handleDiscardChanges = () => {
    setHasUnsavedChanges(false);
    confirmNavigation();
  };

  const _handleApplyAndContinue = async () => {
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
      title={t("unsavedChangesTitle", "Unsaved Changes")}
      centered
      size="lg"
      closeOnClickOutside={false}
      closeOnEscape={false}
    >
      <Stack gap="md">
        <Text>
          {t("unsavedChanges", "You have unsaved changes to your PDF. What would you like to do?")}
        </Text>


        <Group justify="space-between" gap="sm">
          <Button
            variant="light"
            color="red"
            onClick={handleDiscardChanges}
          >
            {t("discardChanges", "Discard Changes")}
          </Button>

          <Group gap="sm">
            <Button
              variant="light"
              color="var(--mantine-color-gray-8)"
              onClick={handleKeepWorking}
            >
              {t("keepWorking", "Keep Working")}
            </Button>

            {/* TODO:: Add this back in when it works */}
            {/* {onApplyAndContinue  && (
              <Button
                variant="light"
                color="blue"
                onClick={handleApplyAndContinue}
              >
                {t("applyAndContinue", "Apply & Continue")}
              </Button>
            )} */}

            {onExportAndContinue && (
              <Button
                onClick={handleExportAndContinue}
              >
                {t("exportAndContinue", "Export & Continue")}
              </Button>
            )}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
};

export default NavigationWarningModal;
