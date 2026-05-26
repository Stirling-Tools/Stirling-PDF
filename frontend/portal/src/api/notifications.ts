import { httpJson } from "@portal/api/http";
import type {
  Notification,
  NotificationCategory,
} from "@portal/mocks/notifications";

export type { Notification, NotificationCategory };

/** GET /v1/notifications */
export async function fetchNotifications(): Promise<Notification[]> {
  return httpJson<Notification[]>("/v1/notifications");
}

/** POST /v1/notifications/mark-all-read */
export async function markAllNotificationsRead(): Promise<void> {
  await httpJson<{ ok: true }>("/v1/notifications/mark-all-read", {
    method: "POST",
  });
}
