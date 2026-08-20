import apiClient from "@app/services/apiClient";

// Derived server-side from whatever produces them, so this client knows nothing about failures.
const NOTIFICATIONS_PATH = "/api/v1/notifications";

export type NotificationSource = "FAILURE";

export type NotificationSeverity = "ERROR" | "WARNING" | "INFO";

export type NotificationOrigin = "TOOL" | "POLICY" | "PIPELINE";

/** From this reader's point of view. `UNOWNED` is an unattended run: nobody holds the file. */
export type NotificationOwnership = "MINE" | "THEIRS" | "UNOWNED";

/**
 * How much of the row an action has earned. The server ranks by what it does, not by where it lands;
 * `promoteActions` turns a slot into a button or a menu entry.
 */
export type NotificationActionSlot = "RESOLUTION" | "SECONDARY" | "OVERFLOW";

/** `id` is an open string, not a union: the server may know actions this build does not. */
export interface NotificationActionOffer {
  id: string;
  labelKey: string;
  /** English fallback, for a build with no copy for `labelKey`. */
  defaultLabel: string;
  slot: NotificationActionSlot;
  /** False renders no button in the bell, and a disabled one in the portal's queue. */
  enabled: boolean;
  disabledReasonKey: string | null;
}

export interface AppNotification {
  /** Prefixed with its source (`failure:<uuid>`), so it is never an id a per-source endpoint takes. */
  id: string;
  source: NotificationSource;
  /** Open string, e.g. `INPUT_PASSWORD_PROTECTED`: the server adds kinds without a client change. */
  kindId: string;
  origin: NotificationOrigin;
  ownership: NotificationOwnership;
  severity: NotificationSeverity;
  status: string;
  titleKey: string;
  defaultTitle: string;
  detail: string | null;
  /** Two id spaces share this field, and `sourceId` says which: see `isResolvableHere`. */
  fileId: string | null;
  /** Which folder, bucket or webhook fed the run, and null for an attended one. */
  sourceId: string | null;
  policyId: string | null;
  occurrences: number;
  createdAt: string;
  lastSeenAt: string;
  actions: NotificationActionOffer[];
}

interface NotificationsResponse {
  notifications: AppNotification[];
  viewerReviewsTeam: boolean;
}

export interface FetchedNotifications {
  notifications: AppNotification[];
  /**
   * Whether the caller reviews the whole team. A member sees only their own rows, and the client
   * hides those whose document is not in this browser; a reviewer sees everything, so it can spot a
   * policy that needs fixing even for a file they cannot open.
   */
  viewerReviewsTeam: boolean;
}

/**
 * Newest first. Empty rather than throwing: a bell that cannot load is an empty bell, not an error.
 * `viewerReviewsTeam` defaults to true, so a missing field never hides more than intended.
 */
export async function fetchNotifications(
  limit = 20,
): Promise<FetchedNotifications> {
  try {
    const response = await apiClient.get<NotificationsResponse>(
      `${NOTIFICATIONS_PATH}?limit=${limit}`,
    );
    return {
      notifications: response?.data?.notifications ?? [],
      viewerReviewsTeam: response?.data?.viewerReviewsTeam ?? true,
    };
  } catch {
    return { notifications: [], viewerReviewsTeam: true };
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
