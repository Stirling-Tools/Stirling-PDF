import React, { useCallback, useEffect, useState } from "react";
import { Modal, Stack, Text, Group, Alert } from "@mantine/core";
import { Button } from "@app/ui/Button";
import CloudSyncIcon from "@mui/icons-material/CloudSync";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { useTranslation } from "react-i18next";

import { alert } from "@app/components/toast";
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from "@app/styles/zIndex";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import {
  saveSharedFile,
  SharedFileConflictError,
} from "@app/services/sharedFileSave";
import { fileStorage } from "@app/services/fileStorage";
import { useFileActions } from "@app/contexts/FileContext";
import { useSharedFileActions } from "@app/hooks/useSharedFileActions";

interface SaveToSharedModalProps {
  opened: boolean;
  onClose: () => void;
  file: StirlingFileStub;
  onSaved?: () => Promise<void> | void;
}

// Saves a recipient's edits back to a shared file (editor role); version
// conflicts get a guided choice instead of a silent overwrite.
const SaveToSharedModal: React.FC<SaveToSharedModalProps> = ({
  opened,
  onClose,
  file,
  onSaved,
}) => {
  const { t } = useTranslation();
  const { actions } = useFileActions();
  const [isWorking, setIsWorking] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) {
      setIsWorking(false);
      setHasConflict(false);
      setErrorMessage(null);
    }
  }, [opened]);

  const applySavedMetadata = useCallback(
    async (version: number | undefined, updatedAt: number) => {
      const originalFileId = (file.originalFileId || file.id) as FileId;
      const chain = await fileStorage.getHistoryChainStubs(originalFileId);
      const stubs = chain.length > 0 ? chain : [file];
      const updates = {
        remoteStorageUpdatedAt: updatedAt,
        remoteVersionBase: version,
        remoteVersionLatest: version,
      };
      for (const stub of stubs) {
        actions.updateStirlingFileStub(stub.id, updates);
        await fileStorage.updateFileMetadata(stub.id, updates);
      }
    },
    [actions, file],
  );

  const handleSave = useCallback(
    async (force = false) => {
      setIsWorking(true);
      setErrorMessage(null);
      try {
        const result = await saveSharedFile(file, { force });
        await applySavedMetadata(result.version, result.updatedAt);
        alert({
          alertType: "success",
          title: t("storageCollab.saved", "Saved to shared file"),
          expandable: false,
          durationMs: 3000,
        });
        if (onSaved) {
          await onSaved();
        }
        onClose();
      } catch (error) {
        if (error instanceof SharedFileConflictError) {
          setHasConflict(true);
        } else {
          console.error("Failed to save shared file:", error);
          setErrorMessage(
            t(
              "storageCollab.saveFailed",
              "Unable to save your changes to the shared file.",
            ),
          );
        }
      } finally {
        setIsWorking(false);
      }
    },
    [applySavedMetadata, file, onClose, onSaved, t],
  );

  const { fetchLatestCopy } = useSharedFileActions();

  const handleGetLatestCopy = useCallback(async () => {
    setIsWorking(true);
    setErrorMessage(null);
    const ok = await fetchLatestCopy(file);
    setIsWorking(false);
    if (ok) {
      onClose();
    }
  }, [fetchLatestCopy, file, onClose]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      title={t("storageCollab.saveTitle", "Save to Shared File")}
      zIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
      overlayProps={{ blur: 6 }}
      size={hasConflict ? "lg" : "md"}
    >
      <Stack gap="sm">
        {!hasConflict && (
          <>
            <Text size="sm">
              {t(
                "storageCollab.saveDescription",
                "Save your changes back to the shared file. Everyone with access will see this version.",
              )}
            </Text>
            <Text size="sm" c="dimmed">
              {t("storageShare.fileLabel", "File")}: {file.name}
              {file.remoteOwnerUsername
                ? ` • ${t("storageCollab.ownedBy", "Owned by {{owner}}", {
                    owner: file.remoteOwnerUsername,
                  })}`
                : ""}
            </Text>
          </>
        )}

        {hasConflict && (
          <Alert
            color="yellow"
            title={t(
              "storageCollab.conflictTitle",
              "This file changed on the server",
            )}
          >
            {t(
              "storageCollab.conflictBody",
              "Someone else saved a newer version since you last synced. You can fetch their version to merge manually, or overwrite it with yours.",
            )}
          </Alert>
        )}

        {errorMessage && (
          <Alert
            color="red"
            title={t("storageCollab.errorTitle", "Save failed")}
          >
            {errorMessage}
          </Alert>
        )}

        <Group justify="flex-end" gap="sm">
          <Button variant="secondary" onClick={onClose} disabled={isWorking}>
            {t("cancel", "Cancel")}
          </Button>
          {hasConflict ? (
            <>
              <Button
                variant="secondary"
                leftSection={<FileDownloadIcon style={{ fontSize: 18 }} />}
                onClick={() => void handleGetLatestCopy()}
                loading={isWorking}
              >
                {t("storageCollab.getLatest", "Get latest version")}
              </Button>
              <Button
                accent="danger"
                leftSection={<CloudSyncIcon style={{ fontSize: 18 }} />}
                onClick={() => void handleSave(true)}
                loading={isWorking}
              >
                {t("storageCollab.overwrite", "Overwrite anyway")}
              </Button>
            </>
          ) : (
            <Button
              leftSection={<CloudSyncIcon style={{ fontSize: 18 }} />}
              onClick={() => void handleSave(false)}
              loading={isWorking}
            >
              {t("storageCollab.saveButton", "Save changes")}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
};

export default SaveToSharedModal;
