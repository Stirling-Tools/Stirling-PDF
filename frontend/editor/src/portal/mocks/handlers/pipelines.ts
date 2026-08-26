import { http, HttpResponse, delay } from "msw";
import type {
  PipelineKpi,
  PipelineView,
  PipelinesOverviewResponse,
  Policy,
} from "@portal/api/pipelines";
import { getCataloguePolicies } from "@portal/mocks/handlers/policies";

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
      inputs: [
        {
          sourceId: "src-claims",
          trigger: {
            type: "schedule",
            options: { schedule: { type: "every", count: 6, unit: "HOURS" } },
          },
        },
      ],
      steps: [
        {
          operation: "/api/v1/security/auto-redact",
          parameters: { mode: "automatic", convertPDFToImage: true },
        },
        { operation: "/api/v1/security/sanitize-pdf", parameters: {} },
      ],
      output: { type: "inline", options: {} },
      outputIds: ["src-archive"],
    },
    {
      id: "plc-archive",
      name: "Archive compressor",
      owner: "data-eng@acme.com",
      enabled: true,
      inputs: [{ sourceId: "src-contracts", trigger: null }],
      steps: [{ operation: "/api/v1/misc/compress-pdf", parameters: {} }],
      output: { type: "inline", options: {} },
      outputIds: ["src-contracts"],
    },
    {
      // A chain long enough to overflow the builder's graph column, which is where the graph has to
      // start scrolling instead of pushing the inspector off the page.
      id: "plc-long",
      name: "Full document pipeline",
      owner: "ops@acme.com",
      enabled: true,
      inputs: [{ sourceId: "src-claims", trigger: null }],
      steps: [
        { operation: "/api/v1/misc/repair", parameters: {} },
        { operation: "/api/v1/misc/ocr-pdf", parameters: {} },
        { operation: "/api/v1/general/rotate-pdf", parameters: {} },
        { operation: "/api/v1/general/crop", parameters: {} },
        { operation: "/api/v1/general/remove-pages", parameters: {} },
        { operation: "/api/v1/misc/add-page-numbers", parameters: {} },
        { operation: "/api/v1/security/add-watermark", parameters: {} },
        { operation: "/api/v1/security/sanitize-pdf", parameters: {} },
        { operation: "/api/v1/misc/flatten", parameters: {} },
        { operation: "/api/v1/misc/compress-pdf", parameters: {} },
      ],
      output: { type: "inline", options: {} },
      outputIds: ["src-archive"],
    },
    {
      id: "plc-onboarding",
      name: "Onboarding OCR (paused)",
      owner: "ops@acme.com",
      enabled: false,
      inputs: [],
      steps: [
        { operation: "/api/v1/misc/ocr-pdf", parameters: {} },
        { operation: "/api/v1/misc/flatten", parameters: {} },
      ],
      output: { type: "inline", options: {} },
      outputIds: [],
    },
  ];
}

let store: StoredPolicy[] = seedPipelines();

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `plc_${Date.now().toString(36)}_${idCounter}`;
}

/** Stored supporting files a step binds as `asset:<id>` (PolicyAssetController), for mock mode. */
interface StoredAsset {
  id: string;
  fileName: string;
  contentType: string | null;
  size: number;
  createdAt: number;
}
let assetStore: StoredAsset[] = [];
let assetCounter = 0;
function nextAssetId(): string {
  assetCounter += 1;
  return `ast_${Date.now().toString(36)}_${assetCounter}`;
}

// A pipeline-store record has inputs/outputIds; a catalogue record (WirePolicy) does not, so both
// are read defensively here.
type OverviewPolicy = Partial<Policy> & {
  id: string;
  name: string;
  enabled: boolean;
};

function toView(policy: OverviewPolicy): PipelineView {
  const inputs = policy.inputs ?? [];
  const outputIds = policy.outputIds ?? [];
  const triggers = [
    ...new Set(
      inputs
        .map((input) => input.trigger?.type)
        .filter((type): type is string => type != null),
    ),
  ];
  return {
    id: policy.id,
    name: policy.name,
    enabled: policy.enabled,
    required: policy.required ?? false,
    status: policy.enabled ? "active" : "paused",
    trigger: triggers.length === 0 ? "manual" : triggers.join(", "),
    sources: inputs.map((input) => ({
      id: input.sourceId,
      name: SOURCE_NAMES[input.sourceId] ?? input.sourceId,
    })),
    steps: policy.steps?.map((s) => s.operation) ?? [],
    output:
      outputIds.length > 0
        ? outputIds.map((id) => SOURCE_NAMES[id] ?? id).join(", ")
        : (policy.output?.type ?? "inline"),
    owner: policy.owner ?? "you@acme.com",
  };
}

function buildKpis(policies: OverviewPolicy[]): PipelineKpi[] {
  const total = policies.length;
  const active = policies.filter((p) => p.enabled).length;
  return [
    { value: total, description: "pipelines" },
    { value: active, description: "running automatically" },
    { value: total - active, description: "paused" },
  ];
}

// The unified overview lists EVERY policy (pipelines + catalogue), mirroring the real backend now
// that the catalogue filter is gone. The two mock stores are joined here, deduped by id.
function buildOverview(): PipelinesOverviewResponse {
  const byId = new Map<string, OverviewPolicy>();
  for (const p of store) byId.set(p.id, p);
  for (const p of getCataloguePolicies())
    if (!byId.has(p.id)) byId.set(p.id, p as OverviewPolicy);
  const all = [...byId.values()];
  const pipelines = all
    .map(toView)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { kpis: buildKpis(all), pipelines };
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

  // Supporting files. Registered before the `/policies/:id` matcher so "assets" isn't read as an id.
  http.get("/api/v1/policies/assets", async () => {
    await delay(80);
    return HttpResponse.json(assetStore);
  }),

  http.post("/api/v1/policies/assets", async ({ request }) => {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return HttpResponse.json(
        { detail: "Uploaded file is empty" },
        { status: 400 },
      );
    }
    await delay(120);
    const asset: StoredAsset = {
      id: nextAssetId(),
      fileName: file.name || "asset",
      contentType: file.type || null,
      size: file.size,
      createdAt: Date.now(),
    };
    assetStore = [...assetStore, asset];
    return HttpResponse.json(asset);
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
    return HttpResponse.json({
      runIds: [`run_${Date.now().toString(36)}`],
      filesListed: 1,
      alreadyProcessed: 0,
      parked: 0,
      inFlight: 0,
    });
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
