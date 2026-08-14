import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Group,
  Modal,
  Radio,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";

import { Button } from "@app/ui/Button";
import type { FolderKind } from "@app/types/folder";
import {
  pickDirectory,
  type PickedDirectory,
} from "@app/services/directoryPicker";

interface FolderNameDialogProps {
  opened: boolean;
  title: string;
  initialName?: string;
  submitLabel: string;
  /**
   * Kinds the new folder may be, when the caller is offering a choice — only
   * ever at root-level creation, since a subfolder inherits its parent's kind.
   * A disabled entry renders greyed with its reason as the tooltip, the same
   * treatment the New folder button itself used to get; keeping the option
   * visible tells the user the capability exists even where this install
   * can't offer it. Absent (or a single enabled entry) means no chooser.
   */
  kindChoices?: Array<{ kind: FolderKind; disabledReason?: string }>;
  onClose: () => void;
  onSubmit: (
    name: string,
    kind?: FolderKind,
    /** For kind "local": the directory being mounted. */
    directory?: string,
  ) => void | Promise<void>;
}

/** Label + hint per offered kind, resolved through i18n at render. */
const KIND_COPY: Record<
  FolderKind,
  {
    labelKey: string;
    labelDefault: string;
    hintKey: string;
    hintDefault: string;
  }
> = {
  local: {
    labelKey: "filesPage.folderKindChoice.local",
    labelDefault: "A folder on this computer",
    hintKey: "filesPage.folderKindChoice.localHint",
    hintDefault:
      "Shows a real folder from your disk here. Its files stay exactly where they are.",
  },
  virtual: {
    labelKey: "filesPage.folderKindChoice.virtual",
    labelDefault: "In this browser",
    hintKey: "filesPage.folderKindChoice.virtualHint",
    hintDefault:
      "Only on this device. Works offline; holds files that are on this device too.",
  },
  server: {
    labelKey: "filesPage.folderKindChoice.server",
    labelDefault: "On the server",
    hintKey: "filesPage.folderKindChoice.serverHint",
    hintDefault: "Synced to your account and available wherever you sign in.",
  },
};

export function FolderNameDialog({
  opened,
  title,
  initialName = "",
  submitLabel,
  kindChoices,
  onClose,
  onSubmit,
}: FolderNameDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialName);
  const firstEnabledKind = kindChoices?.find((c) => !c.disabledReason)?.kind;
  const [kind, setKind] = useState<FolderKind | undefined>(firstEnabledKind);
  const [pickedDir, setPickedDir] = useState<PickedDirectory | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setValue(initialName);
      setKind(firstEnabledKind);
      setPickedDir(null);
      setSubmitting(false);
      setError(null);
    }
    // kindChoices is a fresh array per render; keying the reset on the derived
    // first-enabled kind keeps this effect from re-firing (and wiping the
    // user's pick) every render while the dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, initialName, firstEnabledKind]);

  const mountingDisk = kind === "local";

  const submit = async () => {
    // A mounted folder is named by its directory; anything else by the input.
    const name = mountingDisk ? pickedDir?.name : value.trim();
    if (!name) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(name, kind, mountingDisk ? pickedDir?.path : undefined);
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
        {kindChoices && kindChoices.length > 1 && (
          <Radio.Group
            value={kind}
            onChange={(next) => setKind(next as FolderKind)}
            label={t(
              "filesPage.folderKindChoice.label",
              "Where should this folder live?",
            )}
          >
            <Stack gap="xs" mt="xs">
              {kindChoices.map(({ kind: choice, disabledReason }) => {
                const copy = KIND_COPY[choice];
                const radio = (
                  <Radio
                    key={choice}
                    value={choice}
                    disabled={Boolean(disabledReason)}
                    label={t(copy.labelKey, copy.labelDefault)}
                    description={t(copy.hintKey, copy.hintDefault)}
                  />
                );
                // Same treatment the New folder button used to get when the
                // server couldn't oblige: greyed, with the reason on hover.
                return disabledReason ? (
                  <Tooltip key={choice} label={disabledReason} withArrow>
                    {/* span: Mantine tooltips need events a disabled input eats */}
                    <span>{radio}</span>
                  </Tooltip>
                ) : (
                  radio
                );
              })}
            </Stack>
          </Radio.Group>
        )}
        {mountingDisk ? (
          <Group gap="sm" wrap="nowrap">
            <Button
              variant="secondary"
              onClick={async () => {
                const picked = await pickDirectory();
                if (picked) setPickedDir(picked);
              }}
            >
              {t(
                "filesPage.folderKindChoice.chooseDirectory",
                "Choose folder…",
              )}
            </Button>
            <Text
              size="sm"
              c={pickedDir ? undefined : "dimmed"}
              style={{ wordBreak: "break-all" }}
            >
              {pickedDir
                ? pickedDir.path
                : t(
                    "filesPage.folderKindChoice.noDirectory",
                    "No folder chosen yet",
                  )}
            </Text>
          </Group>
        ) : (
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
            disabled={mountingDisk ? !pickedDir : !value.trim()}
          >
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
