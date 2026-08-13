import apiClient from "@app/services/apiClient";

/**
 * The caller's notifications. Derived server-side from whatever produces them, so this client
 * needs to know nothing about failures, policies or any later source: it renders what it is given
 * and branches on `source` only when it wants to.
 */

const NOTIFICATIONS_PATH = "/api/v1/notifications";

/** Which subsystem produced a notification. Widen as the server gains sources. */
export type NotificationSource = "FAILURE";

export type NotificationSeverity = "ERROR" | "WARNING" | "INFO";

/** What was running when it failed. */
export type NotificationOrigin = "TOOL" | "POLICY" | "PIPELINE";

/**
 * Whose document it is, from this reader's point of view. `UNOWNED` is an unattended run: nobody has
 * the file, so nothing that needs the bytes can be offered.
 */
export type NotificationOwnership = "MINE" | "THEIRS" | "UNOWNED";

/** Who performs the action: the server on its own record, or this client on its own device. */
export type NotificationActionExecution = "SERVER" | "CLIENT";

/**
 * One action as offered for one notification. `id` is a plain string rather than a union because the
 * server may know actions this build does not, and the client skips the ones it cannot perform.
 */
export interface NotificationActionOffer {
  id: string;
  labelKey: string;
  /** English fallback, for a build with no copy for `labelKey`. */
  defaultLabel: string;
  execution: NotificationActionExecution;
  /** False means the server will refuse it. The bell renders no button and states the reason
   *  instead; the portal's queue still shows it disabled. */
  enabled: boolean;
  disabledReasonKey: string | null;
}

export interface AppNotification {
  /**
   * Unique across sources, so it can be keyed and compared on its own. Prefixed with its source
   * (`failure:<uuid>`), so it is the id the notification endpoints take and never one a per-source
   * endpoint would accept.
   */
  id: string;
  source: NotificationSource;
  /** Which failure kind, e.g. `INPUT_PASSWORD_PROTECTED`. An open string: the server adds kinds
   *  without waiting for a client that knows them. */
  kindId: string;
  origin: NotificationOrigin;
  ownership: NotificationOwnership;
  severity: NotificationSeverity;
  status: string;
  titleKey: string;
  defaultTitle: string;
  detail: string | null;
  /**
   * Opaque reference to the document, resolvable only by the client that stored it. Two id spaces
   * share this field, and `sourceId` says which: see `isResolvableHere` in `useNotifications`.
   */
  fileId: string | null;
  /** Which folder, bucket or webhook fed the failing run, and null for an attended run. */
  sourceId: string | null;
  policyId: string | null;
  occurrences: number;
  createdAt: string;
  lastSeenAt: string;
  actions: NotificationActionOffer[];
}

interface NotificationsResponse {
  notifications: AppNotification[];
}

/**
 * Newest first. Empty rather than throwing on a build without the endpoint, or for a caller the
 * server will not answer: a bell that cannot load is a bell with nothing in it, not an error the
 * user needs to see.
 */
export async function fetchNotifications(
  limit = 20,
): Promise<AppNotification[]> {
  try {
    const response = await apiClient.get<NotificationsResponse>(
      `${NOTIFICATIONS_PATH}?limit=${limit}`,
    );
    return response?.data?.notifications ?? [];
  } catch {
    return [];
  }
}

/**
 * Perform a server-side action on a notification, reporting only whether it took. The server owns the
 * consequences, so the caller's job afterwards is to re-read the list rather than patch its own copy.
 * Takes the prefixed notification id, which is the only id the bell ever holds.
 */
export async function runNotificationAction(
  notificationId: string,
  actionId: string,
): Promise<boolean> {
  try {
    await apiClient.post(
      `${NOTIFICATIONS_PATH}/${encodeURIComponent(notificationId)}/actions/${encodeURIComponent(actionId)}`,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Tell the server that the client fixed what a notification was about, so the bell stops reporting a
 * failure the user has already dealt with. Takes the prefixed id, so the bell never hands a raw row id
 * to a failure endpoint.
 *
 * Never throws. A refusal (already dismissed, not the caller's row) is not worth interrupting the user
 * over: their document is already fixed and in front of them, and the next read tidies up the row.
 */
export async function reportNotificationResolved(
  notificationId: string,
): Promise<boolean> {
  try {
    await apiClient.post(
      `${NOTIFICATIONS_PATH}/${encodeURIComponent(notificationId)}/resolved`,
    );
    return true;
  } catch {
    return false;
  }
}
