import { http, HttpResponse, delay } from "msw";
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  seedPolicies,
  seedRuntime,
  emptyRuntime,
  type CatalogueEntry,
  type DecoratedPolicy,
  type PoliciesResponse,
  type PoliciesSummary,
  type Policy,
  type PolicyRowStatus,
  type PolicyRuntime,
  type PolicyState,
} from "@portal/mocks/policies";

/**
 * The portal exercises the REAL policy API base — `/api/v1/policies`, NOT the
 * portal's usual `/v1/...` — so this surface is plug-and-play against the live
 * backend (drop MSW and the same calls hit Stirling). These handlers mutate an
 * in-memory store, so create/delete/run behave like a real backend within a
 * session (see the notifications handler for the same stateful pattern).
 */

/** Configured policies, keyed by backend id (the source of truth). */
let store: Policy[] = seedPolicies();
/** Runtime extras the wire record doesn't carry (scope, stats, activity). */
let runtime: Record<string, PolicyRuntime> = seedRuntime();

export function resetPoliciesStore(
  seed?: Policy[],
  seedRt?: Record<string, PolicyRuntime>,
): void {
  store = seed ? [...seed] : seedPolicies();
  runtime = seedRt ? { ...seedRt } : seedRuntime();
}

let idCounter = 0;
function nextId(categoryId: string): string {
  idCounter += 1;
  return `pol_${categoryId}_${Date.now().toString(36)}_${idCounter}`;
}

/** Derive the display status from the wire `enabled` flag. */
function rowStatus(policy: Policy): PolicyRowStatus {
  return policy.enabled ? "active" : "paused";
}

/** Build the decorated runtime view the catalogue/detail consumes. */
function decorate(policy: Policy): DecoratedPolicy | null {
  const category = POLICY_CATEGORIES.find((c) => c.id === policy.categoryId);
  const config = POLICY_CONFIG[policy.categoryId];
  if (!category || !config) return null;
  const rt = runtime[policy.id] ?? emptyRuntime();
  const status = rowStatus(policy);
  const state: PolicyState = {
    configured: true,
    status: status === "paused" ? "paused" : "active",
    sources: policy.sources.map((s) => s.source),
    scopeTypes: rt.scopeTypes,
    reviewerEmail: rt.reviewerEmail,
    fieldValues: rt.fieldValues,
    outputMode: policy.output.mode,
    outputName: policy.output.name,
    runOn: policy.trigger?.event ?? "upload",
    backendId: policy.id,
    isDefault: rt.isDefault,
  };
  return {
    category,
    config,
    state,
    steps: policy.steps,
    stats: rt.stats,
    activity: rt.activity,
  };
}

/** The full catalogue response: every category, each with its policy (or null). */
function buildResponse(): PoliciesResponse {
  const byCategory = new Map<string, Policy>();
  for (const p of store) byCategory.set(p.categoryId, p);

  const catalogue: CatalogueEntry[] = POLICY_CATEGORIES.map((category) => {
    const policy = byCategory.get(category.id);
    return {
      category,
      config: POLICY_CONFIG[category.id],
      policy: policy ? decorate(policy) : null,
    };
  });

  const active = store.filter((p) => p.enabled).length;
  const paused = store.filter((p) => !p.enabled).length;
  const docsEnforced = store
    .filter((p) => p.enabled)
    .reduce((sum, p) => sum + (runtime[p.id]?.stats.enforced ?? 0), 0);
  const summary: PoliciesSummary = {
    active,
    paused,
    categories: POLICY_CATEGORIES.length,
    docsEnforced,
  };

  return { summary, catalogue };
}

export const policiesHandlers = [
  // List — the catalogue (categories + configs + configured policies).
  http.get("/api/v1/policies", async () => {
    await delay(120);
    return HttpResponse.json(buildResponse());
  }),

  // Get one stored policy by id (the raw wire record).
  http.get("/api/v1/policies/:id", async ({ params }) => {
    await delay(120);
    const policy = store.find((p) => p.id === params.id);
    if (!policy) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(policy);
  }),

  // Create or update — a blank id is assigned (create) or matched (update).
  // One policy per category: a create for a category that already has one
  // replaces it, matching the editor's "one policy per category, ever".
  http.post("/api/v1/policies", async ({ request }) => {
    await delay(120);
    const incoming = (await request.json()) as Policy;
    const existing = incoming.id
      ? store.find((p) => p.id === incoming.id)
      : store.find((p) => p.categoryId === incoming.categoryId);
    const id = existing?.id ?? nextId(incoming.categoryId);
    const saved: Policy = {
      ...incoming,
      id,
      owner: existing?.owner ?? "you@acme.com",
    };
    store = existing
      ? store.map((p) => (p.id === id ? saved : p))
      : [...store, saved];
    // Seed runtime for a brand-new policy so the detail panel has somewhere to
    // read from; an update keeps whatever runtime it already had.
    if (!runtime[id]) runtime[id] = emptyRuntime();
    return HttpResponse.json(saved);
  }),

  // Delete a stored policy by id.
  http.delete("/api/v1/policies/:id", async ({ params }) => {
    await delay(120);
    const id = String(params.id);
    const existed = store.some((p) => p.id === id);
    if (!existed) return new HttpResponse(null, { status: 404 });
    store = store.filter((p) => p.id !== id);
    delete runtime[id];
    return new HttpResponse(null, { status: 204 });
  }),

  // Run a stored policy now. The real endpoint is multipart (files) and returns
  // a run id; the portal has no files, so the mock just acknowledges with a run
  // id and nudges the activity feed so the run is visible.
  http.post("/api/v1/policies/:id/run", async ({ params }) => {
    await delay(120);
    const id = String(params.id);
    const policy = store.find((p) => p.id === id);
    if (!policy) return new HttpResponse(null, { status: 404 });
    const rt = runtime[id] ?? emptyRuntime();
    runtime[id] = {
      ...rt,
      activity: [
        {
          doc: "manual-run.pdf",
          action: "Enforcing…",
          time: "just now",
          status: "processing",
        },
        ...rt.activity,
      ],
    };
    const runId = `run_${Date.now().toString(36)}`;
    return HttpResponse.json({ status: true, fileId: runId, message: null });
  }),
];
