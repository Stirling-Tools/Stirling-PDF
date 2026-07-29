import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Divider, Group, ScrollArea, Stack, Text } from "@mantine/core";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { Banner } from "@app/ui/Banner";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { useViewer } from "@app/contexts/ViewerContext";
import { useAllFiles, useFileManagement } from "@app/contexts/FileContext";
import type { FileId } from "@app/types/file";
import { ReviewTrail } from "@app/components/viewer/review/ReviewTrail";
import {
  useForgetFileReview,
  usePolicyTrailRuns,
  useReviewApproval,
} from "@app/components/viewer/review/reviewTrailSources";
import "@app/components/viewer/SidebarBase.css";

const SIDEBAR_WIDTH = "18rem";

interface ReviewSidebarProps {
  visible: boolean;
  /** Distance from the viewport's right edge, so it stacks with other panels. */
  rightOffset: string;
}

/**
 * Review panel for the open document: what ran on it, and — when a run failed —
 * the two decisions a reviewer can take (ignore the failure, or delete the
 * file). A viewer panel like bookmarks or comments, so opening, closing and
 * switching documents behave the way they do everywhere else in the viewer.
 *
 * It opens itself on each fresh open of a document with an unresolved failure,
 * because that is the case a reviewer must not miss. Closing it is respected
 * until the next time the document is opened.
 */
export function ReviewSidebar({ visible, rightOffset }: ReviewSidebarProps) {
  const { t } = useTranslation();
  const { activeFileId, setReviewSidebarVisible } = useViewer();
  const { fileStubs } = useAllFiles();
  const { removeFiles } = useFileManagement();
  const forgetFileReview = useForgetFileReview();

  const stub = activeFileId
    ? fileStubs.find((s) => s.id === activeFileId)
    : undefined;
  const trail = usePolicyTrailRuns(stub);
  const { needsReview, markApproved, undoApproved } = useReviewApproval(stub);

  const [approved, setApproved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Reset the per-document decision UI whenever the open document changes.
  useEffect(() => {
    setApproved(false);
    setConfirmingDelete(false);
  }, [activeFileId]);

  // Auto-open on a fresh open of a flagged document. `openedFor` remembers the
  // document we have already opened for, so closing the panel sticks until the
  // reviewer opens that document again.
  const openedForRef = useRef<string | null>(null);
  const lastFileRef = useRef<string | null>(activeFileId);
  useEffect(() => {
    if (lastFileRef.current !== activeFileId) {
      lastFileRef.current = activeFileId;
      openedForRef.current = null;
    }
    if (activeFileId && needsReview && openedForRef.current !== activeFileId) {
      openedForRef.current = activeFileId;
      setReviewSidebarVisible(true);
    }
  }, [activeFileId, needsReview, setReviewSidebarVisible]);

  if (!visible) return null;

  const handleApprove = () => {
    markApproved();
    setApproved(true);
  };

  const handleUndoApprove = () => {
    undoApproved();
    setApproved(false);
  };

  const handleDelete = async () => {
    if (!stub) return;
    setConfirmingDelete(false);
    const fileId = stub.id as FileId;
    // `true` is explicit: delete from storage as well as the workbench, so the
    // file leaves the file list too. Deleting from storage bumps the IndexedDB
    // revision, which is what makes the sidebar re-scan — awaiting it keeps the
    // review-state cleanup below after the file is actually gone.
    await removeFiles([fileId], true);
    // The file is gone from storage, so drop its review state too or it stays
    // flagged for a review it can never receive.
    forgetFileReview(fileId);
  };

  return (
    <Box
      className="sidebar-base"
      style={{
        position: "fixed",
        right: rightOffset,
        top: 0,
        bottom: 0,
        width: SIDEBAR_WIDTH,
        zIndex: 998,
      }}
    >
      <div className="sidebar-base__header">
        <div className="sidebar-base__header-title">
          <WarningAmberRoundedIcon
            fontSize="small"
            style={{
              color: needsReview ? "var(--c-warning)" : "var(--c-text-muted)",
              flexShrink: 0,
            }}
          />
          <Text fw={600} size="sm" tt="uppercase" lts={0.5}>
            {t("viewer.review.title", "Review")}
          </Text>
        </div>
        <ActionIcon
          variant="tertiary"
          size="sm"
          shape="circle"
          onClick={() => setReviewSidebarVisible(false)}
          aria-label={t("viewer.review.close", "Close review panel")}
        >
          <CloseRoundedIcon fontSize="small" />
        </ActionIcon>
      </div>

      <ScrollArea style={{ flex: 1 }}>
        <Stack gap="md" p="sm">
          {!stub ? (
            <Text size="sm" c="dimmed">
              {t("viewer.review.noDocument", "No document open.")}
            </Text>
          ) : (
            <>
              <Stack gap={4}>
                <Text fw={600} size="sm">
                  {stub.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {t(
                    "viewer.review.subtitle",
                    "Check everything that ran on this document, then approve or delete it.",
                  )}
                </Text>
              </Stack>

              <Stack gap="xs">
                <Text size="xs" fw={600} tt="uppercase" c="dimmed" lts={0.5}>
                  {t("viewer.review.history", "Processing history")}
                </Text>
                {trail.length > 0 ? (
                  <ReviewTrail trail={trail} />
                ) : (
                  <Text size="sm" c="dimmed">
                    {t(
                      "viewer.review.historyEmpty",
                      "No policy has run on this document yet — there is no processing history to review.",
                    )}
                  </Text>
                )}
              </Stack>

              <Divider />

              {approved ? (
                <Banner
                  tone="success"
                  icon={<CheckRoundedIcon fontSize="small" />}
                  title={t(
                    "viewer.review.approved",
                    "Ignored & marked approved",
                  )}
                  action={
                    <Button variant="tertiary" onClick={handleUndoApprove}>
                      {t("viewer.review.undo", "Undo")}
                    </Button>
                  }
                />
              ) : !needsReview ? (
                <Text size="sm" c="dimmed">
                  {t(
                    "viewer.review.noIssues",
                    "No outstanding issues on this document.",
                  )}
                </Text>
              ) : confirmingDelete ? (
                <Stack gap="xs">
                  <Text size="sm" fw={600}>
                    {t("viewer.review.deleteTitle", "Delete this file?")}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {t(
                      "viewer.review.deleteBody",
                      "This permanently removes the file from your workspace. This can't be undone.",
                    )}
                  </Text>
                  <Group grow>
                    <Button
                      variant="secondary"
                      accent="neutral"
                      onClick={() => setConfirmingDelete(false)}
                    >
                      {t("cancel", "Cancel")}
                    </Button>
                    <Button
                      variant="secondary"
                      accent="danger"
                      leftSection={
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      }
                      onClick={() => void handleDelete()}
                      data-testid="review-confirm-delete"
                    >
                      {t("viewer.review.deleteConfirm", "Delete file")}
                    </Button>
                  </Group>
                </Stack>
              ) : (
                <Group grow>
                  <Button
                    accent="warning"
                    leftSection={<CheckRoundedIcon fontSize="small" />}
                    onClick={handleApprove}
                    data-testid="review-approve"
                  >
                    {t("viewer.review.ignore", "Ignore")}
                  </Button>
                  <Button
                    variant="secondary"
                    accent="danger"
                    leftSection={<DeleteOutlineRoundedIcon fontSize="small" />}
                    onClick={() => setConfirmingDelete(true)}
                    data-testid="review-decline"
                  >
                    {t("viewer.review.delete", "Delete")}
                  </Button>
                </Group>
              )}
            </>
          )}
        </Stack>
      </ScrollArea>
    </Box>
  );
}
