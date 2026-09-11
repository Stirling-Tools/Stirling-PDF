// Meters an in-browser automation run.

import apiClient from "@app/services/apiClient";
import { type AutomationMeterPayload } from "@core/services/automationMeter";

export {
  type AutomationMeterInput,
  type AutomationMeterPayload,
} from "@core/services/automationMeter";

export function meterAutomationRun(payload: AutomationMeterPayload): void {
  void apiClient
    .post(`/api/v1/automation/meter`, payload, { suppressErrorToast: true })
    .catch(() => {
      // Best-effort billing; the automation already succeeded in the browser.
    });
}
