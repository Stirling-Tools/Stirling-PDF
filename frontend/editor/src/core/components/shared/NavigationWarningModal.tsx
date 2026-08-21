import { useRef, useEffect } from "react";
import { Modal, Text, Group, Stack, rem } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { IconBadge } from "@app/ui/IconBadge";
import { useNavigationGuard } from "@app/contexts/NavigationContext";
import { useTranslation } from "react-i18next";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
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
    try {
      if (handlers?.onApplyAndContinue) {
        await handlers.onApplyAndContinue();
      }
      finishAndNavigate();
    } catch (error) {
      console.error("Failed to apply changes before navigating:", error);
    }
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

  // Only show modal if there are unsaved changes AND there's an actual pending navigation
  if (!hasUnsavedChanges || !pendingNavigation) {
    return null;
  }

  return (
    <Modal
      opened={showNavigationWarning}
      onClose={handleKeepWorking}
      centered
      size={rem(400)}
      radius="lg"
      padding="xl"
      withCloseButton={false}
      overlayProps={{ blur: 4, opacity: 0.4 }}
      transitionProps={{ transition: "pop", duration: 140 }}
      closeOnClickOutside={true}
      closeOnEscape={true}
      zIndex={Z_INDEX_TOAST}
    >
      <Modal.Title className="sr-only">
        {t("unsavedChangesTitle", "Unsaved changes")}
      </Modal.Title>
      <Stack align="center" gap="md">
        <IconBadge accent="amber" size="md">
          <WarningAmberRoundedIcon style={{ fontSize: 22 }} />
        </IconBadge>

        <Stack gap={4} ta="center">
          <Text fw={600} size="lg">
            {t("unsavedChangesTitle", "Unsaved changes")}
          </Text>
          <Text size="sm" c="var(--c-text-muted)" lh={1.5}>
            {t(
              "unsavedChangesBody",
              "You have unsaved changes to your PDF. Are you sure you want to leave?",
            )}
          </Text>
        </Stack>

        <Stack gap="sm" w="100%" mt="xs">
          {hasApply && (
            <Button
              fullWidth
              variant="primary"
              onClick={handleApplyAndContinue}
            >
              {t("applyAndContinue", "Save & Leave")}
            </Button>
          )}
          {hasExport && (
            <Button
              fullWidth
              variant="primary"
              onClick={handleExportAndContinue}
            >
              {t("exportAndContinue", "Export & Leave")}
            </Button>
          )}
          <Group grow gap="sm" wrap="nowrap">
            <Button
              variant="secondary"
              accent="neutral"
              data-autofocus
              onClick={handleKeepWorking}
            >
              {t("keepWorking", "Keep Working")}
            </Button>
            <Button
              variant="secondary"
              accent="danger"
              onClick={handleDiscardChanges}
            >
              {t("discardChanges", "Discard & Leave")}
            </Button>
          </Group>
        </Stack>
      </Stack>
    </Modal>
  );
};

export default NavigationWarningModal;
