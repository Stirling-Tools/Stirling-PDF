import React, { useCallback, useEffect, useState } from "react";
import { Modal, Stack, Text, Group, Alert } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";

import { alert } from "@app/components/toast";
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from "@app/styles/zIndex";
import type { StirlingFileStub } from "@app/types/fileContext";
import { uploadHistoryChain } from "@app/services/serverStorageUpload";
import { SharedFileConflictError } from "@app/services/sharedFileSave";
import { useSharedFileActions } from "@app/hooks/useSharedFileActions";
import { fileStorage } from "@app/services/fileStorage";
import { useFileActions } from "@app/contexts/FileContext";
import type { FileId } from "@app/types/file";

interface UploadToServerModalProps {
  opened: boolean;
  onClose: () => void;
  file: StirlingFileStub;
  onUploaded?: () => Promise<void> | void;
}

const UploadToServerModal: React.FC<UploadToServerModalProps> = ({
  opened,
  onClose,
  file,
  onUploaded,
}) => {
  const { t } = useTranslation();
  const { actions } = useFileActions();
  const { fetchLatestCopy } = useSharedFileActions();
  const [isUploading, setIsUploading] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) {
      setIsUploading(false);
      setHasConflict(false);
      setErrorMessage(null);
    }
  }, [opened]);

  const handleUpload = useCallback(
    async (force = false) => {
      setIsUploading(true);
      setErrorMessage(null);

      try {
        const originalFileId = (file.originalFileId || file.id) as FileId;
        const remoteId = file.remoteStorageId;
        const {
          remoteId: storedId,
          updatedAt,
          version,
          chain,
        } = await uploadHistoryChain(originalFileId, remoteId, {
          baseVersion: file.remoteVersionBase,
          force,
        });

        for (const stub of chain) {
          const updates = {
            remoteStorageId: storedId,
            remoteStorageUpdatedAt: updatedAt,
            remoteOwnedByCurrentUser: true,
            remoteVersionBase: version,
            remoteVersionLatest: version,
          };
          actions.updateStirlingFileStub(stub.id, updates);
          await fileStorage.updateFileMetadata(stub.id, updates);
        }

        alert({
          alertType: "success",
          title: t("storageUpload.success", "Uploaded to server"),
          expandable: false,
          durationMs: 3000,
        });
        if (onUploaded) {
          await onUploaded();
        }
        onClose();
      } catch (error) {
        if (error instanceof SharedFileConflictError) {
          setHasConflict(true);
        } else {
          console.error("Failed to upload file to server:", error);
          setErrorMessage(
            t(
              "storageUpload.failure",
              "Upload failed. Please check your login and storage settings.",
            ),
          );
        }
      } finally {
        setIsUploading(false);
      }
    },
    [actions, file, onClose, onUploaded, t],
  );

  const handleGetLatestCopy = useCallback(async () => {
    setIsUploading(true);
    setErrorMessage(null);
    const ok = await fetchLatestCopy(file);
    setIsUploading(false);
    if (ok) {
      onClose();
    }
  }, [fetchLatestCopy, file, onClose]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      title={t("storageUpload.title", "Upload to Server")}
      zIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
      size={hasConflict ? "lg" : "md"}
    >
      <Stack gap="sm">
        {!hasConflict && (
          <>
            <Text size="sm">
              {t(
                "storageUpload.description",
                "This uploads the current file to server storage for your own access.",
              )}
            </Text>
            <Text size="sm" c="dimmed">
              {t("storageUpload.fileLabel", "File")}: {file.name}
            </Text>
            <Text size="xs" c="dimmed">
              {t(
                "storageUpload.hint",
                "Public links and access modes are controlled by your server settings.",
              )}
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
            title={t("storageUpload.errorTitle", "Upload failed")}
          >
            {errorMessage}
          </Alert>
        )}

        <Group justify="flex-end" gap="sm">
          <Button variant="secondary" onClick={onClose} disabled={isUploading}>
            {t("cancel", "Cancel")}
          </Button>
          {hasConflict ? (
            <>
              <Button
                variant="secondary"
                leftSection={<Icon name="download" size={18} />}
                onClick={() => void handleGetLatestCopy()}
                loading={isUploading}
              >
                {t("storageCollab.getLatest", "Get latest version")}
              </Button>
              <Button
                accent="danger"
                leftSection={<Icon name="cloud-upload" size={18} />}
                onClick={() => void handleUpload(true)}
                loading={isUploading}
              >
                {t("storageCollab.overwrite", "Overwrite anyway")}
              </Button>
            </>
          ) : (
            <Button
              leftSection={<Icon name="cloud-upload" size={18} />}
              onClick={() => void handleUpload(false)}
              loading={isUploading}
            >
              {file.remoteStorageId
                ? t("storageUpload.updateButton", "Update on Server")
                : t("storageUpload.uploadButton", "Upload to Server")}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
};

export default UploadToServerModal;
