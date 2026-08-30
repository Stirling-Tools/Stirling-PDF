import { useConfirmedRemoteMode } from "@app/hooks/useConfirmedRemoteMode";

/**
 * Desktop reads notifications off whichever Stirling server it is connected to, and has none of
 * its own: the backend in the installer is built without {@code :proprietary}, so
 * {@code /api/v1/notifications} is not a route it serves.
 *
 * Without this seam the desktop build inherits the proprietary answer — an unconditional yes —
 * because {@code @app/*} resolves desktop → cloud → proprietary → core. The bell then mounts on a
 * local install and polls a route that 404s, which is what the core stub exists to prevent.
 */
export function useNotificationsAvailable(): boolean {
  return useConfirmedRemoteMode();
}
