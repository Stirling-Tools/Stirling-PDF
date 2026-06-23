import { Modal, Text, Stack, Group } from "@mantine/core";
import { Button } from "@shared/components/Button";
import { useTranslation } from "react-i18next";
import { WatchedFolder } from "@app/types/watchedFolders";

interface DeleteFolderConfirmModalProps {
  opened: boolean;
  folder: WatchedFolder | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteFolderConfirmModal({
  opened,
  folder,
  onConfirm,
  onCancel,
}: DeleteFolderConfirmModalProps) {
  const { t } = useTranslation();

  if (!folder) return null;

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={t("watchedFolders.deleteConfirmTitle", "Delete folder?")}
      centered
      size="sm"
    >
      <Stack gap="md">
        {folder.isDefault && (
          <Text size="sm" c="orange">
            {t(
              "watchedFolders.defaultFolderWarning",
              "This is a default folder and will be recreated on next reload.",
            )}
          </Text>
        )}
        <Text size="sm">
          {t(
            "watchedFolders.deleteConfirmBody",
            "This will remove the folder and its run history. Files already downloaded are not affected.",
          )}
        </Text>
        <Group gap="sm" justify="flex-end">
          <Button variant="outlined" size="sm" onClick={onCancel}>
            {t("cancel", "Cancel")}
          </Button>
          <Button
            variant="filled"
            accent="danger"
            size="sm"
            onClick={onConfirm}
          >
            {t("delete", "Delete")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
