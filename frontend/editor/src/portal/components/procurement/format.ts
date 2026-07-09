/** Shared formatting + status/action mappings for the Procurement surface. */

import type { StatusTone } from "@app/ui";
import type { DocAction, DocStatus } from "@portal/api/procurement";

export const USD = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Format a minor-unit (cents) amount in the given currency, whole units (no decimals). */
export function money(minor: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

/** Document status → badge tone. Action items lean amber to pull the eye. */
export const STATUS_TONE: Record<DocStatus, StatusTone> = {
  available: "success",
  action: "warning",
  pending: "info",
  request: "neutral",
  complete: "neutral",
};

/** Document status → translation key for the short badge label. */
export const STATUS_LABEL_KEY: Record<DocStatus, string> = {
  available: "portal.procurement.status.available",
  action: "portal.procurement.status.action",
  pending: "portal.procurement.status.pending",
  request: "portal.procurement.status.request",
  complete: "portal.procurement.status.complete",
};

/** Action → translation key for the button label (the fee, when present, is appended by the caller). */
export const ACTION_LABEL_KEY: Record<DocAction, string> = {
  download: "portal.procurement.action.download",
  sign: "portal.procurement.action.sign",
  pay: "portal.procurement.action.pay",
  upload: "portal.procurement.action.upload",
  request: "portal.procurement.action.request",
};
