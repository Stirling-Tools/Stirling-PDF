import { http, HttpResponse, delay } from "msw";
import type {
  ReviewConfig,
  ReviewItem,
  ReviewItemStatus,
} from "@portal/api/review";
import {
  buildReviewConfig,
  buildReviewItems,
  buildReviewPdfBytes,
} from "@portal/mocks/review";

/**
 * Stateful mock for the Review surface (`/api/v1/review/...`) so the portal
 * works fully offline with mocks on: the config round-trips, and
 * approve/reject move items through their lifecycle. With mocks OFF these
 * calls fall through to the real backend instead, like any other
 * `/api/v1/...` surface.
 */

let config: ReviewConfig = buildReviewConfig();
let items: ReviewItem[] = buildReviewItems();

export function resetReviewStore() {
  config = buildReviewConfig();
  items = buildReviewItems();
}

function resolveItem(id: string, status: ReviewItemStatus): ReviewItem | null {
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  const resolved: ReviewItem = {
    ...item,
    status,
    resolvedAt: Date.now(),
    resolvedBy: "you@acme.com",
  };
  items = items.map((i) => (i.id === id ? resolved : i));
  return resolved;
}

async function resolveBulk(request: Request, status: ReviewItemStatus) {
  const { itemIds } = (await request.json()) as { itemIds: string[] };
  const failures: { itemId: string; reason: string }[] = [];
  let succeeded = 0;
  for (const id of itemIds) {
    if (items.some((i) => i.id === id && i.status === "PENDING")) {
      resolveItem(id, status);
      succeeded++;
    } else {
      failures.push({ itemId: id, reason: "Review item is already resolved" });
    }
  }
  return { succeeded, failures };
}

export const reviewHandlers = [
  http.get("/api/v1/review/config", async () => {
    await delay(120);
    return HttpResponse.json(config);
  }),

  http.put("/api/v1/review/config", async ({ request }) => {
    await delay(120);
    config = (await request.json()) as ReviewConfig;
    return HttpResponse.json(config);
  }),

  http.get("/api/v1/review/items", async ({ request }) => {
    await delay(120);
    const status = new URL(request.url).searchParams.get("status");
    const filtered = status ? items.filter((i) => i.status === status) : items;
    return HttpResponse.json({ items: filtered });
  }),

  // Bulk routes are registered before the `:id` ones, which would otherwise
  // swallow them with id="bulk".
  http.post("/api/v1/review/items/bulk/approve", async ({ request }) => {
    await delay(200);
    return HttpResponse.json(await resolveBulk(request, "APPROVED"));
  }),

  http.post("/api/v1/review/items/bulk/reject", async ({ request }) => {
    await delay(200);
    return HttpResponse.json(await resolveBulk(request, "REJECTED"));
  }),

  http.post("/api/v1/review/items/:id/approve", async ({ params }) => {
    await delay(120);
    const item = resolveItem(String(params.id), "APPROVED");
    if (!item) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(item);
  }),

  http.post("/api/v1/review/items/:id/reject", async ({ params }) => {
    await delay(120);
    const item = resolveItem(String(params.id), "REJECTED");
    if (!item) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(item);
  }),

  http.get("/api/v1/review/items/:id/files/:fileId", async ({ params }) => {
    await delay(120);
    const item = items.find((i) => i.id === params.id);
    const file = item?.files.find((f) => f.fileId === params.fileId);
    if (!file) return new HttpResponse(null, { status: 404 });
    return new HttpResponse(buildReviewPdfBytes(), {
      headers: { "Content-Type": "application/pdf" },
    });
  }),
];
