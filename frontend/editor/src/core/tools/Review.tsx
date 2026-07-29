import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Divider, Group, Stack, Text } from "@mantine/core";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Banner } from "@app/ui/Banner";
import { EmptyState } from "@app/ui/EmptyState";
import { BaseToolProps } from "@app/types/tool";
import {
  useAllFiles,
  useFileManagement,
  useFileActions,
} from "@app/contexts/FileContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useNavigation } from "@app/contexts/NavigationContext";
import { fileStorage } from "@app/services/fileStorage";
import { FileId } from "@app/types/file";
import { ReviewTrail } from "@app/tools/review/ReviewTrail";
import {
  useFileIdsNeedingReview,
  usePolicyTrailRuns,
  useReviewApproval,
} from "@app/tools/review/reviewTrailSources";
import "@app/tools/review/Review.css";

/**
 * Document review area (V1 — policies only). Walks a frozen queue of flagged
 * files one at a time, driving the viewer; each is ignored or deleted.
 */
const Review = (_props: BaseToolProps) => {
  const { t } = useTranslation();
  const { fileStubs } = useAllFiles();
  const { removeFiles } = useFileManagement();
  const { actions: fileActions } = useFileActions();
  const { activeFileId, setActiveFileId } = useViewer();
  const { workbench, setWorkbench } = useNavigation();
  const needsReviewIds = useFileIdsNeedingReview();

  // Files signed off in this session — drives the "approved" confirmation.
  const [approvedIds, setApprovedIds] = useState<Set<FileId>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [cursor, setCursor] = useState(0);
  // Queue entries whose file couldn't be loaded (deleted since it was flagged).
  const [unresolvableIds, setUnresolvableIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Frozen on first render with anything to review: a ref, not state, so
  // approving/deleting/paging can never reorder what the reviewer is walking.
  const queueRef = useRef<FileId[] | null>(null);
  if (
    queueRef.current === null &&
    (fileStubs.length > 0 || needsReviewIds.length > 0)
  ) {
    const activeId = activeFileId as FileId | null;
    if (activeId) {
      queueRef.current = [
        activeId,
        ...needsReviewIds.filter((id) => id !== activeId),
      ];
    } else if (needsReviewIds.length > 0) {
      // Ordered oldest-flagged first; these may be stored files that aren't
      // loaded, which the effect below opens on demand.
      queueRef.current = [...needsReviewIds];
    } else {
      // Nothing flagged — show something anyway (e.g. opened directly at /review).
      queueRef.current = [fileStubs[0].id];
    }
  }
  const queue = queueRef.current ?? [];

  const currentId = queue[cursor] ?? null;
  const stub = currentId
    ? fileStubs.find((s) => s.id === currentId)
    : undefined;
  const trail = usePolicyTrailRuns(stub);
  const { needsReview, markApproved, undoApproved } = useReviewApproval(stub);
  const approved = stub ? approvedIds.has(stub.id) : false;

  // Show the queue's current file, opening it from storage when unloaded.
  // Activating only when `stub` exists matters: a deleted file's id lingers in
  // the frozen queue, and the viewer drops it — re-setting it loops forever.
  useEffect(() => {
    if (!currentId) return;
    if (stub) {
      if (currentId !== activeFileId) setActiveFileId(currentId);
      return;
    }
    if (unresolvableIds.has(currentId)) return;
    let cancelled = false;
    void (async () => {
      // Re-add by stub to keep the file's id, so its policy runs still resolve.
      const loaded = await fileStorage
        .getStirlingFileStub(currentId as FileId)
        .catch(() => null);
      if (cancelled) return;
      if (loaded) {
        await fileActions.addStirlingFileStubs([loaded]);
      } else {
        setUnresolvableIds((prev) => new Set(prev).add(currentId));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    stub,
    currentId,
    activeFileId,
    setActiveFileId,
    fileActions,
    unresolvableIds,
  ]);
  useEffect(() => {
    if (workbench !== "viewer") setWorkbench("viewer");
  }, [workbench, setWorkbench]);
  useEffect(() => setConfirmingDelete(false), [currentId]);

  // A queued file with no stub is either still opening from storage, or gone.
  const unavailable =
    !stub && currentId != null && unresolvableIds.has(currentId);

  const atStart = cursor <= 0;
  const atEnd = cursor >= queue.length - 1;
  const goPrev = useCallback(() => setCursor((c) => Math.max(0, c - 1)), []);
  const goNext = useCallback(
    () => setCursor((c) => Math.min(queue.length - 1, c + 1)),
    [queue.length],
  );

  const setApproved = useCallback((fileId: FileId, value: boolean) => {
    setApprovedIds((prev) => {
      const next = new Set(prev);
      if (value) next.add(fileId);
      else next.delete(fileId);
      return next;
    });
  }, []);

  const handleApprove = useCallback(() => {
    if (!stub) return;
    markApproved();
    setApproved(stub.id, true);
  }, [stub, markApproved, setApproved]);

  const handleUndoApprove = useCallback(() => {
    if (!stub) return;
    undoApproved();
    setApproved(stub.id, false);
  }, [stub, undoApproved, setApproved]);

  const handleDelete = useCallback(() => {
    if (!stub) return;
    setConfirmingDelete(false);
    void removeFiles([stub.id]);
    // Tombstone the frozen slot up front, so it never tries to reload the file
    // we just deleted, then step off it: forward if possible, otherwise back.
    setUnresolvableIds((prev) => new Set(prev).add(stub.id as string));
    if (!atEnd) goNext();
    else if (!atStart) goPrev();
  }, [stub, removeFiles, atEnd, atStart, goNext, goPrev]);

  // An empty workbench is fine — queued files open from storage on demand.
  // Once every entry is gone (all deleted), the queue is done rather than empty.
  const queueDone =
    queue.length > 0 && queue.every((id) => unresolvableIds.has(id));
  if (queue.length === 0 || queueDone) {
    return (
      <Stack p="sm">
        <EmptyState
          icon={<FactCheckOutlinedIcon fontSize="large" />}
          title={
            queueDone
              ? t("reviewTool.done.title", "Nothing left to review")
              : t("reviewTool.empty.title", "No document to review")
          }
          description={
            queueDone
              ? t("reviewTool.done.desc", "Every flagged document is resolved.")
              : t(
                  "reviewTool.empty.desc",
                  "Open a file that a policy has run on to review it.",
                )
          }
        />
      </Stack>
    );
  }

  const queueNav = queue.length > 1 && (
    <div className="review-pager">
      <ActionIcon
        variant="tertiary"
        size="sm"
        shape="circle"
        onClick={goPrev}
        disabled={atStart}
        aria-label={t("reviewTool.queue.previous", "Previous file")}
      >
        <ChevronLeftRoundedIcon fontSize="small" />
      </ActionIcon>
      <span className="review-pager__label">
        {t("reviewTool.queue.position", "File {{current}} of {{total}}", {
          current: cursor + 1,
          total: queue.length,
        })}
      </span>
      <ActionIcon
        variant="tertiary"
        size="sm"
        shape="circle"
        onClick={goNext}
        disabled={atEnd}
        aria-label={t("reviewTool.queue.next", "Next file")}
      >
        <ChevronRightRoundedIcon fontSize="small" />
      </ActionIcon>
    </div>
  );

  return (
    <Stack gap="md" p="sm">
      {queueNav}

      <Stack gap={4}>
        <span
          className="review-panel__title"
          title={stub?.name ?? ""}
          data-testid="review-filename"
        >
          {stub?.name ??
            (unavailable
              ? t("reviewTool.queue.unavailable", "File no longer available")
              : t("reviewTool.queue.opening", "Opening file..."))}
        </span>
        <span className="review-panel__subtitle">
          {t(
            "reviewTool.subtitle",
            "Check everything that ran on this document, then approve or delete it.",
          )}
        </span>
      </Stack>

      {!stub ? (
        unavailable ? (
          <Banner
            tone="neutral"
            title={t(
              "reviewTool.queue.unavailable",
              "File no longer available",
            )}
            description={t(
              "reviewTool.queue.unavailableDesc",
              "This file was removed. Use Next to continue reviewing.",
            )}
          />
        ) : null
      ) : (
        <>
          <Stack gap="xs">
            <span className="review-panel__section-label">
              {t("reviewTool.trail.title", "Processing history")}
            </span>
            {trail.length > 0 ? (
              <ReviewTrail trail={trail} />
            ) : (
              <Text size="sm" c="dimmed">
                {t(
                  "reviewTool.trail.empty",
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
                "reviewTool.verdict.approved",
                "Ignored & marked approved",
              )}
              action={
                <Button variant="tertiary" onClick={handleUndoApprove}>
                  {t("reviewTool.verdict.undo", "Undo")}
                </Button>
              }
            />
          ) : !needsReview ? (
            // Nothing outstanding, so offering a sign-off would be a no-op that
            // still reported success.
            <Text size="sm" c="dimmed">
              {t(
                "reviewTool.noIssues",
                "No outstanding issues on this document.",
              )}
            </Text>
          ) : confirmingDelete ? (
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                {t("reviewTool.delete.confirmTitle", "Delete this file?")}
              </Text>
              <Text size="xs" c="dimmed">
                {t(
                  "reviewTool.delete.confirmBody",
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
                  leftSection={<DeleteOutlineRoundedIcon fontSize="small" />}
                  onClick={handleDelete}
                  data-testid="review-confirm-delete"
                >
                  {t("reviewTool.delete.confirm", "Delete file")}
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
                {t("reviewTool.approve", "Ignore")}
              </Button>
              <Button
                variant="secondary"
                accent="danger"
                leftSection={<DeleteOutlineRoundedIcon fontSize="small" />}
                onClick={() => setConfirmingDelete(true)}
                data-testid="review-decline"
              >
                {t("reviewTool.decline", "Delete")}
              </Button>
            </Group>
          )}
        </>
      )}
    </Stack>
  );
};

export default Review;
