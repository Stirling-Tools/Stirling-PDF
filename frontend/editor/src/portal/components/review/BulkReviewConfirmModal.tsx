import { useTranslation } from "react-i18next";
import { Banner, Button, Modal } from "@app/ui";
import "@portal/components/review/BulkReviewConfirmModal.css";

export type BulkDecision = "approve" | "reject";

interface BulkReviewConfirmModalProps {
  decision: BulkDecision;
  /** How many items the decision covers — the rows currently listed. */
  count: number;
  /** Distinct destinations those items would be sent to, for approve. */
  destinations: string[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation for a whole-queue decision. Both directions are consequential
 * and neither is reversible from the portal, so each spells out its own risk:
 * approving sends documents onward that a person was supposed to read first,
 * and rejecting destroys the only copy Stirling kept.
 */
export function BulkReviewConfirmModal({
  decision,
  count,
  destinations,
  busy,
  onCancel,
  onConfirm,
}: BulkReviewConfirmModalProps) {
  const { t } = useTranslation();
  const approving = decision === "approve";

  return (
    <Modal
      open
      onClose={onCancel}
      width="sm"
      title={
        approving
          ? t("portal.review.bulk.approve.title", {
              count,
              defaultValue: "Approve all {{count}} files?",
            })
          : t("portal.review.bulk.reject.title", {
              count,
              defaultValue: "Reject and delete all {{count}} files?",
            })
      }
      footer={
        <div className="review-bulk__footer">
          <Button variant="tertiary" disabled={busy} onClick={onCancel}>
            {t("portal.review.bulk.cancel", "Cancel")}
          </Button>
          <Button
            accent={approving ? undefined : "danger"}
            variant={approving ? "primary" : "secondary"}
            loading={busy}
            onClick={onConfirm}
          >
            {approving
              ? t("portal.review.bulk.approve.confirm", {
                  count,
                  defaultValue: "Approve {{count}} files",
                })
              : t("portal.review.bulk.reject.confirm", {
                  count,
                  defaultValue: "Delete {{count}} files",
                })}
          </Button>
        </div>
      }
    >
      <Banner
        tone={approving ? "warning" : "danger"}
        description={
          approving
            ? t(
                "portal.review.bulk.approve.warning",
                "These files were held so a person could read them. Approving them all sends every one to its destination without anyone checking it. Classification can be wrong.",
              )
            : t(
                "portal.review.bulk.reject.warning",
                "The held copies are deleted from the server and never reach their destination. This cannot be undone.",
              )
        }
      />
      {approving && destinations.length > 0 && (
        <p className="review-bulk__destinations">
          {t("portal.review.bulk.approve.destinations", {
            destinations: destinations.join(", "),
            defaultValue: "Sending to: {{destinations}}",
          })}
        </p>
      )}
    </Modal>
  );
}
