import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Group, Modal, Stack, Text } from "@mantine/core";
import { Icon } from "@editor/ui/Icon";
import { Button } from "@editor/ui/Button";

interface ClearRecentsDialogProps {
  opened: boolean;
  /** Files the clear will remove. */
  clearCount: number;
  /** How many of those are open in the workbench. */
  openCount: number;
  onClose: () => void;
  /** Perform the clear, leaving open files alone if asked; may throw to surface an error. */
  onConfirm: (skipOpen: boolean) => Promise<void>;
}

export function ClearRecentsDialog({
  opened,
  clearCount,
  openCount,
  onClose,
  onConfirm,
}: ClearRecentsDialogProps) {
  const { t } = useTranslation();
  // Which choice is running, so only that button spins.
  const [submitting, setSubmitting] = useState<"all" | "skipOpen" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setSubmitting(null);
      setError(null);
    }
  }, [opened]);

  const runClear = async (skipOpen: boolean) => {
    setSubmitting(skipOpen ? "skipOpen" : "all");
    setError(null);
    try {
      await onConfirm(skipOpen);
      onClose();
    } catch (err) {
      console.error("Failed to clear recents:", err);
      setError(
        t("fileSidebar.clearRecents.error", "Could not clear. Try again."),
      );
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Modal
      opened={opened}
      // Closing mid-clear would let a reopen start a second run over the first.
      onClose={submitting ? () => {} : onClose}
      title={t("fileSidebar.clearRecents.title", "Clear recents?")}
      centered
      size="md"
    >
      <Stack gap="md">
        <Text size="sm">
          {t(
            "fileSidebar.clearRecents.body",
            "Clear {{count}} file(s) from recents? This can't be undone.",
            { count: clearCount },
          )}
        </Text>
        {openCount > 0 && (
          <Text size="sm">
            {t(
              "fileSidebar.clearRecents.openNote",
              "{{count}} of them are open in the workbench.",
              { count: openCount },
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
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={submitting !== null}
          >
            {t("filesPage.cancel", "Cancel")}
          </Button>
          {/* Skipping every file would clear nothing, so the choice is only
              offered when some files aren't open. */}
          {openCount > 0 && openCount < clearCount && (
            <Button
              variant="secondary"
              loading={submitting === "skipOpen"}
              disabled={submitting === "all"}
              onClick={() => void runClear(true)}
              data-testid="file-sidebar-clear-recents-skip-open"
            >
              {t("fileSidebar.clearRecents.skipOpen", "Skip open files")}
            </Button>
          )}
          <Button
            accent="danger"
            loading={submitting === "all"}
            disabled={submitting === "skipOpen"}
            onClick={() => void runClear(false)}
            data-testid="file-sidebar-clear-recents-confirm"
          >
            {t("fileSidebar.clearRecents.confirm", "Clear recents")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
