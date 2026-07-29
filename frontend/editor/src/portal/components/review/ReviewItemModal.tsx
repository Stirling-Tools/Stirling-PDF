import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { Banner, Button, Chip, Modal, Skeleton } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import { fetchReviewFile, type ReviewItem } from "@portal/api/review";
import { fetchPolicy } from "@portal/api/policies";
import {
  labelName,
  reasonText,
  stepDisplayName,
} from "@portal/components/review/reviewFormat";
import {
  closeRawDocument,
  getPdfiumModule,
  openRawDocumentSafe,
} from "@app/services/pdfiumService";
import { renderPdfiumPageDataUrl } from "@app/utils/pdfiumPageRender";
import "@portal/components/review/ReviewItemModal.css";

interface ReviewItemModalProps {
  item: ReviewItem;
  /** Which of the item's files to preview first. */
  initialFileId: string;
  busy: boolean;
  onClose: () => void;
  onApprove: (item: ReviewItem) => void;
  onReject: (item: ReviewItem) => void;
}

/** A rendered page, kept as a data URL so nothing native stays live. */
interface PageImage {
  url: string;
}

/**
 * Full review of one held item: page-by-page preview of the document on the
 * left, and on the right the same story the editor's review panel tells —
 * which pipeline ran, why the file was held, its labels — plus the decision
 * actions. Pages render with the app's PDFium engine rather than opening a
 * new tab, so the reviewer never leaves the queue.
 */
export function ReviewItemModal({
  item,
  initialFileId,
  busy,
  onClose,
  onApprove,
  onReject,
}: ReviewItemModalProps) {
  const { t } = useTranslation();

  const [fileId, setFileId] = useState(initialFileId);
  const [pages, setPages] = useState<PageImage[] | null>(null);
  const [page, setPage] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [steps, setSteps] = useState<string[] | null>(null);
  // Generation counter so a slow render for a previous file can't clobber the
  // current one after switching files.
  const renderGen = useRef(0);

  const file = item.files.find((f) => f.fileId === fileId) ?? item.files[0];

  const renderFile = useCallback(
    async (targetFileId: string) => {
      const gen = ++renderGen.current;
      setPages(null);
      setPage(0);
      setPreviewError(null);
      try {
        const blob = await fetchReviewFile(item.id, targetFileId);
        // Rendered with the app's own PDFium engine (same as thumbnails), so
        // the preview matches what the rest of Stirling shows.
        const m = await getPdfiumModule();
        const docPtr = await openRawDocumentSafe(await blob.arrayBuffer());
        try {
          const pageCount = m.FPDF_GetPageCount(docPtr);
          const rendered: PageImage[] = [];
          for (let i = 0; i < pageCount; i++) {
            const url = await renderPdfiumPageDataUrl(docPtr, i, 1.5);
            if (!url) throw new Error(`Failed to render page ${i + 1}`);
            rendered.push({ url });
            if (gen !== renderGen.current) return; // superseded mid-render
          }
          if (gen === renderGen.current) setPages(rendered);
        } finally {
          void closeRawDocument(docPtr);
        }
      } catch (e) {
        if (gen === renderGen.current) setPreviewError(errorMessage(e));
      }
    },
    [item.id],
  );

  useEffect(() => {
    if (file) void renderFile(file.fileId);
  }, [file, renderFile]);

  // The pipeline's steps — the "what ran" half of the story. Best effort: the
  // policy may have been deleted since the file was held.
  useEffect(() => {
    let cancelled = false;
    fetchPolicy(item.policyId)
      .then((policy) => {
        if (!cancelled) {
          setSteps(policy.steps.map((s) => stepDisplayName(s.operation)));
        }
      })
      .catch(() => {
        if (!cancelled) setSteps([]);
      });
    return () => {
      cancelled = true;
    };
  }, [item.policyId]);

  const total = pages?.length ?? 0;
  const current = pages?.[page];

  return (
    <Modal
      open
      onClose={onClose}
      width="xl"
      title={file?.fileName ?? item.policyName}
      className="review-modal"
    >
      <div className="review-modal__body">
        <div className="review-modal__preview">
          {item.files.length > 1 && (
            <div className="review-modal__files">
              {item.files.map((f) => (
                <Chip
                  key={f.fileId}
                  size="sm"
                  accent={f.fileId === file?.fileId ? "brand" : "neutral"}
                  variant={f.fileId === file?.fileId ? "primary" : "secondary"}
                  onClick={() => setFileId(f.fileId)}
                >
                  {f.fileName}
                </Chip>
              ))}
            </div>
          )}

          {previewError && <Banner tone="danger" description={previewError} />}

          {!previewError && !pages && (
            <div className="review-modal__loading" aria-hidden>
              <Skeleton height="24rem" />
            </div>
          )}

          {current && (
            <>
              <div className="review-modal__page-wrap">
                <img
                  className="review-modal__page"
                  src={current.url}
                  alt={t("portal.review.modal.pageAlt", {
                    page: page + 1,
                    total,
                    defaultValue: "Page {{page}} of {{total}}",
                  })}
                />
              </div>
              <div className="review-modal__pager">
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  aria-label={t(
                    "portal.review.modal.prevPage",
                    "Previous page",
                  )}
                  leftSection={<ChevronLeftRoundedIcon />}
                />
                <span className="review-modal__page-count">
                  {t("portal.review.modal.pageCount", {
                    page: page + 1,
                    total,
                    defaultValue: "{{page}} / {{total}}",
                  })}
                </span>
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={page >= total - 1}
                  onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
                  aria-label={t("portal.review.modal.nextPage", "Next page")}
                  leftSection={<ChevronRightRoundedIcon />}
                />
              </div>
            </>
          )}
        </div>

        <aside className="review-modal__rail">
          <section>
            <h4 className="review-modal__heading">
              {t("portal.review.modal.heldBecause", "Held because")}
            </h4>
            <ul className="review-modal__reasons">
              {item.reasons.map((reason, index) => (
                <li key={`${reason.kind}-${index}`}>
                  <Chip
                    size="sm"
                    accent={reason.kind === "RUN_FAILED" ? "danger" : "warning"}
                  >
                    {reasonText(t, reason)}
                  </Chip>
                  {reason.detail && (
                    <p className="review-modal__detail">{reason.detail}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {item.labels.length > 0 && (
            <section>
              <h4 className="review-modal__heading">
                {t("portal.review.modal.labels", "Labels")}
              </h4>
              <div className="review-modal__chips">
                {item.labels.map((label) => (
                  <Chip key={label.labelId} size="sm" accent="neutral">
                    {labelName(t, label.labelId)}{" "}
                    {`${Math.round(label.confidence * 100)}%`}
                  </Chip>
                ))}
              </div>
            </section>
          )}

          <section>
            <h4 className="review-modal__heading">
              {t("portal.review.modal.pipeline", "Pipeline")}
            </h4>
            <p className="review-modal__policy">{item.policyName}</p>
            {steps === null ? (
              <Skeleton height="1.25rem" />
            ) : steps.length > 0 ? (
              <ol className="review-modal__steps">
                {steps.map((step, index) => (
                  <li key={`${step}-${index}`}>{step}</li>
                ))}
              </ol>
            ) : (
              <p className="review-modal__detail">
                {t(
                  "portal.review.modal.stepsUnavailable",
                  "Pipeline steps unavailable (policy may have been deleted).",
                )}
              </p>
            )}
            <p className="review-modal__meta">
              {t("portal.review.modal.destination", {
                destination: item.destination,
                defaultValue: "Destination: {{destination}}",
              })}
            </p>
            <p className="review-modal__meta">
              {t("portal.review.modal.held", {
                when: new Date(item.createdAt).toLocaleString(),
                defaultValue: "Held {{when}}",
              })}
            </p>
            {item.filesAreInputs && (
              <p className="review-modal__meta">
                {t(
                  "portal.review.table.inputCopy",
                  "Original input (never processed)",
                )}
              </p>
            )}
          </section>

          <div className="review-modal__actions">
            {item.status === "PENDING" && (
              <>
                <Button
                  fullWidth
                  loading={busy}
                  title={
                    item.filesAreInputs
                      ? t("portal.review.actions.retryHint", {
                          destination: item.destination,
                          defaultValue:
                            "Ignores the error and sends the file through the pipeline again (to {{destination}}). The copy kept for review is deleted.",
                        })
                      : t("portal.review.actions.approveHint", {
                          destination: item.destination,
                          defaultValue: "Releases the file to {{destination}}.",
                        })
                  }
                  onClick={() => onApprove(item)}
                >
                  {t("portal.review.actions.approve", "Approve")}
                </Button>
                <Button
                  fullWidth
                  variant="secondary"
                  accent="danger"
                  disabled={busy}
                  onClick={() => {
                    if (confirmReject) onReject(item);
                    else setConfirmReject(true);
                  }}
                  onBlur={() => setConfirmReject(false)}
                >
                  {confirmReject
                    ? t("portal.review.actions.confirmReject", "Confirm reject")
                    : t("portal.review.actions.reject", "Reject")}
                </Button>
              </>
            )}
          </div>
        </aside>
      </div>
    </Modal>
  );
}
