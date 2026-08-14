import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Group, Modal, Radio, Stack, TextInput } from "@mantine/core";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";

import { Button } from "@app/ui/Button";
import type { FolderKind } from "@app/types/folder";

interface FolderNameDialogProps {
  opened: boolean;
  title: string;
  initialName?: string;
  submitLabel: string;
  /**
   * Kinds the new folder may be, when the caller is offering a choice — only
   * ever at root-level creation, since a subfolder inherits its parent's kind.
   * One entry (or absent) means no choice to make, so no chooser is shown.
   */
  kindOptions?: FolderKind[];
  onClose: () => void;
  onSubmit: (name: string, kind?: FolderKind) => void | Promise<void>;
}

export function FolderNameDialog({
  opened,
  title,
  initialName = "",
  submitLabel,
  kindOptions,
  onClose,
  onSubmit,
}: FolderNameDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialName);
  const [kind, setKind] = useState<FolderKind | undefined>(kindOptions?.[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setValue(initialName);
      setKind(kindOptions?.[0]);
      setSubmitting(false);
      setError(null);
    }
    // kindOptions is a fresh array per render; keying the reset on its first
    // entry keeps this effect from re-firing (and wiping the user's pick)
    // every render while the dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, initialName, kindOptions?.[0]]);

  const submit = async () => {
    const name = value.trim();
    if (!name) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(name, kind);
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
        {kindOptions && kindOptions.length > 1 && (
          <Radio.Group
            value={kind}
            onChange={(next) => setKind(next as FolderKind)}
            label={t(
              "filesPage.folderKindChoice.label",
              "Where should this folder live?",
            )}
          >
            <Stack gap="xs" mt="xs">
              {kindOptions.includes("server") && (
                <Radio
                  value="server"
                  label={t(
                    "filesPage.folderKindChoice.server",
                    "On the server",
                  )}
                  description={t(
                    "filesPage.folderKindChoice.serverHint",
                    "Synced to your account and available wherever you sign in.",
                  )}
                />
              )}
              {kindOptions.includes("virtual") && (
                <Radio
                  value="virtual"
                  label={t(
                    "filesPage.folderKindChoice.virtual",
                    "In this browser",
                  )}
                  description={t(
                    "filesPage.folderKindChoice.virtualHint",
                    "Only on this device. Works offline; holds files that are on this device too.",
                  )}
                />
              )}
            </Stack>
          </Radio.Group>
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
          <Button variant="secondary" onClick={onClose}>
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
