import { Button, Chip, StatusBadge } from "@shared/components";
import type { LedgerDoc } from "@portal/api/procurement";
import {
  ACTION_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  USD,
} from "@portal/components/procurement/format";

/** Maps a document's action to the button accent + variant. */
function buttonStyle(doc: LedgerDoc): {
  variant: "gradient" | "outline";
  accent: "purple" | "blue";
} {
  // The agreement signature and online payment are the deal-advancing actions —
  // give them the filled accent CTA; everything else is a quieter outline.
  if (doc.action === "sign" || doc.action === "pay") {
    return { variant: "gradient", accent: "purple" };
  }
  return { variant: "outline", accent: "blue" };
}

/**
 * A single document in the ledger or supporting pool: name + sub-line on the
 * left, status badge and action button on the right. Optional/fee-bearing docs
 * carry a chip so the buyer sees a paid add-on before clicking.
 */
export function DocRow({
  doc,
  onAction,
  busy = false,
}: {
  doc: LedgerDoc;
  onAction: (doc: LedgerDoc) => void;
  busy?: boolean;
}) {
  const { variant, accent } = buttonStyle(doc);
  // Completed paperwork keeps a record but offers no further action.
  const actionable = doc.status !== "complete";
  const actionLabel =
    doc.fee !== undefined
      ? `${ACTION_LABEL[doc.action]} · ${USD.format(doc.fee)}`
      : ACTION_LABEL[doc.action];

  return (
    <div className="portal-proc__doc">
      <div className="portal-proc__doc-text">
        <div className="portal-proc__doc-name-row">
          <span className="portal-proc__doc-name">{doc.name}</span>
          {doc.optional && (
            <Chip tone="neutral" size="sm">
              Optional
            </Chip>
          )}
          {doc.fee !== undefined && (
            <Chip tone="amber" size="sm">
              Paid add-on
            </Chip>
          )}
        </div>
        <p className="portal-proc__doc-sub">{doc.sub}</p>
      </div>
      <div className="portal-proc__doc-actions">
        <StatusBadge tone={STATUS_TONE[doc.status]} size="sm">
          {STATUS_LABEL[doc.status]}
        </StatusBadge>
        {actionable && (
          <Button
            variant={variant}
            accent={accent}
            size="sm"
            loading={busy}
            onClick={() => onAction(doc)}
          >
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
