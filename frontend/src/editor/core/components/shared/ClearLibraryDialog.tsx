import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Group, Modal, Stack, Text } from "@mantine/core";
import { Icon } from "@editor/ui/Icon";
import { Button } from "@editor/ui/Button";

interface ClearLibraryDialogProps {
  opened: boolean;
  /** Files the clear will remove. */
  clearCount: number;
  /** Files it leaves alone (in a folder, or open in the workbench). */
  keptCount: number;
  onClose: () => void;
  /** Perform the clear; may throw to surface an error. */
  onConfirm: () => Promise<void>;
}

export function ClearLibraryDialog({
  opened,
  clearCount,
  keptCount,
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
          : t("fileSidebar.clearLibrary.error", "Could not clear. Try again."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("fileSidebar.clearLibrary.title", "Clear PDF library?")}
      centered
      size="md"
    >
      <Stack gap="md">
        <Text size="sm">
          {t(
            "fileSidebar.clearLibrary.body",
            "Remove {{count}} file(s) from your library? This clears them from Stirling PDF only, not from your computer or the cloud.",
            { count: clearCount },
          )}
        </Text>
        {keptCount > 0 && (
          <Text size="sm" c="dimmed">
            {t(
              "fileSidebar.clearLibrary.kept",
              "Files in folders and files you have open are kept ({{kept}}).",
              { kept: keptCount },
            )}
          </Text>
        )}

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
            {t("fileSidebar.clearLibrary.confirm", "Clear library")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
