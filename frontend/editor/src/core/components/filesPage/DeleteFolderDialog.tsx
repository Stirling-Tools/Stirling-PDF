import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";

import { FolderRecord } from "@app/types/folder";

interface DeleteFolderDialogProps {
  opened: boolean;
  folder: FolderRecord | null;
  /** Number of files inside the folder (and subtree). */
  fileCount: number;
  onClose: () => void;
  /** Confirm; `deleteContents` is true when the user opted in to delete files. */
  onConfirm: (deleteContents: boolean) => void | Promise<void>;
}

export function DeleteFolderDialog({
  opened,
  folder,
  fileCount,
  onClose,
  onConfirm,
}: DeleteFolderDialogProps) {
  const { t } = useTranslation();
  const [deleteContents, setDeleteContents] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setDeleteContents(false);
      setSubmitting(false);
      setError(null);
    }
  }, [opened]);

  if (!folder) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("filesPage.deleteFolderTitle", "Delete folder?")}
      centered
      size="md"
    >
      <Stack gap="md">
        <Text size="sm">
          {t("filesPage.deleteFolderBody", 'Delete folder "{{name}}"?', {
            name: folder.name,
          })}
        </Text>
        {fileCount > 0 && (
          <Checkbox
            checked={deleteContents}
            onChange={(e) => setDeleteContents(e.currentTarget.checked)}
            disabled={submitting}
            label={t(
              "filesPage.deleteFolderContents",
              "Also delete {{count}} file(s) inside the folder",
              { count: fileCount },
            )}
          />
        )}
        {fileCount > 0 && (
          <Text size="xs" c="dimmed">
            {deleteContents
              ? t(
                  "filesPage.deleteFolderContentsWarning",
                  "Files will be permanently removed and cannot be recovered.",
                )
              : t(
                  "filesPage.deleteFolderKeepHint",
                  "Files inside will be moved to All files.",
                )}
          </Text>
        )}
        {error && (
          <Alert
            color="red"
            icon={<ErrorOutlineIcon fontSize="small" />}
            variant="light"
            role="alert"
          >
            {error}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={submitting}>
            {t("filesPage.cancel", "Cancel")}
          </Button>
          <Button
            color="red"
            loading={submitting}
            onClick={async () => {
              setSubmitting(true);
              setError(null);
              try {
                await onConfirm(deleteContents);
                onClose();
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : t(
                        "filesPage.deleteFolderError",
                        "Could not delete the folder. Try again.",
                      ),
                );
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {t("filesPage.delete", "Delete")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
