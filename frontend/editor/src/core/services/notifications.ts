import apiClient from "@app/services/apiClient";

// Derived server-side from whatever produces them, so this client knows nothing about failures.
const NOTIFICATIONS_PATH = "/api/v1/notifications";

export type NotificationSource = "FAILURE";

export type NotificationSeverity = "ERROR" | "WARNING" | "INFO";

export type NotificationOrigin = "TOOL" | "POLICY" | "PIPELINE";

/** From this reader's point of view. `UNOWNED` is an unattended run: nobody holds the file. */
export type NotificationOwnership = "MINE" | "THEIRS" | "UNOWNED";

/** How much of the row an action has earned; `promoteActions` turns it into a place. */
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
  viewerKey: string;
}

export interface FetchedNotifications {
  notifications: AppNotification[];
  /** A reviewer keeps rows whose document this browser does not hold; a member does not. */
  viewerReviewsTeam: boolean;
  /**
   * Opaque id for the signed-in viewer, for scoping this browser's read state. Null when the
   * server did not say, which must read as "cannot scope" rather than as a viewer of its own.
   */
  viewerKey: string | null;
}

/** Newest first. Empty rather than throwing, and defaulting to the least hiding. */
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
      viewerKey: response?.data?.viewerKey || null,
    };
  } catch {
    return { notifications: [], viewerReviewsTeam: true, viewerKey: null };
  }
}

/** Never throws: a refusal is not worth interrupting a user whose document is already fixed. */
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
