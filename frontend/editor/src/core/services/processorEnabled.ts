/**
 * Non-hook mirror of the server's `processor.enabled`, written when app-config
 * resolves. For code that can't use `useProcessorEnabled`: plain services and
 * anything mounted above the providers.
 */

let enabled: boolean | null = null;

export function setProcessorEnabled(value: boolean): void {
  enabled = value;
}

/**
 * Unknown counts as enabled: unlike the hook this never re-runs when config
 * lands, so failing closed would permanently disable callers that resolve
 * before the first fetch.
 */
export function isProcessorEnabled(): boolean {
  return enabled !== false;
}
