import { http, HttpResponse, delay } from "msw";
import {
  buildKpis,
  seedReferences,
  seedSources,
  toSourceView,
  type Source,
  type SourcePolicyRef,
  type SourcesResponse,
  type StoredSource,
} from "@portal/mocks/sources";

/**
 * The portal exercises the REAL sources API base `/api/v1/sources` (NOT the
 * portal's usual `/v1/...`), so this surface is plug-and-play against the live
 * backend (SourceController + SourceOverviewService). These handlers mutate an
 * in-memory store, so create/delete behave like a real backend within a session,
 * including the 409 when a still-referenced source is deleted.
 */

let store: StoredSource[] = seedSources();
const references: Record<string, SourcePolicyRef[]> = seedReferences();

export function resetSourcesStore(seed?: StoredSource[]): void {
  store = seed ? [...seed] : seedSources();
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `src_${Date.now().toString(36)}_${idCounter}`;
}

function refsFor(id: string): SourcePolicyRef[] {
  return references[id] ?? [];
}

function buildOverview(): SourcesResponse {
  const sources = store
    .map((source) => toSourceView(source, refsFor(source.id)))
    .sort(
      (a, b) =>
        b.referenceCount - a.referenceCount || a.name.localeCompare(b.name),
    );
  return { kpis: buildKpis(sources), sources };
}

export const sourcesHandlers = [
  // Overview: one row per source, with reference counts.
  http.get("/api/v1/sources", async () => {
    await delay(120);
    return HttpResponse.json(buildOverview());
  }),

  // Get one source's raw record by id.
  http.get("/api/v1/sources/:id", async ({ params }) => {
    await delay(120);
    const source = store.find((s) => s.id === params.id);
    if (!source) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(source);
  }),

  // Create or update: a blank id is assigned, owner stamped server-side.
  http.post("/api/v1/sources", async ({ request }) => {
    await delay(120);
    const incoming = (await request.json()) as Source;
    const existing = incoming.id
      ? store.find((s) => s.id === incoming.id)
      : undefined;
    const id = existing?.id ?? nextId();
    const saved: StoredSource = {
      ...incoming,
      id,
      owner: existing?.owner ?? "you@acme.com",
    };
    store = existing
      ? store.map((s) => (s.id === id ? saved : s))
      : [...store, saved];
    return HttpResponse.json(saved);
  }),

  // Delete: 404 if missing, 409 if a policy still references it.
  http.delete("/api/v1/sources/:id", async ({ params }) => {
    await delay(120);
    const id = String(params.id);
    const source = store.find((s) => s.id === id);
    if (!source) return new HttpResponse(null, { status: 404 });
    const refs = refsFor(id);
    if (refs.length > 0) {
      return HttpResponse.json(
        {
          detail: `Source is referenced by ${refs.length} policy(ies): ${refs
            .map((r) => r.name)
            .join(", ")}`,
        },
        { status: 409 },
      );
    }
    store = store.filter((s) => s.id !== id);
    return new HttpResponse(null, { status: 204 });
  }),
];
