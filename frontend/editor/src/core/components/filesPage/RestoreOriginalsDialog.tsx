import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Group, Modal, Stack, Text } from "@mantine/core";
import { Button } from "@app/ui/Button";

interface RestoreOriginalsDialogProps {
  opened: boolean;
  /** The single file being restored; absent means every original in the folder. */
  fileName?: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

/**
 * Confirms a restore before it runs: bringing originals back pauses the
 * folder's processing, and the restored files read as waiting until the user
 * resumes — a state change worth saying out loud rather than springing.
 */
export function RestoreOriginalsDialog({
  opened,
  fileName,
  onClose,
  onConfirm,
}: RestoreOriginalsDialogProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (opened) setSubmitting(false);
  }, [opened]);
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("filesPage.processing.revertConfirmTitle", "Restore originals?")}
      centered
      size="md"
    >
      <Stack gap="md">
        <Text size="sm">
          {fileName
            ? t("filesPage.processing.revertConfirmFile", {
                name: fileName,
                defaultValue:
                  'Restore "{{name}}" to its original? Processing for this folder will be paused, and the file shows as queued until you resume.',
              })
            : t(
                "filesPage.processing.revertConfirmAll",
                "Restore every original in this folder? Processing will be paused, and restored files show as queued until you resume.",
              )}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button
            variant="tertiary"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            {t("filesPage.processing.revertCancel", "Cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setSubmitting(true);
              void Promise.resolve(onConfirm()).finally(onClose);
            }}
            loading={submitting}
          >
            {t("filesPage.processing.revertConfirm", "Restore and pause")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
