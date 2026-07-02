import { http, HttpResponse, delay } from "msw";
import type {
  Source,
  SourceKpi,
  SourcePolicyRef,
  SourceStatus,
  SourceView,
  SourcesResponse,
} from "@portal/api/sources";
import { sampleDailySeries } from "@portal/mocks/sampleDailySeries";

/**
 * Stateful mock for the Sources surface so the portal works fully offline with
 * mocks on. Mirrors the real backend shape (`/api/v1/sources`, SourceController +
 * SourceOverviewService): create/delete mutate an in-memory store, and delete of
 * a still-referenced source returns 409. With mocks OFF these calls fall through
 * to the real backend instead, like any other `/api/v1/...` surface.
 */

interface StoredSource extends Source {
  id: string;
}

function seedSources(): StoredSource[] {
  return [
    {
      id: "src-claims",
      name: "Claims intake",
      type: "folder",
      options: { directory: "/data/claims-intake", mode: "consume" },
      enabled: true,
      owner: "you@acme.com",
    },
    {
      id: "src-contracts",
      name: "Contracts drop",
      type: "folder",
      options: { directory: "/data/contracts", mode: "snapshot" },
      enabled: true,
      owner: "legal-ops@acme.com",
    },
    {
      id: "src-archive",
      name: "Archive reprocess",
      type: "folder",
      options: { directory: "/data/archive", mode: "consume" },
      enabled: true,
      owner: "data-eng@acme.com",
    },
    {
      id: "src-legacy",
      name: "Legacy share (paused)",
      type: "folder",
      options: { directory: "/mnt/legacy" },
      enabled: false,
      owner: "data-eng@acme.com",
    },
  ];
}

/** Which seeded policies reference each seeded source (drives reference counts). */
const references: Record<string, SourcePolicyRef[]> = {
  "src-claims": [
    { id: "pol_security", name: "Security Policy" },
    { id: "pol_redaction", name: "Redaction Policy" },
  ],
  "src-contracts": [{ id: "pol_contract", name: "Contract Review" }],
};

/** Per-source document throughput, mirroring the backend's docsTotal / 24h / 30d. */
const docCounts: Record<
  string,
  { total: number; last24h: number; last30d: number }
> = {
  "src-claims": { total: 45230, last24h: 312, last30d: 9870 },
  "src-contracts": { total: 12840, last24h: 96, last30d: 2310 },
  "src-archive": { total: 1180, last24h: 0, last30d: 0 },
  "src-legacy": { total: 48600, last24h: 0, last30d: 0 },
};

function docsFor(id: string): {
  total: number;
  last24h: number;
  last30d: number;
  daily: number[];
} {
  const counts = docCounts[id] ?? { total: 0, last24h: 0, last30d: 0 };
  return { ...counts, daily: sampleDailySeries(counts.last30d / 30) };
}

let store: StoredSource[] = seedSources();

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `src_${Date.now().toString(36)}_${idCounter}`;
}

function refsFor(id: string): SourcePolicyRef[] {
  return references[id] ?? [];
}

function configRows(options: Record<string, unknown>) {
  return Object.entries(options).map(([key, value]) => ({
    label: key.charAt(0).toUpperCase() + key.slice(1),
    value: String(value),
  }));
}

function deriveStatus(
  source: StoredSource,
  referenceCount: number,
): SourceStatus {
  if (!source.enabled) return "disabled";
  return referenceCount === 0 ? "unused" : "active";
}

function toSourceView(
  source: StoredSource,
  refs: SourcePolicyRef[],
): SourceView {
  const docs = docsFor(source.id);
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    status: deriveStatus(source, refs.length),
    referenceCount: refs.length,
    referencingPolicies: refs,
    config: configRows(source.options),
    docsTotal: docs.total,
    docs24h: docs.last24h,
    docs30d: docs.last30d,
  };
}

function buildKpis(views: SourceView[]): SourceKpi[] {
  const total = views.length;
  const inUse = views.filter((v) => v.referenceCount > 0).length;
  return [
    { value: total, description: "connections" },
    { value: inUse, description: "referenced by a policy" },
    { value: total - inUse, description: "unused" },
  ];
}

function buildOverview(): SourcesResponse {
  const views = store
    .map((s) => toSourceView(s, refsFor(s.id)))
    .sort(
      (a, b) =>
        b.referenceCount - a.referenceCount || a.name.localeCompare(b.name),
    );
  return { kpis: buildKpis(views), sources: views };
}

export const sourcesHandlers = [
  http.get("/api/v1/sources", async () => {
    await delay(120);
    return HttpResponse.json(buildOverview());
  }),

  http.get("/api/v1/sources/:id", async ({ params }) => {
    await delay(120);
    const source = store.find((s) => s.id === params.id);
    if (!source) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(source);
  }),

  http.get("/api/v1/sources/:id/document-counts", async ({ params }) => {
    await delay(120);
    const source = store.find((s) => s.id === params.id);
    if (!source) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(docsFor(source.id).daily);
  }),

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
