import { Modal, Stack, Text, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { Button } from "@app/ui/Button";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@app/styles/zIndex";

interface DiskConflictModalProps {
  opened: boolean;
  fileName?: string;
  /** Conflicts still queued behind this one. */
  remainingCount: number;
  onKeepMine: () => void;
  onUseDisk: () => void;
}

/** Two real versions of a document exist, so the user picks one. No dismiss:
 *  whichever way this closes, one of the two versions is being discarded. */
export function DiskConflictModal({
  opened,
  fileName,
  remainingCount,
  onKeepMine,
  onUseDisk,
}: DiskConflictModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      opened={opened}
      onClose={onKeepMine}
      title={t("desktopFileLink.conflict.title", "File changed on disk")}
      centered
      size="md"
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
    >
      <Stack gap="md">
        <Text fw={600} ta="center">
          {fileName}
        </Text>
        <Text c="dimmed">
          {t(
            "desktopFileLink.conflict.prompt",
            "This file changed on disk while you had unsaved changes here. Only one version can be kept.",
          )}
        </Text>
        {remainingCount > 0 && (
          <Text c="dimmed" size="sm" ta="center">
            {t(
              "desktopFileLink.conflict.remaining",
              "{{count}} more to review",
              {
                count: remainingCount,
              },
            )}
          </Text>
        )}
        <Group grow>
          <Button variant="secondary" onClick={onUseDisk}>
            {t("desktopFileLink.conflict.useDisk", "Use the disk version")}
          </Button>
          <Button onClick={onKeepMine}>
            {t("desktopFileLink.conflict.keepMine", "Keep my changes")}
          </Button>
        </Group>
        <Text c="dimmed" size="xs" ta="center">
          {t(
            "desktopFileLink.conflict.hint",
            "Keeping your changes overwrites the file on disk when you next save.",
          )}
        </Text>
      </Stack>
    </Modal>
  );
}
