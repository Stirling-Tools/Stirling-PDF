import { useTranslation } from "react-i18next";
import { Button, Chip, StatusBadge } from "@shared/components";
import type { LedgerDoc } from "@portal/api/procurement";
import {
  ACTION_LABEL_KEY,
  STATUS_LABEL_KEY,
  STATUS_TONE,
  USD,
} from "@portal/components/procurement/format";

/** Maps a document's action to the button accent + variant. */
function buttonStyle(doc: LedgerDoc): {
  variant: "gradient" | "outline";
  accent: "purple" | "blue";
} {
  // The agreement signature and online payment are the deal-advancing actions;
  // give them the filled accent CTA. Everything else is a quieter outline.
  if (doc.action === "sign" || doc.action === "pay") {
    return { variant: "gradient", accent: "purple" };
  }
  return { variant: "outline", accent: "blue" };
}

/**
 * A single document in the ledger or supporting pool: name + sub-line on the
 * left, status badge and action button on the right. Optional/fee-bearing docs
 * carry a chip so the buyer sees a paid add-on before clicking. `locked` is for
 * rows in a future, not-yet-reached stage: dimmed, marked "Upcoming", inert.
 */
export function DocRow({
  doc,
  onAction,
  locked = false,
}: {
  doc: LedgerDoc;
  onAction: (doc: LedgerDoc) => void;
  locked?: boolean;
}) {
  const { t } = useTranslation();
  const { variant, accent } = buttonStyle(doc);
  // Locked (future-stage), in-progress (pending) and completed paperwork all
  // offer no action; only "available", "action" and "request" docs do.
  const actionable =
    !locked && doc.status !== "complete" && doc.status !== "pending";
  const label = t(ACTION_LABEL_KEY[doc.action]);
  const actionLabel =
    doc.fee !== undefined ? `${label} · ${USD.format(doc.fee)}` : label;

  return (
    <div className="portal-proc__doc" data-locked={locked || undefined}>
      <div className="portal-proc__doc-text">
        <div className="portal-proc__doc-name-row">
          <span className="portal-proc__doc-name">{doc.name}</span>
          {doc.optional && (
            <Chip tone="neutral" size="sm">
              {t("procurement.docs.optional")}
            </Chip>
          )}
          {doc.fee !== undefined && (
            <Chip tone="amber" size="sm">
              {t("procurement.docs.paidAddon")}
            </Chip>
          )}
        </div>
        <p className="portal-proc__doc-sub">{doc.sub}</p>
      </div>
      <div className="portal-proc__doc-actions">
        <StatusBadge
          tone={locked ? "neutral" : STATUS_TONE[doc.status]}
          size="sm"
        >
          {locked
            ? t("procurement.docs.upcoming")
            : t(STATUS_LABEL_KEY[doc.status])}
        </StatusBadge>
        {actionable && (
          <Button
            variant={variant}
            accent={accent}
            size="sm"
            onClick={() => onAction(doc)}
          >
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
