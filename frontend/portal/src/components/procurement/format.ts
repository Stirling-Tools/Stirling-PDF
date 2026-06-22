/** Shared formatting + status/action mappings for the Procurement surface. */

import type { StatusTone } from "@shared/components";
import type { DocAction, DocStatus } from "@portal/api/procurement";

export const USD = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatDealDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Document status → badge tone. Action items lean amber to pull the eye. */
export const STATUS_TONE: Record<DocStatus, StatusTone> = {
  available: "success",
  action: "warning",
  pending: "info",
  request: "neutral",
  complete: "neutral",
};

/** Document status → short badge label. */
export const STATUS_LABEL: Record<DocStatus, string> = {
  available: "Available",
  action: "Action needed",
  pending: "Pending",
  request: "On request",
  complete: "Complete",
};

/** Action → button label (the fee, when present, is appended by the caller). */
export const ACTION_LABEL: Record<DocAction, string> = {
  download: "Download",
  sign: "Review & sign",
  pay: "Pay now",
  upload: "Upload",
  request: "Request",
};
