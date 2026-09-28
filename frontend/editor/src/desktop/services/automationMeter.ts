import apiClient from "@app/services/apiClient";
import {
  getServerAutomationSession,
  type ServerAutomationSession,
} from "@app/services/serverAutomationSession";
import type { AutomationMeterPayload } from "@core/services/automationMeter";
export type {
  AutomationMeterPayload,
  AutomationMeterInput,
} from "@core/services/automationMeter";

/** Matches AutomationMeterController.MAX_INPUTS; larger payloads are truncated by the server. */
const MAX_METER_INPUTS = 10_000;

/** Reports browser classification to its connected server; server pipelines meter themselves.
 *  Pass the session a caller already resolved to skip re-resolving it (auth + routing) here. */
export function meterAutomationRun(
  payload: AutomationMeterPayload,
  session?: ServerAutomationSession,
): void {
  void (session ? Promise.resolve(session) : getServerAutomationSession())
    .then(async (session) => {
      for (
        let offset = 0;
        offset < payload.inputs.length;
        offset += MAX_METER_INPUTS
      ) {
        await apiClient.post(
          `${session.baseUrl}/api/v1/automation/meter`,
          {
            ...payload,
            inputs: payload.inputs.slice(offset, offset + MAX_METER_INPUTS),
          },
          {
            suppressErrorToast: true,
            automationSession: session.key,
          },
        );
      }
    })
    .catch(() => {
      // The server meter is best-effort for already-completed browser classification.
    });
}
