import { apiClient } from "@portal/api/http";

export type NotificationCategory =
  | "pipeline"
  | "deploy"
  | "billing"
  | "audit"
  | "agent"
  | "doc";

export interface Notification {
  id: string;
  category: NotificationCategory;
  title: string;
  description: string;
  /** Relative-time string. */
  time: string;
}

/** GET /v1/notifications */
export async function fetchNotifications(): Promise<Notification[]> {
  return apiClient.local.json<Notification[]>("/v1/notifications");
}

/** POST /v1/notifications/mark-all-read */
export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.local.json<{ ok: true }>("/v1/notifications/mark-all-read", {
    method: "POST",
  });
}
