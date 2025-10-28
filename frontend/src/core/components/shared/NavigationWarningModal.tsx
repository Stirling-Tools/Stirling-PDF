import { Modal, Text, Button, Group, Stack } from "@mantine/core";
import { useNavigationGuard } from "@app/contexts/NavigationContext";
import { useTranslation } from "react-i18next";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";

interface NavigationWarningModalProps {
  onApplyAndContinue?: () => Promise<void>;
  onExportAndContinue?: () => Promise<void>;
}

const NavigationWarningModal = ({ onApplyAndContinue, onExportAndContinue }: NavigationWarningModalProps) => {
  const { t } = useTranslation();
  const { showNavigationWarning, hasUnsavedChanges, cancelNavigation, confirmNavigation, setHasUnsavedChanges } =
    useNavigationGuard();

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

  const _handleExportAndContinue = async () => {
    if (onExportAndContinue) {
      await onExportAndContinue();
    }
    setHasUnsavedChanges(false);
    confirmNavigation();
  };
  const BUTTON_WIDTH = "10rem";

  if (!hasUnsavedChanges) {
    return null;
  }

  return (
    <Modal
      opened={showNavigationWarning}
      onClose={handleKeepWorking}
      title={t("unsavedChangesTitle", "Unsaved Changes")}
      centered
      size="auto"
      closeOnClickOutside={true}
      closeOnEscape={true}
    >
      <Stack>
        <Stack  ta="center"  p="md">
        <Text size="md" fw="300">
          {t("unsavedChanges", "You have unsaved changes to your PDF.")}
        </Text>
        <Text size="lg" fw="500" >
          {t("areYouSure", "Are you sure you want to leave?")}
        </Text>
        </Stack>

        {/* Desktop layout: 2 groups side by side */}
        <Group justify="space-between" gap="xl" visibleFrom="md">
          <Group gap="sm">
            <Button variant="light" color="var(--mantine-color-gray-8)" onClick={handleKeepWorking} w={BUTTON_WIDTH} leftSection={<ArrowBackIcon fontSize="small" />}>
              {t("keepWorking", "Keep Working")}
            </Button>
          </Group>
          <Group gap="sm">
            <Button variant="filled" color="var(--mantine-color-red-9)" onClick={handleDiscardChanges} w={BUTTON_WIDTH} leftSection={<DeleteOutlineIcon fontSize="small" />}>
              {t("discardChanges", "Discard Changes")}
            </Button>
            {onApplyAndContinue && (
              <Button variant="filled"  onClick={handleApplyAndContinue} w={BUTTON_WIDTH} leftSection={<CheckCircleOutlineIcon fontSize="small" />}>
                {t("applyAndContinue", "Apply & Leave")}
              </Button>
            )}
          </Group>
        </Group>

        {/* Mobile layout: centered stack of 4 buttons */}
        <Stack align="center" gap="sm" hiddenFrom="md">
           <Button variant="light" color="var(--mantine-color-gray-8)"  onClick={handleKeepWorking} w={BUTTON_WIDTH} leftSection={<ArrowBackIcon fontSize="small" />}>
            {t("keepWorking", "Keep Working")}
          </Button>
          <Button variant="filled" color="var(--mantine-color-red-9)" onClick={handleDiscardChanges} w={BUTTON_WIDTH} leftSection={<DeleteOutlineIcon fontSize="small" />}>
            {t("discardChanges", "Discard Changes")}
          </Button>
          {onApplyAndContinue && (
            <Button variant="filled" onClick={handleApplyAndContinue} w={BUTTON_WIDTH} leftSection={<CheckCircleOutlineIcon fontSize="small" />}>
              {t("applyAndContinue", "Apply & Leave")}
            </Button>
          )}
        </Stack>
      </Stack>
    </Modal>
  );
};

export default NavigationWarningModal;
