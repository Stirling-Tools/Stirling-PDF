/**
 * The one "unsaved changes" dialog. Navigation and the form editor's tab switch both render it,
 * so the choice looks identical wherever it interrupts you; only the actions behind it differ.
 */
import { Modal, Text, Group, Stack, rem } from "@mantine/core";
import { useTranslation } from "react-i18next";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";

import { Button } from "@app/ui/Button";
import { IconBadge } from "@app/ui/IconBadge";
import { Z_INDEX_TOAST } from "@app/styles/zIndex";

export interface UnsavedChangesDialogProps {
  opened: boolean;
  saving?: boolean;
  onKeepWorking: () => void;
  onDiscard: () => void;
  /** Omit to hide the button, as when there is nothing this caller can save. */
  onSave?: () => void;
  onExport?: () => void;
}

export function UnsavedChangesDialog({
  opened,
  saving = false,
  onKeepWorking,
  onDiscard,
  onSave,
  onExport,
}: UnsavedChangesDialogProps) {
  const { t } = useTranslation();
  const heading = t("unsavedChangesTitle", "Unsaved changes");

  return (
    <Modal
      opened={opened}
      onClose={onKeepWorking}
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
      <Modal.Title className="sr-only">{heading}</Modal.Title>
      <Stack align="center" gap="md">
        <IconBadge accent="amber" size="md">
          <WarningAmberRoundedIcon style={{ fontSize: 22 }} />
        </IconBadge>

        <Stack gap={4} ta="center">
          <Text fw={600} size="lg">
            {heading}
          </Text>
          <Text size="sm" c="var(--c-text-muted)" lh={1.5}>
            {t(
              "unsavedChangesBody",
              "You have unsaved changes to your PDF. Are you sure you want to leave?",
            )}
          </Text>
        </Stack>

        <Stack gap="sm" w="100%" mt="xs">
          {onSave && (
            <Button
              fullWidth
              variant="primary"
              loading={saving}
              data-testid="unsaved-save"
              onClick={onSave}
            >
              {t("applyAndContinue", "Save & Leave")}
            </Button>
          )}
          {onExport && (
            <Button fullWidth variant="primary" onClick={onExport}>
              {t("exportAndContinue", "Export & Leave")}
            </Button>
          )}
          <Group grow gap="sm" wrap="nowrap">
            <Button
              variant="secondary"
              accent="neutral"
              data-autofocus
              onClick={onKeepWorking}
            >
              {t("keepWorking", "Keep Working")}
            </Button>
            <Button
              variant="secondary"
              accent="danger"
              data-testid="unsaved-discard"
              onClick={onDiscard}
            >
              {t("discardChanges", "Discard & Leave")}
            </Button>
          </Group>
        </Stack>
      </Stack>
    </Modal>
  );
}

export default UnsavedChangesDialog;
