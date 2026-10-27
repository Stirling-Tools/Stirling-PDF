import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Group, Modal, Radio, Stack, Text } from "@mantine/core";
import { Icon } from "@editor/ui/Icon";
import { Button } from "@editor/ui/Button";

import type { StirlingFileStub } from "@editor/types/fileContext";
import type { DeleteScope } from "@editor/services/serverStorageDelete";

interface DeleteFilesDialogProps {
  opened: boolean;
  /** Files targeted for deletion (resolved stubs). */
  files: StirlingFileStub[];
  onClose: () => void;
  /** Perform the delete for the chosen scope; may throw to surface an error. */
  onConfirm: (scope: DeleteScope) => Promise<void>;
}

/** An ephemeral stub (server-/shared-) has no local IndexedDB row. */
function hasLocalCopy(stub: StirlingFileStub): boolean {
  const id = String(stub.id);
  return !id.startsWith("server-") && !id.startsWith("shared-");
}

/** Only the owner can delete a file from cloud storage (backend is owner-only). */
function hasDeletableCloudCopy(stub: StirlingFileStub): boolean {
  return (
    typeof stub.remoteStorageId === "number" &&
    stub.remoteOwnedByCurrentUser === true
  );
}

export function DeleteFilesDialog({
  opened,
  files,
  onClose,
  onConfirm,
}: DeleteFilesDialogProps) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<DeleteScope>("everywhere");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { total, localCount, cloudCount } = useMemo(() => {
    let local = 0;
    let cloud = 0;
    for (const f of files) {
      if (hasLocalCopy(f)) local += 1;
      if (hasDeletableCloudCopy(f)) cloud += 1;
    }
    return { total: files.length, localCount: local, cloudCount: cloud };
  }, [files]);

  // "Choice" mode only when files live in both places - otherwise a plain confirm.
  const showChoice = localCount > 0 && cloudCount > 0;

  useEffect(() => {
    if (opened) {
      setScope("everywhere");
      setSubmitting(false);
      setError(null);
    }
  }, [opened]);

  const runConfirm = async (chosen: DeleteScope) => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(chosen);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("filesPage.deleteFilesError", "Could not delete. Try again."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Single fixed scope when there's no real choice: pure-local -> device,
  // pure-cloud (no local copy) -> everywhere (nothing local to keep).
  const fixedScope: DeleteScope = cloudCount === 0 ? "device" : "everywhere";

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("filesPage.deleteFilesTitle", "Remove {{count}} file(s)?", {
        count: total,
      })}
      centered
      size="md"
    >
      <Stack gap="md">
        {showChoice ? (
          <>
            <Text size="sm">
              {t(
                "filesPage.deleteFilesChoiceBody",
                "Some of these files are saved both in your library and in the cloud. Where should they be removed from?",
              )}
            </Text>
            <Radio.Group
              value={scope}
              onChange={(v) => setScope(v as DeleteScope)}
            >
              <Stack gap="xs">
                <Radio
                  value="device"
                  disabled={submitting}
                  label={t("filesPage.deleteScope.device", "This device only")}
                  description={t(
                    "filesPage.deleteScope.deviceHint",
                    "Removes it from your library on this device. The cloud copy is kept.",
                  )}
                />
                <Radio
                  value="cloud"
                  disabled={submitting}
                  label={t("filesPage.deleteScope.cloud", "Cloud only")}
                  description={t(
                    "filesPage.deleteScope.cloudHint",
                    "Removes it from the cloud. A copy stays in your library.",
                  )}
                />
                <Radio
                  value="everywhere"
                  disabled={submitting}
                  label={t("filesPage.deleteScope.everywhere", "Everywhere")}
                  description={t(
                    "filesPage.deleteScope.everywhereHint",
                    "Removes it from your library and the cloud.",
                  )}
                />
              </Stack>
            </Radio.Group>
          </>
        ) : (
          <Text size="sm">
            {cloudCount === 0
              ? t(
                  "filesPage.deleteFilesLocalBody",
                  "Remove {{count}} file(s) from your library? This clears them from Stirling PDF, not from your computer.",
                  { count: total },
                )
              : t(
                  "filesPage.deleteFilesCloudBody",
                  "Remove {{count}} file(s) from the cloud? This can't be undone.",
                  { count: total },
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
            onClick={() => runConfirm(showChoice ? scope : fixedScope)}
          >
            {t("filesPage.delete", "Delete")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
