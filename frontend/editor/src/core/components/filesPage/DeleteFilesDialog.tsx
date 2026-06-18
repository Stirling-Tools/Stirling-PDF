import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Group, Modal, Radio, Stack, Text } from "@mantine/core";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";

import type { StirlingFileStub } from "@app/types/fileContext";
import type { DeleteScope } from "@app/services/serverStorageDelete";

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
      title={t("filesPage.deleteFilesTitle", "Delete {{count}} file(s)?", {
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
                "Some of these files are saved both on this device and in the cloud. Where should they be deleted from?",
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
                    "Removes the local copy. The cloud copy is kept.",
                  )}
                />
                <Radio
                  value="cloud"
                  disabled={submitting}
                  label={t("filesPage.deleteScope.cloud", "Cloud only")}
                  description={t(
                    "filesPage.deleteScope.cloudHint",
                    "Deletes from the server. A copy stays on this device.",
                  )}
                />
                <Radio
                  value="everywhere"
                  disabled={submitting}
                  label={t("filesPage.deleteScope.everywhere", "Everywhere")}
                  description={t(
                    "filesPage.deleteScope.everywhereHint",
                    "Deletes the file from this device and the cloud.",
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
                  "Delete {{count}} file(s) from this device? This cannot be undone.",
                  { count: total },
                )
              : t(
                  "filesPage.deleteFilesCloudBody",
                  "Delete {{count}} file(s) from the cloud? This cannot be undone.",
                  { count: total },
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
            onClick={() => runConfirm(showChoice ? scope : fixedScope)}
          >
            {t("filesPage.delete", "Delete")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
