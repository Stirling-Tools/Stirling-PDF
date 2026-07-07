import { http, HttpResponse, delay } from "msw";
import type {
  PipelineKpi,
  PipelineStatus,
  PipelineView,
  PipelinesOverviewResponse,
  Policy,
} from "@portal/api/pipelines";

/**
 * Stateful mock for the Pipelines surface so the portal works fully offline with
 * mocks on. Mirrors the real backend shape (`/api/v1/policies`, PolicyController +
 * PolicyOverviewService): the overview, create, edit, and delete mutate an
 * in-memory store of real-shaped policies. With mocks OFF these calls fall through
 * to the real backend instead.
 *
 * The user-facing Policies "catalogue" page also lives on `/api/v1/policies` (its
 * own handlers, a different response shape). These handlers are registered first
 * and DISCRIMINATE: anything that isn't a real-shaped pipeline (the catalogue
 * page's bodies carry a `categoryId`; its ids aren't in this store) is passed
 * through by returning nothing, so the catalogue handlers still serve it. That
 * keeps both surfaces working in mock mode without either clobbering the other.
 */

/** Display names for the seeded sources, so the overview resolves ids to names. */
const SOURCE_NAMES: Record<string, string> = {
  "src-claims": "Claims intake",
  "src-contracts": "Contracts drop",
  "src-archive": "Archive reprocess",
};

interface StoredPolicy extends Policy {
  id: string;
}

function seedPipelines(): StoredPolicy[] {
  return [
    {
      id: "plc-redaction",
      name: "Redaction sweep",
      owner: "security@acme.com",
      enabled: true,
      trigger: {
        type: "schedule",
        options: { schedule: { type: "every", count: 6, unit: "HOURS" } },
      },
      sourceIds: ["src-claims"],
      steps: [
        {
          operation: "/api/v1/security/auto-redact",
          parameters: { mode: "automatic", convertPDFToImage: true },
        },
        { operation: "/api/v1/security/sanitize-pdf", parameters: {} },
      ],
      output: { type: "inline", options: {} },
    },
    {
      id: "plc-archive",
      name: "Archive compressor",
      owner: "data-eng@acme.com",
      enabled: true,
      trigger: null,
      sourceIds: ["src-contracts", "src-archive"],
      steps: [{ operation: "/api/v1/misc/compress-pdf", parameters: {} }],
      output: { type: "folder", options: { directory: "/data/archive-out" } },
    },
    {
      id: "plc-onboarding",
      name: "Onboarding OCR (paused)",
      owner: "ops@acme.com",
      enabled: false,
      trigger: null,
      sourceIds: [],
      steps: [
        { operation: "/api/v1/misc/ocr-pdf", parameters: {} },
        { operation: "/api/v1/misc/flatten", parameters: {} },
      ],
      output: { type: "inline", options: {} },
    },
  ];
}

let store: StoredPolicy[] = seedPipelines();

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `plc_${Date.now().toString(36)}_${idCounter}`;
}

function deriveStatus(policy: StoredPolicy): PipelineStatus {
  return policy.enabled ? "active" : "paused";
}

function toView(policy: StoredPolicy): PipelineView {
  return {
    id: policy.id,
    name: policy.name,
    enabled: policy.enabled,
    status: deriveStatus(policy),
    trigger: policy.trigger?.type ?? "manual",
    sources: policy.sourceIds.map((id) => ({
      id,
      name: SOURCE_NAMES[id] ?? id,
    })),
    steps: policy.steps.map((s) => s.operation),
    output: policy.output?.type ?? "inline",
    owner: policy.owner ?? "you@acme.com",
  };
}

function buildKpis(): PipelineKpi[] {
  const total = store.length;
  const active = store.filter((p) => p.enabled).length;
  return [
    { value: total, description: "pipelines" },
    { value: active, description: "running automatically" },
    { value: total - active, description: "paused" },
  ];
}

function buildOverview(): PipelinesOverviewResponse {
  const pipelines = store
    .map(toView)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { kpis: buildKpis(), pipelines };
}

export const pipelinesHandlers = [
  http.get("/api/v1/policies/overview", async () => {
    await delay(120);
    return HttpResponse.json(buildOverview());
  }),

  // Available triggers + their source-type compatibility. Registered before the
  // ":id" handler so "triggers" isn't matched as a policy id.
  http.get("/api/v1/policies/triggers", async () => {
    await delay(120);
    return HttpResponse.json([
      { type: "schedule", requiresSource: false, supportedSourceTypes: [] },
      {
        type: "folder-watch",
        requiresSource: true,
        supportedSourceTypes: ["folder"],
      },
    ]);
  }),

  // Run status: the mock completes runs immediately, so polling resolves at once.
  http.get("/api/v1/policies/run/:runId", async ({ params }) => {
    await delay(120);
    return HttpResponse.json({
      runId: String(params.runId),
      policyId: null,
      status: "COMPLETED",
      currentStep: 1,
      stepCount: 1,
      error: null,
      errorCode: null,
      createdAt: Date.now(),
    });
  }),

  // Manual trigger: pretends to start one run and returns its id to poll.
  http.post("/api/v1/policies/:id/trigger", async ({ params }) => {
    if (!store.some((p) => p.id === params.id)) return undefined;
    await delay(120);
    return HttpResponse.json([`run_${Date.now().toString(36)}`]);
  }),

  // Raw policy by id. Only our pipeline ids are served here; everything else falls
  // through to the catalogue page's handler.
  http.get("/api/v1/policies/:id", async ({ params }) => {
    const policy = store.find((p) => p.id === params.id);
    if (!policy) return undefined;
    await delay(120);
    return HttpResponse.json(policy);
  }),

  // Create or update a pipeline. The catalogue page's bodies carry a `categoryId`;
  // those are passed through so its own handler stores them.
  http.post("/api/v1/policies", async ({ request }) => {
    // Clone before reading: a non-pipeline body falls through to the catalogue
    // page's handler, which needs to read the (still-unconsumed) body itself.
    const incoming = (await request.clone().json()) as Policy & {
      categoryId?: string;
    };
    if ("categoryId" in incoming) return undefined;
    await delay(120);
    const existing = incoming.id
      ? store.find((p) => p.id === incoming.id)
      : undefined;
    const id = existing?.id ?? nextId();
    const saved: StoredPolicy = {
      ...incoming,
      id,
      owner: existing?.owner ?? "you@acme.com",
    };
    store = existing
      ? store.map((p) => (p.id === id ? saved : p))
      : [...store, saved];
    return HttpResponse.json(saved);
  }),

  http.delete("/api/v1/policies/:id", async ({ params }) => {
    const id = String(params.id);
    if (!store.some((p) => p.id === id)) return undefined;
    await delay(120);
    store = store.filter((p) => p.id !== id);
    return new HttpResponse(null, { status: 204 });
  }),
];
