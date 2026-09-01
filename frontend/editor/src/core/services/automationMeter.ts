// Records a completed in-browser Automate run for billing/audit.

/** One input document's page count (0 for non-PDF / unknown) and byte size. */
export interface AutomationMeterInput {
  pages: number;
  bytes: number;
}

export interface AutomationMeterPayload {
  automationName?: string;
  operations?: string[];
  inputs: AutomationMeterInput[];
}

/** Meter a completed Automate run. Fire-and-forget; never awaited, never throws. */
export function meterAutomationRun(_payload: AutomationMeterPayload): void {
  // No billing layer in the core build.
}
