/**
 * Record a client-side (non-AI) classification run against billing + audit. When the AI engine is
 * off the heuristic classifier runs in the browser, so nothing hits the server-side classify route
 * that would otherwise meter it; this fast endpoint restores that parity. Fire-and-forget: never
 * awaited on the UI path and failures are swallowed, so an unbilled meter never blocks the user.
 */

import apiClient from "@app/services/apiClient";
import { getPolicyOutputBaseUrl } from "@app/services/policyOutputBaseUrl";
import { resolvePolicyRunTarget } from "@app/services/policyApi";

interface ClassifyMeterPayload {
  /** Policy name for the audit-trail label; defaults to "Classification" server-side. */
  policyName?: string;
  /** Documents covered by this meter call (defaults to 1 server-side). */
  documentCount?: number;
  /** Resolved labels, carried for the audit record. */
  labels?: string[];
}

/** Meter a completed client-side classification. Does not throw and is not awaited by callers. */
export function meterClassificationRun(payload: ClassifyMeterPayload): void {
  const base = getPolicyOutputBaseUrl(resolvePolicyRunTarget());
  void apiClient
    .post(`${base}/api/v1/policies/classify/meter`, payload, {
      suppressErrorToast: true,
    })
    .catch(() => {
      // Best-effort billing; the classification already succeeded in the browser.
    });
}
