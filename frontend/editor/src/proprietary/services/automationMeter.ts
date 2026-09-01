// Meters an in-browser Automate run for billing/audit.

import apiClient from "@app/services/apiClient";
import { type AutomationMeterPayload } from "@core/services/automationMeter";

export {
  type AutomationMeterInput,
  type AutomationMeterPayload,
} from "@core/services/automationMeter";

export function meterAutomationRun(payload: AutomationMeterPayload): void {
  void apiClient
    .post(`/api/v1/automate/meter`, payload, { suppressErrorToast: true })
    .catch(() => {
      // Best-effort billing; the automation already succeeded in the browser.
    });
}
