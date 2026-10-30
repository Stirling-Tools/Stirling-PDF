/**
 * Mobile has no bundled backend to start or monitor: every operation goes to
 * the connected server, and `start_backend` is stubbed in
 * `src-tauri/src/commands/mobile_stubs.rs`.
 */
export function useBackendInitializer(_enabled = true): void {}
