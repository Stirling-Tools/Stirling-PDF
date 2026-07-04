import { useState } from "react";
import { ActionIcon, Button, Group, Loader, Modal, Progress, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import ShareIcon from "@mui/icons-material/Share";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { Tooltip } from "@app/components/shared/Tooltip";
import ShareManagementModal from "@app/components/shared/ShareManagementModal";
import { useViewer } from "@app/contexts/ViewerContext";
import { useFileState, useFileActions } from "@app/contexts/FileContext";
import { uploadHistoryChain } from "@app/services/serverStorageUpload";
import { fileStorage } from "@app/services/fileStorage";
import { alert } from "@app/components/toast";
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from "@app/styles/zIndex";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import { usePolicyFileBadges } from "@app/hooks/usePolicyFileBadges";
import { usePolicyRuns } from "@app/components/policies/policyRunStore";

const IN_FLIGHT = ["PENDING", "RUNNING", "WAITING_FOR_INPUT"] as const;

interface ViewerShareButtonProps {
  disabled?: boolean;
}

const BUTTON_WIDTH = "13rem";

/**
 * Share button for the viewer workbench bar's global action group (alongside
 * Print/Download/Close). Sharing operates on server-stored files, so if the
 * active file is local-only it first prompts the user to save it to the server,
 * then continues straight into the sharing modal.
 */
export default function ViewerShareButton({
  disabled,
}: ViewerShareButtonProps) {
  const { t } = useTranslation();
  const { activeFileId } = useViewer();
  const { selectors } = useFileState();
  const { actions } = useFileActions();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareStub, setShareStub] = useState<StirlingFileStub | null>(null);

  // Resolve strictly to the file shown in the viewer. Never fall back to an
  // arbitrary file — sharing the wrong document would be worse than not
  // sharing. If there's no active file, the button is disabled (see isDisabled).
  const stubs = selectors.getStirlingFileStubs();
  const stub = activeFileId
    ? stubs.find((s) => s.id === activeFileId)
    : undefined;

  const policyFileBadges = usePolicyFileBadges();
  const runs = usePolicyRuns();
  const enforcing =
    !!activeFileId &&
    (policyFileBadges.get(activeFileId) ?? []).some((p) => p.enforcing);
  const enforcingRun = enforcing
    ? runs.find(
        (r) =>
          r.fileId === activeFileId &&
          (IN_FLIGHT as readonly string[]).includes(r.status),
      )
    : undefined;
  const enforcingProgress =
    enforcingRun?.currentStep != null && enforcingRun.stepCount
      ? Math.round((enforcingRun.currentStep / enforcingRun.stepCount) * 100)
      : undefined;

  const label = t("workbenchBar.share", "Share");
  const isDisabled = Boolean(disabled) || !stub || enforcing;

  const tooltipContent = enforcing ? (
    <Stack gap={6} py={2} w={200}>
      <Group gap={6} wrap="nowrap">
        <ShieldOutlinedIcon style={{ fontSize: 13 }} />
        <Text size="xs" fw={600}>
          {t(
            "policy.blockingShare",
            "{{action}} blocked while enforcing policy, please wait",
            { action: label },
          )}
        </Text>
      </Group>
      {enforcingProgress != null ? (
        <Progress
          w="100%"
          size="xs"
          radius="xl"
          value={enforcingProgress}
          striped
          animated
        />
      ) : (
        <Loader size="xs" />
      )}
    </Stack>
  ) : (
    label
  );

  const openShare = (target: StirlingFileStub) => {
    setShareStub(target);
    setShareOpen(true);
  };

  const handleClick = () => {
    if (!stub) return;
    if (stub.remoteStorageId) {
      openShare(stub);
    } else {
      setConfirmOpen(true);
    }
  };

  const handleSaveAndShare = async () => {
    if (!stub) return;
    setSaving(true);
    try {
      const originalFileId = (stub.originalFileId || stub.id) as FileId;
      const { remoteId, updatedAt, chain } = await uploadHistoryChain(
        originalFileId,
        stub.remoteStorageId,
      );
      const metadata = {
        remoteStorageId: remoteId,
        remoteStorageUpdatedAt: updatedAt,
        remoteOwnedByCurrentUser: true,
        remoteSharedViaLink: false,
      };
      // Best-effort local cache sync — server upload is the source of truth.
      // Swallow local write failures; the file is already on the server.
      try {
        await Promise.all(
          chain.map((s) => {
            actions.updateStirlingFileStub(s.id, metadata);
            return fileStorage.updateFileMetadata(s.id, metadata);
          }),
        );
      } catch (cacheError) {
        console.error(
          "Saved to server, but failed to sync local file metadata:",
          cacheError,
        );
      }
      setConfirmOpen(false);
      openShare({ ...stub, ...metadata });
    } catch (error) {
      console.error("Failed to save file to server for sharing:", error);
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      alert({
        alertType: "error",
        title: t("storageShare.saveFailedTitle", "Couldn't save to server"),
        body:
          status === 403
            ? t(
                "storageUpload.featureDisabled",
                "Saving to the server isn't enabled on this server.",
              )
            : t(
                "storageShare.saveFailed",
                "Failed to save the file to the server. Please try again.",
              ),
        expandable: false,
        durationMs: 3000,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Tooltip
        content={tooltipContent}
        position="bottom"
        offset={6}
        arrow
        portalTarget={document.body}
      >
        <div className="workbench-bar-tooltip-wrapper">
          <ActionIcon
            variant="subtle"
            radius="md"
            className="workbench-bar-action-icon"
            onClick={handleClick}
            disabled={isDisabled}
            aria-label={label}
          >
            <ShareIcon sx={{ fontSize: "1rem" }} />
          </ActionIcon>
        </div>
      </Tooltip>

      <Modal
        opened={confirmOpen}
        onClose={() => {
          if (!saving) setConfirmOpen(false);
        }}
        centered
        size="auto"
        radius="lg"
        title={t("storageShare.saveFirstTitle", "Share file")}
        zIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
        overlayProps={{ blur: 4 }}
      >
        <Stack>
          <Stack ta="center" p="md" gap="xs">
            <Text size="lg" fw={500}>
              {t(
                "storageShare.saveFirstHeading",
                "Save this file to the server to share it",
              )}
            </Text>
            <Text size="sm" c="dimmed">
              {t(
                "storageShare.saveFirstBody",
                "Sharing works on files saved to the server. We'll save it to your files, then continue to sharing.",
              )}
            </Text>
          </Stack>
          <Group justify="center" gap="sm">
            <Button
              variant="light"
              color="var(--mantine-color-gray-8)"
              w={BUTTON_WIDTH}
              onClick={() => setConfirmOpen(false)}
              disabled={saving}
            >
              {t("cancel", "Cancel")}
            </Button>
            <Button
              variant="filled"
              w={BUTTON_WIDTH}
              leftSection={<CloudUploadIcon fontSize="small" />}
              onClick={handleSaveAndShare}
              loading={saving}
            >
              {t("storageShare.saveAndShare", "Save to server & share")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {shareStub && (
        <ShareManagementModal
          opened={shareOpen}
          onClose={() => setShareOpen(false)}
          file={shareStub}
        />
      )}
    </>
  );
}
