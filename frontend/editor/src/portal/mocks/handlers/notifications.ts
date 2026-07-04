import { http, HttpResponse, delay } from "msw";
import { NOTIFICATIONS, type Notification } from "@portal/mocks/notifications";

let store: Notification[] = [...NOTIFICATIONS];

export function resetNotificationsStore(seed?: Notification[]): void {
  store = seed ? [...seed] : [...NOTIFICATIONS];
}

export const notificationsHandlers = [
  http.get("/v1/notifications", async () => {
    await delay(120);
    return HttpResponse.json(store);
  }),

  http.post("/v1/notifications/mark-all-read", async () => {
    await delay(120);
    store = [];
    return HttpResponse.json({ ok: true });
  }),
];
