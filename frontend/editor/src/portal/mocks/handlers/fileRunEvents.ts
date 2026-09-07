import { http, HttpResponse, delay } from "msw";
import type { FileRunEvent } from "@portal/api/fileRunEvents";
import { FILE_RUN_EVENTS } from "@portal/mocks/fileRunEvents";

/**
 * Mock backend for recorded policy failures. Stateful on purpose, so acting on a row
 * visibly changes it the way the real backend does. State resets on reload.
 */

/** Mutable copy so a dispatched action is reflected in later reads. */
let events: FileRunEvent[] = FILE_RUN_EVENTS.map((event) => ({ ...event }));

/** Mirrors the server: a closed row keeps its actions but disables them all. */
function closeActions(event: FileRunEvent): FileRunEvent["actions"] {
  return event.actions.map((action) => ({
    ...action,
    enabled: false,
    disabledReasonKey: "portal.failures.disabled.closed",
  }));
}

export const fileRunEventsHandlers = [
  http.get("*/api/v1/file-run-events", async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const kindId = url.searchParams.get("kindId");

    // Mirrors the server: no status asked for means the open queue, so a dismissed
    // row leaves the list instead of sitting there with its buttons greyed out.
    const filtered = events.filter(
      (event) =>
        (status
          ? event.status === status
          : event.status !== "DISMISSED" && event.status !== "RESOLVED") &&
        (!kindId || event.kindId === kindId),
    );
    return HttpResponse.json({
      events: [...filtered].sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    });
  }),

  http.post(
    "*/api/v1/file-run-events/:eventId/actions/:actionId",
    async ({ params }) => {
      await delay(120);
      const { eventId, actionId } = params as {
        eventId: string;
        actionId: string;
      };

      const existing = events.find((event) => event.id === eventId);
      if (!existing) {
        return HttpResponse.json({ detail: "No such event" }, { status: 404 });
      }
      // The real backend refuses an action the kind never declared, so the mock does too.
      if (!existing.actions.some((action) => action.id === actionId)) {
        return HttpResponse.json(
          { detail: `Kind ${existing.kindId} does not offer ${actionId}` },
          { status: 400 },
        );
      }
      if (existing.status === "DISMISSED" || existing.status === "RESOLVED") {
        return HttpResponse.json({ detail: "Already closed" }, { status: 409 });
      }

      const updated: FileRunEvent =
        actionId === "DISMISS"
          ? {
              ...existing,
              status: "DISMISSED",
              statusActor: "you@example.com",
              actions: closeActions(existing),
            }
          : {
              ...existing,
              status: "ACKNOWLEDGED",
              // Acknowledging twice keeps the original owner.
              statusActor: existing.statusActor ?? "you@example.com",
            };

      events = events.map((event) =>
        event.id === updated.id ? updated : event,
      );
      return HttpResponse.json(updated);
    },
  ),
];
