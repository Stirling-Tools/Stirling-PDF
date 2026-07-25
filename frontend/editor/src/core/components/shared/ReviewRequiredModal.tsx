import { Group, Modal, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import { Button } from "@app/ui/Button";

export interface ReviewRequiredModalProps {
  opened: boolean;
  /** Translated verb for the blocked action, e.g. "download", "print", "share". */
  action: string;
  /** How many of the targeted files still need review. */
  count: number;
  onCancel: () => void;
  onReviewNow: () => void;
  onExportAnyway: () => void;
}

/**
 * Blocks an export-type action when a targeted file still needs review. The
 * override is styled as a danger action so the risk is explicit.
 */
export function ReviewRequiredModal({
  opened,
  action,
  count,
  onCancel,
  onReviewNow,
  onExportAnyway,
}: ReviewRequiredModalProps) {
  const { t } = useTranslation();
  // `action` is lowercase for the sentence body; the button label starts a phrase.
  const actionTitle = action.charAt(0).toUpperCase() + action.slice(1);
  const message =
    count > 1
      ? t(
          "reviewTool.gate.bodyMany",
          "One or more of the selected documents needs review before you can {{action}} them.",
          { action },
        )
      : t(
          "reviewTool.gate.bodyOne",
          "This document needs review before you can {{action}} it.",
          { action },
        );

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      centered
      radius="lg"
      title={t("reviewTool.gate.title", "Review required")}
      overlayProps={{ blur: 4 }}
      // A safety gate should appear immediately, not fade in.
      transitionProps={{ duration: 0 }}
    >
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <WarningAmberRoundedIcon
            style={{ color: "var(--c-warning)", fontSize: "1.5rem" }}
          />
          <Text size="sm">{message}</Text>
        </Group>
        <Group justify="flex-end" gap="sm">
          <Button variant="secondary" accent="neutral" onClick={onCancel}>
            {t("cancel", "Cancel")}
          </Button>
          <Button
            variant="secondary"
            accent="danger"
            leftSection={<WarningAmberRoundedIcon fontSize="small" />}
            onClick={onExportAnyway}
          >
            {t("reviewTool.gate.continueAnyway", "{{action}} anyway", {
              action: actionTitle,
            })}
          </Button>
          <Button
            leftSection={<FactCheckOutlinedIcon fontSize="small" />}
            onClick={onReviewNow}
          >
            {t("reviewTool.gate.reviewNow", "Review now")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
