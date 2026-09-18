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

/**
 * Where the document behind a row is. The server decides: this browser cannot tell a file id it
 * minted from a reference held on a server it has never seen.
 */
export type DocumentLocation = "BROWSER" | "SMART_FOLDER" | "NONE";

/** What produced a row, so it can name the smart folder rather than just failing silently. */
export type SourceKind = "SMART_FOLDER" | "POLICY" | "EDITOR";

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
  /** Only ever an id this browser minted, so it needs no disambiguating: null otherwise. */
  fileId: string | null;
  documentLocation: DocumentLocation;
  /** What produced the row, so it can say where the work came from. */
  sourceKind: SourceKind;
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
  /** Opaque id for the viewer, for scoping read state. Null means the server did not say. */
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

/**
 * Run one of a row's server-side actions. Unlike a resolve, the reader pressed a button and is
 * owed an answer, so a refusal is reported rather than swallowed.
 *
 * @returns null when it worked, or the server's reason for refusing.
 */
export async function dispatchNotificationAction(
  notificationId: string,
  actionId: string,
): Promise<string | null> {
  try {
    await apiClient.post(
      `${NOTIFICATIONS_PATH}/${encodeURIComponent(notificationId)}/actions/${encodeURIComponent(actionId)}`,
    );
    return null;
  } catch (error) {
    const detail = (
      error as { response?: { data?: { detail?: string; title?: string } } }
    )?.response?.data;
    return detail?.detail ?? detail?.title ?? "";
  }
}
