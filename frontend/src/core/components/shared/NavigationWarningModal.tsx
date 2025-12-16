import { Modal, Text, Button, Group, Stack } from "@mantine/core";
import { useNavigationGuard, useNavigationState } from "@app/contexts/NavigationContext";
import { useTranslation } from "react-i18next";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useRedactionMode } from "@app/contexts/RedactionContext";
import FitText from "@app/components/shared/FitText";

interface NavigationWarningModalProps {
  onApplyAndContinue?: () => Promise<void>;
  onExportAndContinue?: () => Promise<void>;
}

const NavigationWarningModal = ({ onApplyAndContinue, onExportAndContinue }: NavigationWarningModalProps) => {
  const { t } = useTranslation();
  const { showNavigationWarning, hasUnsavedChanges, pendingNavigation, cancelNavigation, confirmNavigation, setHasUnsavedChanges } =
    useNavigationGuard();
  const { selectedTool } = useNavigationState();
  const { pendingCount } = useRedactionMode();
  
  // Check if we're in redact mode with pending redactions
  const isRedactMode = selectedTool === 'redact';
  const hasPendingRedactions = pendingCount > 0;

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
  const BUTTON_WIDTH = "12rem";

  // Only show modal if there are unsaved changes AND there's an actual pending navigation
  // This prevents the modal from showing due to spurious state updates
  if (!hasUnsavedChanges || !pendingNavigation) {
    return null;
  }

  return (
    <Modal
      opened={showNavigationWarning}
      onClose={handleKeepWorking}
      title={isRedactMode && hasPendingRedactions 
        ? t("pendingRedactionsTitle", "Unapplied Redactions")
        : t("unsavedChangesTitle", "Unsaved Changes")}
      centered
      size="auto"
      closeOnClickOutside={true}
      closeOnEscape={true}
    >
      <Stack>
        <Stack  ta="center"  p="md">
        <Text size="md" fw="300">
          {isRedactMode && hasPendingRedactions 
            ? t("pendingRedactions", "You have unapplied redactions that will be lost.")
            : t("unsavedChanges", "You have unsaved changes to your PDF.")}
        </Text>
        <Text size="lg" fw="500" >
          {t("areYouSure", "Are you sure you want to leave?")}
        </Text>
        </Stack>

        {/* Desktop layout: 2 groups side by side */}
        <Group justify="space-between" gap="xl" visibleFrom="md">
          <Group gap="sm">
            <Button variant="light" color="var(--mantine-color-gray-8)" onClick={handleKeepWorking} w={BUTTON_WIDTH} leftSection={<ArrowBackIcon fontSize="small" />}>
              <FitText text={t("keepWorking", "Keep Working")} minimumFontScale={0.55} />
            </Button>
          </Group>
          <Group gap="sm">
            <Button variant="filled" color="var(--mantine-color-red-9)" onClick={handleDiscardChanges} w={BUTTON_WIDTH} leftSection={<DeleteOutlineIcon fontSize="small" />}>
              <FitText 
                text={isRedactMode && hasPendingRedactions 
                  ? t("discardRedactions", "Discard & Leave")
                  : t("discardChanges", "Discard & Leave")}
                minimumFontScale={0.55}
              />
            </Button>
            {onApplyAndContinue && (
              <Button variant="filled"  onClick={handleApplyAndContinue} w={BUTTON_WIDTH} leftSection={<CheckCircleOutlineIcon fontSize="small" />}>
                <FitText 
                  text={t("applyAndContinue", "Save & Leave")}
                  minimumFontScale={0.55}
                />
              </Button>
            )}
          </Group>
        </Group>

        {/* Mobile layout: centered stack of 4 buttons */}
        <Stack align="center" gap="sm" hiddenFrom="md">
           <Button variant="light" color="var(--mantine-color-gray-8)"  onClick={handleKeepWorking} w={BUTTON_WIDTH} leftSection={<ArrowBackIcon fontSize="small" />}>
            <FitText text={t("keepWorking", "Keep Working")} minimumFontScale={0.55} />
          </Button>
          <Button variant="filled" color="var(--mantine-color-red-9)" onClick={handleDiscardChanges} w={BUTTON_WIDTH} leftSection={<DeleteOutlineIcon fontSize="small" />}>
            <FitText 
              text={isRedactMode && hasPendingRedactions 
                ? t("discardRedactions", "Discard & Leave")
                : t("discardChanges", "Discard & Leave")}
              minimumFontScale={0.55}
            />
          </Button>
          {onApplyAndContinue && (
            <Button variant="filled" onClick={handleApplyAndContinue} w={BUTTON_WIDTH} leftSection={<CheckCircleOutlineIcon fontSize="small" />}>
              <FitText 
                text={t("applyAndContinue", "Save & Leave")}
                minimumFontScale={0.55}
              />
            </Button>
          )}
        </Stack>
      </Stack>
    </Modal>
  );
};

export default NavigationWarningModal;
