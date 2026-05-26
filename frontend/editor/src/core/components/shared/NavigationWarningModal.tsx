import { useRef, useEffect } from "react";
import { Modal, Text, Button, Group, Stack } from "@mantine/core";
import { useNavigationGuard } from "@app/contexts/NavigationContext";
import { useTranslation } from "react-i18next";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import { Z_INDEX_TOAST } from "@app/styles/zIndex";

const NavigationWarningModal = () => {
  const { t } = useTranslation();
  const {
    showNavigationWarning,
    hasUnsavedChanges,
    pendingNavigation,
    cancelNavigation,
    setHasUnsavedChanges,
    navigationWarningHandlersRef,
  } = useNavigationGuard();

  // Store pendingNavigation in a ref so async handlers always have the latest,
  // not a stale closure captured before an await.
  const pendingNavigationRef = useRef(pendingNavigation);
  useEffect(() => {
    pendingNavigationRef.current = pendingNavigation;
  }, [pendingNavigation]);

  const handleKeepWorking = () => {
    cancelNavigation();
  };

  const finishAndNavigate = () => {
    const nav = pendingNavigationRef.current;
    setHasUnsavedChanges(false);
    cancelNavigation();
    if (nav) {
      nav();
    }
  };

  const handleDiscardChanges = async () => {
    const handlers = navigationWarningHandlersRef.current;
    if (handlers?.onDiscardAndContinue) {
      await handlers.onDiscardAndContinue();
    }
    finishAndNavigate();
  };

  const handleApplyAndContinue = async () => {
    const handlers = navigationWarningHandlersRef.current;
    if (handlers?.onApplyAndContinue) {
      await handlers.onApplyAndContinue();
    }
    finishAndNavigate();
  };

  const handleExportAndContinue = async () => {
    const handlers = navigationWarningHandlersRef.current;
    if (handlers?.onExportAndContinue) {
      await handlers.onExportAndContinue();
    }
    finishAndNavigate();
  };

  // Read handler availability at render time for button visibility
  const handlers = navigationWarningHandlersRef.current;
  const hasApply = !!handlers?.onApplyAndContinue;
  const hasExport = !!handlers?.onExportAndContinue;

  const BUTTON_WIDTH = "12rem";

  // Only show modal if there are unsaved changes AND there's an actual pending navigation
  if (!hasUnsavedChanges || !pendingNavigation) {
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
      zIndex={Z_INDEX_TOAST}
    >
      <Stack>
        <Stack ta="center" p="md">
          <Text size="md" fw="300">
            {t("unsavedChanges", "You have unsaved changes to your PDF.")}
          </Text>
          <Text size="lg" fw="500">
            {t("areYouSure", "Are you sure you want to leave?")}
          </Text>
        </Stack>

        {/* Desktop layout: 2 groups side by side */}
        <Group justify="space-between" gap="xl" visibleFrom="md">
          <Group gap="sm">
            <Button
              variant="light"
              color="var(--mantine-color-gray-8)"
              onClick={handleKeepWorking}
              w={BUTTON_WIDTH}
              leftSection={<ArrowBackIcon fontSize="small" />}
            >
              {t("keepWorking", "Keep Working")}
            </Button>
          </Group>
          <Group gap="sm">
            <Button
              variant="filled"
              color="var(--mantine-color-red-9)"
              onClick={handleDiscardChanges}
              w={BUTTON_WIDTH}
              leftSection={<DeleteOutlineIcon fontSize="small" />}
            >
              {t("discardChanges", "Discard Changes")}
            </Button>
            {hasApply && (
              <Button
                variant="filled"
                onClick={handleApplyAndContinue}
                w={BUTTON_WIDTH}
                leftSection={<CheckCircleOutlineIcon fontSize="small" />}
              >
                {t("applyAndContinue", "Apply & Leave")}
              </Button>
            )}
            {hasExport && (
              <Button
                variant="filled"
                onClick={handleExportAndContinue}
                w={BUTTON_WIDTH}
                leftSection={<CheckCircleOutlineIcon fontSize="small" />}
              >
                {t("exportAndContinue", "Export & Leave")}
              </Button>
            )}
          </Group>
        </Group>

        {/* Mobile layout: centered stack of 4 buttons */}
        <Stack align="center" gap="sm" hiddenFrom="md">
          <Button
            variant="light"
            color="var(--mantine-color-gray-8)"
            onClick={handleKeepWorking}
            w={BUTTON_WIDTH}
            leftSection={<ArrowBackIcon fontSize="small" />}
          >
            {t("keepWorking", "Keep Working")}
          </Button>
          <Button
            variant="filled"
            color="var(--mantine-color-red-9)"
            onClick={handleDiscardChanges}
            w={BUTTON_WIDTH}
            leftSection={<DeleteOutlineIcon fontSize="small" />}
          >
            {t("discardChanges", "Discard Changes")}
          </Button>
          {hasApply && (
            <Button
              variant="filled"
              onClick={handleApplyAndContinue}
              w={BUTTON_WIDTH}
              leftSection={<CheckCircleOutlineIcon fontSize="small" />}
            >
              {t("applyAndContinue", "Apply & Leave")}
            </Button>
          )}
          {hasExport && (
            <Button
              variant="filled"
              onClick={handleExportAndContinue}
              w={BUTTON_WIDTH}
              leftSection={<CheckCircleOutlineIcon fontSize="small" />}
            >
              {t("exportAndContinue", "Export & Leave")}
            </Button>
          )}
        </Stack>
      </Stack>
    </Modal>
  );
};

export default NavigationWarningModal;
