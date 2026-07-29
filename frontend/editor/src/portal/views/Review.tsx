import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import {
  Banner,
  Button,
  Chip,
  EmptyState,
  Select,
  Skeleton,
  StatusBadge,
  type StatusTone,
  Table,
  type TableColumn,
  Tabs,
} from "@app/ui";
import { errorMessage } from "@portal/api/http";
import {
  approveReviewItem,
  approveReviewItems,
  rejectReviewItem,
  rejectReviewItems,
  type ReviewItem,
  type ReviewReason,
  type ReviewReasonKind,
} from "@portal/api/review";
import { useReviewItems } from "@portal/queries/review";
import { useSectionFlags } from "@portal/hooks/useAsync";
import { qk } from "@portal/queries/keys";
import { ReviewIcon } from "@portal/components/icons";
import { ReviewBucketConfigForm } from "@portal/components/review/ReviewBucketConfigForm";
import { ReviewItemModal } from "@portal/components/review/ReviewItemModal";
import {
  BulkReviewConfirmModal,
  type BulkDecision,
} from "@portal/components/review/BulkReviewConfirmModal";
import {
  labelName as formatLabelName,
  reasonKindLabel,
  reasonText as formatReasonText,
} from "@portal/components/review/reviewFormat";
import "@portal/views/Review.css";

type ReviewTab = "pending" | "resolved" | "settings";

const STATUS_TONE: Record<ReviewItem["status"], StatusTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

const ALL = "__all__";

/**
 * The review queue: files the review bucket held instead of delivering, for a
 * person to inspect and approve (release to the original destination) or
 * reject (discard). Settings live in their own tab so a long queue never has
 * to be scrolled past to reach them.
 */
export function Review() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const state = useReviewItems();
  const { isLoading } = useSectionFlags(state);

  const [tab, setTab] = useState<ReviewTab>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Reject is destructive (the held file is discarded), so it takes two
  // clicks: the first arms this id, the second fires.
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Which item/file is open in the preview modal.
  const [preview, setPreview] = useState<{
    item: ReviewItem;
    fileId: string;
  } | null>(null);
  // Which bulk decision is awaiting confirmation, and whether it's running.
  const [bulk, setBulk] = useState<BulkDecision | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reasonFilter, setReasonFilter] = useState<string>(ALL);
  const [labelFilter, setLabelFilter] = useState<string>(ALL);
  const [policyFilter, setPolicyFilter] = useState<string>(ALL);
  const [newestFirst, setNewestFirst] = useState(true);

  const items = useMemo(() => state.data?.items ?? [], [state.data]);
  const pending = useMemo(
    () => items.filter((item) => item.status === "PENDING"),
    [items],
  );
  const resolved = useMemo(
    () => items.filter((item) => item.status !== "PENDING"),
    [items],
  );

  const labelName = (id: string | null) => formatLabelName(t, id);

  const reasonLabel = (kind: ReviewReasonKind) => reasonKindLabel(t, kind);

  const reasonText = (reason: ReviewReason) => formatReasonText(t, reason);

  // Filter options are derived from what's actually in the queue, so no option
  // ever yields an empty result.
  const source = tab === "resolved" ? resolved : pending;

  const reasonOptions = useMemo(() => {
    const kinds = new Set<ReviewReasonKind>();
    for (const item of source) for (const r of item.reasons) kinds.add(r.kind);
    return [...kinds];
  }, [source]);

  const labelOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const item of source) for (const l of item.labels) ids.add(l.labelId);
    return [...ids].sort((a, b) => labelName(a).localeCompare(labelName(b)));
  }, [source]);

  const policyOptions = useMemo(() => {
    const names = new Set<string>();
    for (const item of source) names.add(item.policyName || item.policyId);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [source]);

  const rows = useMemo(() => {
    const filtered = source.filter((item) => {
      if (
        reasonFilter !== ALL &&
        !item.reasons.some((r) => r.kind === reasonFilter)
      ) {
        return false;
      }
      if (
        labelFilter !== ALL &&
        !item.labels.some((l) => l.labelId === labelFilter)
      ) {
        return false;
      }
      if (
        policyFilter !== ALL &&
        (item.policyName || item.policyId) !== policyFilter
      ) {
        return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) =>
      newestFirst ? b.createdAt - a.createdAt : a.createdAt - b.createdAt,
    );
  }, [source, reasonFilter, labelFilter, policyFilter, newestFirst]);

  const filtersActive =
    reasonFilter !== ALL || labelFilter !== ALL || policyFilter !== ALL;

  function clearFilters() {
    setReasonFilter(ALL);
    setLabelFilter(ALL);
    setPolicyFilter(ALL);
  }

  async function resolve(item: ReviewItem, action: "approve" | "reject") {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      await (action === "approve"
        ? approveReviewItem(item.id)
        : rejectReviewItem(item.id));
      await queryClient.invalidateQueries({ queryKey: qk.reviewItems() });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
      setConfirmRejectId(null);
      setPreview(null);
    }
  }

  /**
   * Bulk decisions act on the rows the reviewer can actually see, not on
   * everything pending: with a filter applied, "all" has to mean the filtered
   * list, and anything held after the page loaded is not something they've
   * looked at.
   */
  async function resolveVisible(decision: BulkDecision) {
    const ids = rows.map((item) => item.id);
    if (ids.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      const result = await (decision === "approve"
        ? approveReviewItems(ids)
        : rejectReviewItems(ids));
      if (result.failures.length > 0) {
        setError(
          t("portal.review.bulk.partial", {
            count: result.failures.length,
            succeeded: result.succeeded,
            defaultValue:
              "{{succeeded}} resolved, {{count}} could not be. They may already have been decided elsewhere.",
          }),
        );
      }
      await queryClient.invalidateQueries({ queryKey: qk.reviewItems() });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBulkBusy(false);
      setBulk(null);
    }
  }

  const heldColumn: TableColumn<ReviewItem> = {
    key: "created",
    header: (
      <Button
        variant="quiet"
        size="sm"
        className="portal-review__sort"
        onClick={() => setNewestFirst((v) => !v)}
        aria-label={t("portal.review.table.sortByDate", "Sort by date held")}
        rightSection={
          <ArrowDownwardRoundedIcon
            className={
              "portal-review__sort-icon" +
              (newestFirst ? "" : " portal-review__sort-icon--asc")
            }
          />
        }
      >
        {t("portal.review.table.held", "Held")}
      </Button>
    ),
    render: (item) => (
      <span className="portal-review__muted">
        {new Date(item.createdAt).toLocaleString()}
      </span>
    ),
  };

  // Not memoized: the cells close over busyId/confirmRejectId, which change on
  // every interaction anyway.
  const pendingColumns: TableColumn<ReviewItem>[] = [
    {
      key: "file",
      header: t("portal.review.table.file", "File"),
      render: (item) => (
        <div className="portal-review__file-cell">
          {item.files.length === 0 ? (
            <span className="portal-review__muted">
              {t("portal.review.table.noFiles", "No files kept")}
            </span>
          ) : (
            <>
              {item.files.map((file) => (
                <Button
                  key={file.fileId}
                  variant="quiet"
                  size="sm"
                  className="portal-review__file-btn"
                  rightSection={
                    <OpenInNewRoundedIcon style={{ fontSize: "0.875rem" }} />
                  }
                  onClick={() => setPreview({ item, fileId: file.fileId })}
                >
                  {file.fileName}
                </Button>
              ))}
              {item.filesAreInputs && (
                <span className="portal-review__muted">
                  {t(
                    "portal.review.table.inputCopy",
                    "Original input (never processed)",
                  )}
                </span>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      key: "reasons",
      header: t("portal.review.table.reason", "Reason"),
      render: (item) => (
        <div className="portal-review__chips">
          {item.reasons.map((reason, index) => (
            <Chip
              key={`${reason.kind}-${reason.labelId ?? index}`}
              size="sm"
              accent={reason.kind === "RUN_FAILED" ? "danger" : "warning"}
              title={reason.detail ?? undefined}
            >
              {reasonText(reason)}
            </Chip>
          ))}
        </div>
      ),
    },
    {
      key: "labels",
      header: t("portal.review.table.labels", "Labels"),
      render: (item) =>
        item.labels.length === 0 ? (
          <span className="portal-review__muted">—</span>
        ) : (
          <div className="portal-review__chips">
            {item.labels.map((label) => (
              <Chip key={label.labelId} size="sm" accent="neutral">
                {labelName(label.labelId)}{" "}
                {`${Math.round(label.confidence * 100)}%`}
              </Chip>
            ))}
          </div>
        ),
    },
    {
      key: "policy",
      header: t("portal.review.table.policy", "Policy"),
      render: (item) => item.policyName || item.policyId,
    },
    heldColumn,
    {
      key: "actions",
      header: "",
      align: "right",
      render: (item) => (
        <div className="portal-review__actions">
          <Button
            size="sm"
            loading={busyId === item.id}
            disabled={busyId !== null && busyId !== item.id}
            title={
              item.filesAreInputs
                ? t("portal.review.actions.retryHint", {
                    destination: item.destinations.join(", "),
                    defaultValue:
                      "Ignores the error and sends the file through the pipeline again (to {{destination}}). The copy kept for review is deleted.",
                  })
                : t("portal.review.actions.approveHint", {
                    destination: item.destinations.join(", "),
                    defaultValue: "Releases the file to {{destination}}.",
                  })
            }
            onClick={() => void resolve(item, "approve")}
          >
            {t("portal.review.actions.approve", "Approve")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            accent="danger"
            disabled={busyId !== null}
            onClick={() =>
              confirmRejectId === item.id
                ? void resolve(item, "reject")
                : setConfirmRejectId(item.id)
            }
            onBlur={() => setConfirmRejectId(null)}
          >
            {confirmRejectId === item.id
              ? t("portal.review.actions.confirmReject", "Confirm reject")
              : t("portal.review.actions.reject", "Reject")}
          </Button>
        </div>
      ),
    },
  ];

  const resolvedColumns: TableColumn<ReviewItem>[] = [
    {
      key: "file",
      header: t("portal.review.table.file", "File"),
      render: (item) =>
        item.files.length === 0 ? (
          <span className="portal-review__muted">
            {t("portal.review.table.noFiles", "No files (failed run)")}
          </span>
        ) : (
          item.files.map((file) => (
            <Button
              key={file.fileId}
              variant="quiet"
              size="sm"
              className="portal-review__file-btn"
              onClick={() => setPreview({ item, fileId: file.fileId })}
            >
              {file.fileName}
            </Button>
          ))
        ),
    },
    {
      key: "status",
      header: t("portal.review.table.decision", "Decision"),
      render: (item) => (
        <StatusBadge tone={STATUS_TONE[item.status]} size="sm">
          {item.status === "APPROVED"
            ? t("portal.review.status.approved", "Approved")
            : t("portal.review.status.rejected", "Rejected")}
        </StatusBadge>
      ),
    },
    {
      key: "reasons",
      header: t("portal.review.table.reason", "Reason"),
      render: (item) => (
        <div className="portal-review__chips">
          {item.reasons.map((reason, index) => (
            <Chip
              key={`${reason.kind}-${reason.labelId ?? index}`}
              size="sm"
              accent="neutral"
              title={reason.detail ?? undefined}
            >
              {reasonText(reason)}
            </Chip>
          ))}
        </div>
      ),
    },
    {
      key: "policy",
      header: t("portal.review.table.policy", "Policy"),
      render: (item) => item.policyName || item.policyId,
    },
    {
      key: "resolvedBy",
      header: t("portal.review.table.resolvedBy", "Reviewed by"),
      render: (item) => item.resolvedBy ?? "—",
    },
    heldColumn,
  ];

  const columns = tab === "resolved" ? resolvedColumns : pendingColumns;

  return (
    <div className="portal-review">
      <header className="portal-review__head">
        <div>
          <h1 className="portal-review__title">
            {t("portal.review.title", "Review")}
          </h1>
          <p className="portal-review__sub">
            {t(
              "portal.review.subtitle",
              "Files held before delivery because they hit one of your review conditions.",
            )}
          </p>
        </div>
      </header>

      {error && <Banner tone="danger" description={error} />}

      <Tabs<ReviewTab>
        items={[
          {
            key: "pending",
            label: t("portal.review.tabs.pending", "Awaiting review"),
            count: pending.length,
          },
          {
            key: "resolved",
            label: t("portal.review.tabs.resolved", "Resolved"),
            count: resolved.length,
          },
          {
            key: "settings",
            label: t("portal.review.tabs.settings", "Settings"),
          },
        ]}
        activeKey={tab}
        onChange={setTab}
        variant="underline"
        ariaLabel={t("portal.review.tabs.aria", "Review queue")}
      />

      {tab === "settings" ? (
        <section className="portal-review__settings">
          <ReviewBucketConfigForm />
        </section>
      ) : (
        <>
          {!isLoading && source.length > 0 && (
            <div className="portal-review__filters">
              <Select
                inputSize="sm"
                aria-label={t("portal.review.filters.reason", "Reason")}
                value={reasonFilter}
                onChange={(v) => setReasonFilter(v ?? ALL)}
                options={[
                  {
                    value: ALL,
                    label: t("portal.review.filters.allReasons", "All reasons"),
                  },
                  ...reasonOptions.map((kind) => ({
                    value: kind,
                    label: reasonLabel(kind),
                  })),
                ]}
              />
              {labelOptions.length > 0 && (
                <Select
                  inputSize="sm"
                  aria-label={t("portal.review.filters.label", "Label")}
                  value={labelFilter}
                  onChange={(v) => setLabelFilter(v ?? ALL)}
                  options={[
                    {
                      value: ALL,
                      label: t("portal.review.filters.allLabels", "All labels"),
                    },
                    ...labelOptions.map((id) => ({
                      value: id,
                      label: labelName(id),
                    })),
                  ]}
                />
              )}
              {policyOptions.length > 1 && (
                <Select
                  inputSize="sm"
                  aria-label={t("portal.review.filters.policy", "Policy")}
                  value={policyFilter}
                  onChange={(v) => setPolicyFilter(v ?? ALL)}
                  options={[
                    {
                      value: ALL,
                      label: t(
                        "portal.review.filters.allPolicies",
                        "All policies",
                      ),
                    },
                    ...policyOptions.map((name) => ({
                      value: name,
                      label: name,
                    })),
                  ]}
                />
              )}
              <span className="portal-review__count">
                {t("portal.review.filters.showing", {
                  shown: rows.length,
                  total: source.length,
                  defaultValue: "{{shown}} of {{total}}",
                })}
              </span>
              {filtersActive && (
                <Button variant="tertiary" size="sm" onClick={clearFilters}>
                  {t("portal.review.filters.clear", "Clear filters")}
                </Button>
              )}
              {tab === "pending" && rows.length > 0 && (
                <div className="portal-review__bulk">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyId !== null || bulkBusy}
                    onClick={() => setBulk("approve")}
                  >
                    {t("portal.review.bulk.approveAll", "Approve all")}
                  </Button>
                  <Button
                    variant="secondary"
                    accent="danger"
                    size="sm"
                    disabled={busyId !== null || bulkBusy}
                    onClick={() => setBulk("reject")}
                  >
                    {t("portal.review.bulk.rejectAll", "Reject and delete all")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {isLoading && (
            <div className="portal-review__table-skeleton" aria-hidden>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} height="3rem" />
              ))}
            </div>
          )}

          {!isLoading && rows.length === 0 && (
            <EmptyState
              icon={<ReviewIcon size={28} />}
              title={
                filtersActive
                  ? t("portal.review.empty.filtered.title", "No matches")
                  : tab === "pending"
                    ? t(
                        "portal.review.empty.pending.title",
                        "Nothing to review",
                      )
                    : t(
                        "portal.review.empty.resolved.title",
                        "No decisions yet",
                      )
              }
              description={
                filtersActive
                  ? t(
                      "portal.review.empty.filtered.description",
                      "No held files match these filters.",
                    )
                  : tab === "pending"
                    ? t(
                        "portal.review.empty.pending.description",
                        "Files that hit a review condition will wait here before delivery.",
                      )
                    : t(
                        "portal.review.empty.resolved.description",
                        "Approved and rejected files will be listed here.",
                      )
              }
              actions={
                filtersActive ? (
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    {t("portal.review.filters.clear", "Clear filters")}
                  </Button>
                ) : undefined
              }
            />
          )}

          {!isLoading && rows.length > 0 && (
            <Table<ReviewItem>
              className="portal-review__table"
              columns={columns}
              rows={rows}
              rowKey={(item) => item.id}
            />
          )}
        </>
      )}

      {bulk && (
        <BulkReviewConfirmModal
          decision={bulk}
          count={rows.length}
          destinations={[...new Set(rows.flatMap((item) => item.destinations))]}
          busy={bulkBusy}
          onCancel={() => setBulk(null)}
          onConfirm={() => void resolveVisible(bulk)}
        />
      )}

      {preview && (
        <ReviewItemModal
          item={preview.item}
          initialFileId={preview.fileId}
          busy={busyId === preview.item.id}
          onClose={() => setPreview(null)}
          onApprove={(target) => void resolve(target, "approve")}
          onReject={(target) => void resolve(target, "reject")}
        />
      )}
    </div>
  );
}
