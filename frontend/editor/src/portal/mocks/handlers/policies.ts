import { http, HttpResponse, delay } from "msw";
import {
  seedPolicies,
  seedPolicyRuns,
  type WirePolicy,
} from "@portal/mocks/policies";
import type { PolicyRunView } from "@shared/policies/types";

/**
 * The portal exercises the REAL policy API base — `/api/v1/policies`, NOT the
 * portal's usual `/v1/...` — so this surface is plug-and-play against the live
 * backend (drop MSW and the same calls hit Stirling).
 *
 * These handlers speak the backend's actual wire contract:
 * - GET /api/v1/policies        → WirePolicy[]
 * - GET /api/v1/policies/runs   → PolicyRunView[]
 * - POST /api/v1/policies       → WirePolicy (create / update)
 * - DELETE /api/v1/policies/:id → 204
 *
 * The decorated catalogue (summary, category grouping, stats) is assembled
 * client-side in api/policies.ts#fetchPolicies(), mirroring the real backend.
 */

let store: WirePolicy[] = seedPolicies();
let runs: PolicyRunView[] = seedPolicyRuns();

export function resetPoliciesStore(
  seed?: WirePolicy[],
  seedRuns?: PolicyRunView[],
): void {
  store = seed ? [...seed] : seedPolicies();
  runs = seedRuns ? [...seedRuns] : seedPolicyRuns();
}

let idCounter = 0;
function nextId(categoryId: string): string {
  idCounter += 1;
  return `pol_${categoryId}_${Date.now().toString(36)}_${idCounter}`;
}

function categoryId(wire: WirePolicy): string {
  return (wire.output?.options?.categoryId as string | undefined) ?? "";
}

export const policiesHandlers = [
  http.get("/api/v1/policies", async () => {
    await delay(120);
    return HttpResponse.json(store);
  }),

  http.get("/api/v1/policies/runs", async () => {
    await delay(120);
    return HttpResponse.json(runs);
  }),

  http.get("/api/v1/policies/:id", async ({ params }) => {
    await delay(120);
    const policy = store.find((p) => p.id === params.id);
    if (!policy) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(policy);
  }),

  // Create or update — one policy per category: a create for a category that
  // already has one replaces it, matching the editor's contract.
  http.post("/api/v1/policies", async ({ request }) => {
    await delay(120);
    const incoming = (await request.json()) as WirePolicy;
    const catId = categoryId(incoming);
    const existing = incoming.id
      ? store.find((p) => p.id === incoming.id)
      : store.find((p) => categoryId(p) === catId);
    const id = existing?.id ?? nextId(catId);
    const saved: WirePolicy = {
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
    await delay(120);
    const id = String(params.id);
    if (!store.some((p) => p.id === id))
      return new HttpResponse(null, { status: 404 });
    store = store.filter((p) => p.id !== id);
    runs = runs.filter((r) => r.policyId !== id);
    return new HttpResponse(null, { status: 204 });
  }),
];
