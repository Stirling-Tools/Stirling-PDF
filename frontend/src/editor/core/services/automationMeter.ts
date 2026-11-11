// Records a completed in-browser automation run.

/** One input document's page count (0 for non-PDF / unknown) and byte size. */
export interface AutomationMeterInput {
  pages: number;
  bytes: number;
}

export interface AutomationMeterPayload {
  /** Only the existing Automate tool is included in a self-hosted Server licence. */
  source?: "AUTOMATE" | "PROCESSOR";
  automationName?: string;
  operations?: string[];
  inputs: AutomationMeterInput[];
}

/** Meter a completed automation run. Fire-and-forget; never awaited, never throws. */
export function meterAutomationRun(_payload: AutomationMeterPayload): void {
  // No billing layer in the core build.
}
