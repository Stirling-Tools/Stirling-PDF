/** Shared formatting + status/action mappings for the Procurement surface. */

import type { StatusTone } from "@shared/components";
import type { DocAction, DocStatus } from "@portal/api/procurement";

export const USD = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

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
  available: "procurement.status.available",
  action: "procurement.status.action",
  pending: "procurement.status.pending",
  request: "procurement.status.request",
  complete: "procurement.status.complete",
};

/** Action → translation key for the button label (the fee, when present, is appended by the caller). */
export const ACTION_LABEL_KEY: Record<DocAction, string> = {
  download: "procurement.action.download",
  sign: "procurement.action.sign",
  pay: "procurement.action.pay",
  upload: "procurement.action.upload",
  request: "procurement.action.request",
};
