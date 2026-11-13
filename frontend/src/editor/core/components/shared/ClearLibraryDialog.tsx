import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Group, Modal, Stack, Text } from "@mantine/core";
import { Icon } from "@editor/ui/Icon";
import { Button } from "@editor/ui/Button";

interface ClearLibraryDialogProps {
  opened: boolean;
  /** Files the clear will remove. */
  clearCount: number;
  onClose: () => void;
  /** Perform the clear; may throw to surface an error. */
  onConfirm: () => Promise<void>;
}

export function ClearLibraryDialog({
  opened,
  clearCount,
  onClose,
  onConfirm,
}: ClearLibraryDialogProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setSubmitting(false);
      setError(null);
    }
  }, [opened]);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("fileSidebar.clearRecents.error", "Could not clear. Try again."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("fileSidebar.clearRecents.title", "Clear recents?")}
      centered
      size="md"
    >
      <Stack gap="md">
        <Text size="sm">
          {t(
            "fileSidebar.clearRecents.body",
            "Clear {{count}} file(s) from recents?",
            { count: clearCount },
          )}
        </Text>

        {error && (
          <Alert
            color="red"
            icon={<Icon name="circle-alert" size={20} />}
            variant="light"
            role="alert"
          >
            {error}
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t("filesPage.cancel", "Cancel")}
          </Button>
          <Button
            accent="danger"
            loading={submitting}
            onClick={handleConfirm}
            data-testid="file-sidebar-clear-library-confirm"
          >
            {t("fileSidebar.clearRecents.confirm", "Clear recents")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
