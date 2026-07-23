// Meters an in-browser (non-AI) classification run for billing/audit parity with
// the server-side classify path. Fire-and-forget; failures never block the user.

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
