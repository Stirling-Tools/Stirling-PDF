import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Group, Modal, Stack, TextInput } from "@mantine/core";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";

interface FolderNameDialogProps {
  opened: boolean;
  title: string;
  initialName?: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => void | Promise<void>;
}

export function FolderNameDialog({
  opened,
  title,
  initialName = "",
  submitLabel,
  onClose,
  onSubmit,
}: FolderNameDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setValue(initialName);
      setSubmitting(false);
      setError(null);
    }
  }, [opened, initialName]);

  const submit = async () => {
    const name = value.trim();
    if (!name) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(name);
      onClose();
    } catch (err) {
      // Keep dialog open so the user can retry. Closing on error was a
      // silent failure (the dialog vanished, but the folder was never
      // created - user thinks success, sees no folder).
      setError(
        err instanceof Error
          ? err.message
          : t(
              "filesPage.folderName.error",
              "Could not save folder. Try again.",
            ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      size="sm"
      keepMounted
      transitionProps={{ duration: 0 }}
    >
      <Stack gap="sm">
        <TextInput
          autoFocus
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          placeholder={t("filesPage.folderName.placeholder", "Folder name")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          maxLength={120}
          aria-label={t("filesPage.folderName.label", "Folder name")}
        />
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
          <Button variant="default" onClick={onClose}>
            {t("filesPage.folderName.cancel", "Cancel")}
          </Button>
          <Button
            onClick={submit}
            loading={submitting}
            disabled={!value.trim()}
          >
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
