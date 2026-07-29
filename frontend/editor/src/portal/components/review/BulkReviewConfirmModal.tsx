import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Banner, Button, Modal } from "@app/ui";
import "@portal/components/review/BulkReviewConfirmModal.css";

export type BulkDecision = "approve" | "reject";

/** How many destinations to name before summarising the rest. A queue can span
 *  every source a team has, and an unbounded comma list would run off the modal. */
const NAMED_DESTINATIONS = 3;

/** "a, b, c and 4 more". The count in the surrounding sentence covers the total
 *  either way, so the tail only has to account for what isn't named. */
function listed(t: TFunction, destinations: string[]): string {
  const named = destinations.slice(0, NAMED_DESTINATIONS).join(", ");
  const rest = destinations.length - NAMED_DESTINATIONS;
  if (rest <= 0) return named;
  return t("portal.review.bulk.approve.andMore", {
    named,
    count: rest,
    defaultValue: "{{named}} and {{count}} more",
  });
}

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
          {destinations.length === 1
            ? t("portal.review.bulk.approve.destination", {
                destination: destinations[0],
                defaultValue: "Sending to: {{destination}}",
              })
            : t("portal.review.bulk.approve.destinations", {
                count: destinations.length,
                destinations: listed(t, destinations),
                defaultValue:
                  "Sending to {{count}} destinations: {{destinations}}",
              })}
        </p>
      )}
    </Modal>
  );
}
