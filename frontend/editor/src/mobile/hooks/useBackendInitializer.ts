/**
 * Mobile has no bundled backend to start or monitor: every operation goes to
 * the connected server. The desktop hook would otherwise keep retrying the
 * stubbed `start_backend` command in a tight loop.
 */
export function useBackendInitializer(_enabled = true): void {}
