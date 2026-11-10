import { useAuth } from "@editor/auth/UseSession";

/**
 * This build ships the failure registry and the notification routes, so the bell has
 * something to read and may mount.
 *
 * A guest is the exception: every row is scoped to a reader the server knows, and a
 * visitor has none. Mounting the bell would poll a route that answers 401 on every
 * tick and offer a panel that can never list anything, so it stays off the rail.
 */
export function useNotificationsAvailable(): boolean {
  const { isAnonymous } = useAuth();
  return !isAnonymous;
}
