import { Group, Modal, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { PrivateContent } from "@app/components/shared/PrivateContent";

export interface CloseFileEntry {
  /** Stable key: two open files can share a name, their ids cannot. */
  id: string;
  name: string;
}

export interface CloseFilesConfirmModalProps {
  opened: boolean;
  message: string;
  files: CloseFileEntry[];
  /** The destructive button's label: a plain close, or discarding unsaved changes. */
  closeLabel: string;
  onClose: () => void;
  onCancel: () => void;
  /** Offers saving before closing; omit when there is nothing to save. */
  onSave?: () => void;
}

/** The "are you sure you want to close" confirmation, shared by every view that closes files. */
export function CloseFilesConfirmModal({
  opened,
  message,
  files,
  closeLabel,
  onClose,
  onCancel,
  onSave,
}: CloseFilesConfirmModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={t("confirmClose", "Confirm Close")}
      centered
      size="auto"
    >
      <Stack gap="md">
        <Text size="md">{message}</Text>
        {files.map((file) => (
          <Text key={file.id} size="sm" c="dimmed" fw={500}>
            <PrivateContent>{file.name}</PrivateContent>
          </Text>
        ))}
        <Group justify="flex-end" gap="sm">
          <Button variant="secondary" onClick={onCancel}>
            {t("confirmCloseCancel", "Cancel")}
          </Button>
          <Button accent="danger" onClick={onClose}>
            {closeLabel}
          </Button>
          {onSave && (
            <Button onClick={onSave}>
              {t("confirmCloseSave", "Save and close")}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
